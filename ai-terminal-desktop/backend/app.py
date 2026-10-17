"""FastAPI 桌面后端主服务：整合 WebSocket 终端流、VPS 资产、SFTP 与 AI Copilot 接口."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Dict, List, Optional, Union

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import httpx

from ai_service import AIService
from host_store import HostStore
from pty_session import PTYSession
from ssh_session import SSHSession

app = FastAPI(title="AI Terminal Desktop Backend")

# 启用跨域允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 核心单例服务
host_store = HostStore()
ai_service = AIService()

# 活跃会话表 session_id -> PTYSession | SSHSession
active_sessions: Dict[str, Any] = {}


# --- 轻量探针路由 (毫秒级响应，无需访问数据库，供 Electron 启动探活) ---
@app.get("/health")
@app.get("/api/health")
def health_probe():
    return {
        "status": "ok",
        "app": "AI Terminal Desktop",
        "version": "1.0.0",
        "platform": sys.platform,
    }


# --- 数据模型 ---
class HostCreateRequest(BaseModel):
    name: str
    ip: str
    port: int = 22
    username: str = "root"
    auth_type: str = "password"  # password | key
    secret: str = ""
    group_name: str = "默认分组"
    description: str = ""


class SessionCreateRequest(BaseModel):
    type: str = "local"  # "local" | "ssh"
    host_id: Optional[str] = None
    cols: int = 80
    rows: int = 24


class AIAskRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    os_info: Optional[Union[dict, str]] = None
    history: Optional[list] = None


class AIDiagnoseRequest(BaseModel):
    command: str
    screen_output: str
    session_id: Optional[str] = None
    exit_code: int = 1
    os_info: Optional[Union[dict, str]] = None


class AIExplainRequest(BaseModel):
    command: str


class AIAnalyzeOutputRequest(BaseModel):
    query: str
    command: str
    output: str
    session_id: Optional[str] = None
    os_info: Optional[Union[dict, str]] = None


class AIAgentStepRequest(BaseModel):
    task: str
    step: int = 1
    max_steps: int = 5
    history: Optional[list] = None
    last_output: Optional[str] = None
    session_id: Optional[str] = None
    os_info: Optional[Union[dict, str]] = None



class AIConfigRequest(BaseModel):
    api_key: str
    base_url: str
    model: str
    temperature: float = 0.2
    auto_execute_safe: bool = False


class GroupCreateRequest(BaseModel):
    name: str


class GroupUpdateRequest(BaseModel):
    name: str


class HostMoveRequest(BaseModel):
    group_name: str


class HostUpdateRequest(BaseModel):
    name: str
    ip: str
    port: int = 22
    username: str = "root"
    auth_type: str = "password"
    secret: Optional[str] = None
    group_name: str = "默认分组"
    description: str = ""


# --- 主机与分组资产路由 ---
@app.get("/api/hosts")
def get_hosts():
    return host_store.list_hosts()


@app.post("/api/hosts")
def create_host(req: HostCreateRequest):
    host_id = host_store.add_host(
        name=req.name,
        ip=req.ip,
        port=req.port,
        username=req.username,
        auth_type=req.auth_type,
        secret=req.secret,
        group_name=req.group_name,
        description=req.description,
    )
    return {"id": host_id, "status": "created"}


@app.put("/api/hosts/{host_id}")
def update_host(host_id: str, req: HostUpdateRequest):
    host_store.update_host(
        host_id=host_id,
        name=req.name,
        ip=req.ip,
        port=req.port,
        username=req.username,
        auth_type=req.auth_type,
        secret=req.secret,
        group_name=req.group_name,
        description=req.description,
    )
    return {"status": "updated"}


@app.post("/api/hosts/{host_id}/move")
def move_host(host_id: str, req: HostMoveRequest):
    host_store.move_host_to_group(host_id, req.group_name)
    return {"status": "moved"}


@app.delete("/api/hosts/{host_id}")
def delete_host(host_id: str):
    host_store.delete_host(host_id)
    return {"status": "deleted"}


@app.get("/api/groups")
def get_groups():
    return host_store.list_groups()


@app.post("/api/groups")
def create_group(req: GroupCreateRequest):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="分组名称不能为空")
    grp_id = host_store.add_group(name)
    return {"id": grp_id, "name": name, "status": "created"}


@app.put("/api/groups/{group_id}")
def update_group(group_id: str, req: GroupUpdateRequest):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="分组名称不能为空")
    try:
        host_store.rename_group(group_id, name)
        return {"id": group_id, "name": name, "status": "updated"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/groups/{group_id}")
def delete_group(group_id: str):
    try:
        host_store.delete_group(group_id)
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class SnippetCreateRequest(BaseModel):
    name: str
    category: str = "自定义命令"
    description: str = ""
    script: str


class SnippetUpdateRequest(BaseModel):
    name: str
    category: str = "自定义命令"
    description: str = ""
    script: str


@app.get("/api/snippets")
def get_snippets():
    return host_store.list_snippets()


@app.post("/api/snippets")
def create_snippet(req: SnippetCreateRequest):
    try:
        snip_id = host_store.add_snippet(
            name=req.name,
            category=req.category,
            description=req.description,
            script=req.script,
        )
        return {"id": snip_id, "status": "created"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/snippets/{snippet_id}")
def update_snippet(snippet_id: str, req: SnippetUpdateRequest):
    try:
        host_store.update_snippet(
            snippet_id=snippet_id,
            name=req.name,
            category=req.category,
            description=req.description,
            script=req.script,
        )
        return {"id": snippet_id, "status": "updated"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/snippets/{snippet_id}")
def delete_snippet(snippet_id: str):
    host_store.delete_snippet(snippet_id)
    return {"status": "deleted"}


import os

# --- 会话创建路由 ---
@app.post("/api/session/create")
def create_session(req: SessionCreateRequest):
    session_id = str(uuid.uuid4())[:8]

    if req.type == "local":
        active_sessions[session_id] = {
            "type": "local",
            "name": "本地终端 (macOS)",
            "instance": None,
            "cols": req.cols,
            "rows": req.rows,
            "os_info": {
                "os_name": "Darwin",
                "distro": "macOS",
                "arch": "arm64",
                "username": os.getenv("USER", "user"),
                "is_root": False,
            },
        }
        return {"session_id": session_id, "type": "local", "name": "本地终端"}

    elif req.type == "ssh":
        if not req.host_id:
            raise HTTPException(status_code=400, detail="SSH 会话必须指定 host_id")
        cred = host_store.get_host_credentials(req.host_id)
        if not cred:
            raise HTTPException(status_code=404, detail="未找到目标主机")

        active_sessions[session_id] = {
            "type": "ssh",
            "host_id": req.host_id,
            "name": cred["name"],
            "ip": cred["ip"],
            "port": cred["port"],
            "username": cred["username"],
            "auth_type": cred["auth_type"],
            "secret": cred["secret"],
            "cols": req.cols,
            "rows": req.rows,
            "instance": None,
            "os_info": {
                "os_name": "Linux",
                "distro": cred["name"],
                "arch": "x86_64",
                "username": cred["username"],
                "is_root": (cred["username"] == "root"),
            },
        }
        return {"session_id": session_id, "type": "ssh", "name": cred["name"], "ip": cred["ip"]}

    raise HTTPException(status_code=400, detail="不支持的会话类型")


@app.get("/api/session/{session_id}/info")
def get_session_info(session_id: str):
    session_info = active_sessions.get(session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail="会话不存在或已断开")
    instance = session_info.get("instance")
    os_info = getattr(instance, "os_info", None) or session_info.get("os_info") or {}
    return {
        "session_id": session_id,
        "type": session_info.get("type"),
        "name": session_info.get("name", "本地终端" if session_info.get("type") == "local" else "SSH 会话"),
        "ip": session_info.get("ip"),
        "os_info": os_info,
    }


@app.get("/api/session/{session_id}/metrics")
def get_session_metrics(session_id: str):
    session_info = active_sessions.get(session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail="会话不存在或已断开")
    instance = session_info.get("instance")
    if instance and hasattr(instance, "get_metrics"):
        return instance.get_metrics()
    return {
        "online": True,
        "cpu": {"percent": 0.0, "cores": 1},
        "memory": {"total_str": "--", "used_str": "--", "percent": 0.0},
        "swap": {"total_str": "--", "used_str": "--", "percent": 0.0},
        "disk": {"total_str": "--", "used_str": "--", "percent": 0.0},
        "network": {"rx_str": "--", "tx_str": "--", "rx_rate": 0, "tx_rate": 0},
        "load": {"load_1": 0.0, "load_5": 0.0, "load_15": 0.0, "procs": "--"},
        "uptime": {"seconds": 0, "str": "准备中..."},
    }


# --- WebSocket 终端全双工流 ---
@app.websocket("/ws/terminal/{session_id}")
async def websocket_terminal(websocket: WebSocket, session_id: str):
    await websocket.accept()

    session_info = active_sessions.get(session_id)
    if not session_info:
        await websocket.send_text("\r\n\x1b[31m[错误: 会话不存在或已过期]\x1b[0m\r\n")
        await websocket.close()
        return

    async def send_to_client(data: bytes):
        try:
            await websocket.send_bytes(data)
        except Exception:
            pass

    terminal_instance = None
    try:
        if session_info["type"] == "local":
            terminal_instance = PTYSession(cols=session_info["cols"], rows=session_info["rows"])
            terminal_instance.start(send_to_client)
            session_info["instance"] = terminal_instance
            session_info["os_info"] = terminal_instance.os_info

        elif session_info["type"] == "ssh":
            await websocket.send_text(f"\r\n\x1b[36m正在连接到 {session_info['ip']}:{session_info['port']} ...\x1b[0m\r\n")
            terminal_instance = SSHSession(
                host=session_info["ip"],
                port=session_info["port"],
                username=session_info["username"],
                password=session_info["secret"] if session_info["auth_type"] == "password" else None,
                private_key_str=session_info["secret"] if session_info["auth_type"] == "key" else None,
                cols=session_info["cols"],
                rows=session_info["rows"],
            )
            # 在单独线程启动 SSH
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, terminal_instance.connect, send_to_client, loop)
            session_info["instance"] = terminal_instance
            session_info["os_info"] = terminal_instance.os_info

        # 接收前端交互
        while True:
            msg = await websocket.receive()
            if "bytes" in msg and msg["bytes"]:
                terminal_instance.write(msg["bytes"])
            elif "text" in msg and msg["text"]:
                text_data = msg["text"]
                # 检查是否是控制协议 (如 resize)
                if text_data.startswith("{") and text_data.endswith("}"):
                    try:
                        cmd_obj = json.loads(text_data)
                        if cmd_obj.get("type") == "resize":
                            terminal_instance.resize(cmd_obj["cols"], cmd_obj["rows"])
                            continue
                    except Exception:
                        pass
                terminal_instance.write(text_data)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(f"\r\n\x1b[31m[终端连接异常: {str(e)}]\x1b[0m\r\n")
        except Exception:
            pass
    finally:
        if terminal_instance:
            terminal_instance.close()
        active_sessions.pop(session_id, None)


# --- AI Copilot 路由 ---
@app.post("/api/ai/ask")
def ai_ask(req: AIAskRequest):
    os_info = req.os_info
    # 如果指定了 session_id，优先提取该终端会话真实探测到的远程操作系统信息
    if req.session_id and req.session_id in active_sessions:
        s = active_sessions[req.session_id]
        instance = s.get("instance")
        session_os = getattr(instance, "os_info", None) or s.get("os_info")
        if session_os:
            os_info = session_os

    return ai_service.ask_command(
        query=req.query,
        os_info=os_info,
        history=req.history,
    )


@app.post("/api/ai/diagnose")
def ai_diagnose(req: AIDiagnoseRequest):
    os_info = req.os_info
    if req.session_id and req.session_id in active_sessions:
        s = active_sessions[req.session_id]
        instance = s.get("instance")
        session_os = getattr(instance, "os_info", None) or s.get("os_info")
        if session_os:
            os_info = session_os

    return ai_service.diagnose_terminal_error(
        command=req.command,
        screen_output=req.screen_output,
        exit_code=req.exit_code,
        os_info=os_info,
    )


@app.post("/api/ai/explain")
def ai_explain(req: AIExplainRequest):
    explanation = ai_service.explain_flags(req.command)
    return {"command": req.command, "explanation": explanation}


@app.post("/api/ai/analyze_output")
def ai_analyze_output(req: AIAnalyzeOutputRequest):
    os_info = req.os_info
    if req.session_id and req.session_id in active_sessions:
        s = active_sessions[req.session_id]
        instance = s.get("instance")
        session_os = getattr(instance, "os_info", None) or s.get("os_info")
        if session_os:
            os_info = session_os

    answer = ai_service.analyze_output(
        query=req.query,
        command=req.command,
        output=req.output,
        os_info=os_info,
    )
    return {"answer": answer}


@app.post("/api/ai/agent_step")
def ai_agent_step(req: AIAgentStepRequest):
    os_info = req.os_info
    if req.session_id and req.session_id in active_sessions:
        s = active_sessions[req.session_id]
        instance = s.get("instance")
        session_os = getattr(instance, "os_info", None) or s.get("os_info")
        if session_os:
            os_info = session_os

    return ai_service.agent_step(
        task=req.task,
        step=req.step,
        max_steps=req.max_steps,
        history=req.history,
        last_output=req.last_output,
        os_info=os_info,
    )



class FetchModelsRequest(BaseModel):
    base_url: str
    api_key: str


class AIProfileRequest(BaseModel):
    name: str
    base_url: str
    api_key: str
    model: str
    id: Optional[str] = None


@app.post("/api/ai/models")
def fetch_models(req: FetchModelsRequest):
    try:
        models = ai_service.fetch_available_models(req.base_url, req.api_key)
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/ai/profiles")
def get_ai_profiles():
    return host_store.list_ai_profiles()


@app.post("/api/ai/profiles")
def save_ai_profile(req: AIProfileRequest):
    pid = host_store.save_ai_profile(
        name=req.name,
        base_url=req.base_url,
        api_key=req.api_key,
        model=req.model,
        profile_id=req.id,
    )
    return {"id": pid, "status": "saved"}


@app.delete("/api/ai/profiles/{profile_id}")
def delete_ai_profile(profile_id: str):
    host_store.delete_ai_profile(profile_id)
    return {"status": "deleted"}


@app.get("/api/ai/config")
def get_ai_config():
    conf = ai_service.config
    return {
        "api_key": conf.api_key or "",
        "base_url": conf.base_url,
        "model": conf.model,
        "temperature": conf.temperature,
        "auto_execute_safe": conf.auto_execute_safe,
    }


@app.post("/api/ai/config")
def update_ai_config(req: AIConfigRequest):
    from aiterm.config import Config
    clean_url = (req.base_url or "").strip().rstrip("/")
    if not (clean_url.endswith("/v1") or clean_url.endswith("/v2") or clean_url.endswith("/v4") or "/compatible-mode" in clean_url):
        clean_url = f"{clean_url}/v1"

    new_conf = Config(
        api_key=req.api_key,
        base_url=clean_url,
        model=req.model,
        temperature=req.temperature,
        auto_execute_safe=req.auto_execute_safe,
    )
    ai_service.reload_config(new_conf)
    return {"status": "updated"}


# --- 文件管理路由 (SFTP / 本地) ---
class FilePathRequest(BaseModel):
    path: str


class FileRenameRequest(BaseModel):
    old_path: str
    new_path: str


class FileTextRequest(BaseModel):
    path: str
    content: str


def _get_session_instance(session_id: str):
    session_info = active_sessions.get(session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail="会话不存在或已关闭")
    instance = session_info.get("instance")
    if not instance:
        raise HTTPException(status_code=400, detail="会话未就绪")
    return instance


@app.get("/api/session/{session_id}/files")
def list_session_files(session_id: str, path: str = "."):
    instance = _get_session_instance(session_id)
    try:
        return instance.list_dir(path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/sftp/list")
def sftp_list_compat(session_id: str, path: str = "."):
    # 兼容旧接口
    instance = _get_session_instance(session_id)
    try:
        return instance.list_dir(path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/session/{session_id}/files/download")
def download_session_file(session_id: str, path: str):
    instance = _get_session_instance(session_id)
    import posixpath
    import urllib.parse
    clean_path = path.strip()
    if not clean_path:
        raise HTTPException(status_code=400, detail="文件路径不能为空")
    filename = posixpath.basename(clean_path.rstrip("/")) or "download"
    encoded_filename = urllib.parse.quote(filename)
    try:
        stream = instance.read_file_stream(clean_path)
        return StreamingResponse(
            stream,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            },
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"下载文件失败: {str(e)}")


@app.post("/api/session/{session_id}/files/upload")
async def upload_session_file(session_id: str, request: Request, path: str):
    instance = _get_session_instance(session_id)
    import os
    import tempfile
    clean_path = path.strip()
    if not clean_path:
        raise HTTPException(status_code=400, detail="上传目标路径不能为空")
    
    temp_file = tempfile.NamedTemporaryFile(delete=False)
    temp_path = temp_file.name
    try:
        async for chunk in request.stream():
            if chunk:
                temp_file.write(chunk)
        temp_file.close()

        def chunk_iter():
            with open(temp_path, "rb") as f:
                while True:
                    b = f.read(65536)
                    if not b:
                        break
                    yield b

        instance.write_file_stream(clean_path, chunk_iter())
        return {"status": "uploaded", "path": clean_path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"上传写入失败: {str(e)}")
    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass


@app.delete("/api/session/{session_id}/files")
def delete_session_file(session_id: str, path: str):
    instance = _get_session_instance(session_id)
    clean_path = path.strip()
    if not clean_path:
        raise HTTPException(status_code=400, detail="删除路径不能为空")
    try:
        instance.delete_item(clean_path)
        return {"status": "deleted", "path": clean_path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"删除失败: {str(e)}")


@app.post("/api/session/{session_id}/files/mkdir")
def mkdir_session_file(session_id: str, req: FilePathRequest):
    instance = _get_session_instance(session_id)
    clean_path = req.path.strip()
    if not clean_path:
        raise HTTPException(status_code=400, detail="目录路径不能为空")
    try:
        instance.make_dir(clean_path)
        return {"status": "created", "path": clean_path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"新建目录失败: {str(e)}")


@app.post("/api/session/{session_id}/files/rename")
def rename_session_file(session_id: str, req: FileRenameRequest):
    instance = _get_session_instance(session_id)
    old_p = req.old_path.strip()
    new_p = req.new_path.strip()
    if not old_p or not new_p:
        raise HTTPException(status_code=400, detail="原路径和新路径不能为空")
    try:
        instance.rename_item(old_p, new_p)
        return {"status": "renamed", "old_path": old_p, "new_path": new_p}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"重命名失败: {str(e)}")


@app.get("/api/session/{session_id}/files/text")
def read_session_text_file(session_id: str, path: str):
    instance = _get_session_instance(session_id)
    clean_path = path.strip()
    if not clean_path:
        raise HTTPException(status_code=400, detail="文件路径不能为空")
    try:
        content = instance.read_text_file(clean_path)
        return {"path": clean_path, "content": content}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取文件失败: {str(e)}")


@app.post("/api/session/{session_id}/files/text")
def write_session_text_file(session_id: str, req: FileTextRequest):
    instance = _get_session_instance(session_id)
    clean_path = req.path.strip()
    if not clean_path:
        raise HTTPException(status_code=400, detail="文件路径不能为空")
    try:
        instance.write_text_file(clean_path, req.content)
        return {"status": "saved", "path": clean_path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"保存文件失败: {str(e)}")


class FileExtractRequest(BaseModel):
    path: str
    target_dir: Optional[str] = None


class FileCompressRequest(BaseModel):
    paths: List[str]
    archive_name: str
    archive_type: str = "tar.gz"


class FileChmodRequest(BaseModel):
    path: str
    mode: str
    recursive: bool = False


@app.post("/api/session/{session_id}/files/extract")
def extract_session_file(session_id: str, req: FileExtractRequest):
    instance = _get_session_instance(session_id)
    try:
        return instance.extract_archive(req.path, req.target_dir)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"解压失败: {str(e)}")


@app.post("/api/session/{session_id}/files/compress")
def compress_session_files(session_id: str, req: FileCompressRequest):
    instance = _get_session_instance(session_id)
    try:
        return instance.compress_files(req.paths, req.archive_name, req.archive_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"压缩失败: {str(e)}")


@app.post("/api/session/{session_id}/files/chmod")
def chmod_session_file(session_id: str, req: FileChmodRequest):
    instance = _get_session_instance(session_id)
    try:
        return instance.chmod_item(req.path, req.mode, req.recursive)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"修改权限失败: {str(e)}")


@app.get("/api/session/{session_id}/files/search")
def search_session_files(session_id: str, path: str = ".", query: str = ""):
    instance = _get_session_instance(session_id)
    try:
        return {"results": instance.search_files(path, query)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"搜索失败: {str(e)}")


@app.get("/api/session/{session_id}/files/big_files")
def big_files_session(session_id: str, path: str = "/", min_size_mb: int = 50):
    instance = _get_session_instance(session_id)
    try:
        return {"results": instance.find_big_files(path, min_size_mb)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"查找大文件失败: {str(e)}")


# --- 运维与排障：端口与进程管理 ---
class ProcessKillRequest(BaseModel):
    pid: int
    signal: Union[int, str] = 9
    session_id: Optional[str] = None


@app.get("/api/session/{session_id}/system/ports")
@app.get("/api/system/ports/{session_id}")
def get_system_ports(session_id: str):
    instance = _get_session_instance(session_id)
    try:
        return {"ports": instance.get_system_ports()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取端口监听列表失败: {str(e)}")


@app.get("/api/session/{session_id}/system/processes")
@app.get("/api/system/processes/{session_id}")
def get_system_processes(session_id: str, limit: int = 35):
    instance = _get_session_instance(session_id)
    try:
        return {"processes": instance.get_system_processes(limit=limit)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取系统进程列表失败: {str(e)}")


@app.post("/api/session/{session_id}/system/kill")
@app.post("/api/system/kill")
def kill_system_process(req: ProcessKillRequest, session_id: Optional[str] = None):
    actual_sid = session_id or req.session_id
    if not actual_sid:
        raise HTTPException(status_code=400, detail="缺少 session_id")
    instance = _get_session_instance(actual_sid)

    sig_val = req.signal
    if isinstance(sig_val, str):
        sig_upper = sig_val.upper().replace("SIG", "").strip()
        if sig_upper in ("TERM", "15"):
            sig_val = 15
        elif sig_upper in ("KILL", "9"):
            sig_val = 9
        elif sig_upper.isdigit():
            sig_val = int(sig_upper)
        else:
            sig_val = 9

    try:
        return instance.kill_process(req.pid, sig_val)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"终止进程失败: {str(e)}")


# --- 运维与排障：Docker 可视化管理 ---
class DockerActionRequest(BaseModel):
    container_id: str
    action: str
    session_id: Optional[str] = None


@app.get("/api/session/{session_id}/docker/containers")
@app.get("/api/docker/containers/{session_id}")
def get_docker_containers(session_id: str):
    instance = _get_session_instance(session_id)
    try:
        return instance.get_docker_containers()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取 Docker 容器列表失败: {str(e)}")


@app.post("/api/session/{session_id}/docker/action")
@app.post("/api/docker/action")
def docker_container_action(req: DockerActionRequest, session_id: Optional[str] = None):
    actual_sid = session_id or req.session_id
    if not actual_sid:
        raise HTTPException(status_code=400, detail="缺少 session_id")
    instance = _get_session_instance(actual_sid)
    try:
        return instance.docker_action(req.container_id, req.action)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"执行 Docker 操作失败: {str(e)}")


@app.get("/api/session/{session_id}/docker/logs")
@app.get("/api/docker/logs/{session_id}/{container_id}")
def get_docker_logs(session_id: str, container_id: Optional[str] = None, tail: int = 150):
    instance = _get_session_instance(session_id)
    if not container_id:
        raise HTTPException(status_code=400, detail="缺少 container_id")
    try:
        return {"logs": instance.get_docker_logs(container_id, tail)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取容器日志失败: {str(e)}")


# --- 运维与排障：AI 全景体检 ---
@app.post("/api/session/{session_id}/system/health_check")
@app.get("/api/session/{session_id}/system/health_check")
@app.get("/api/system/health-check/{session_id}")
@app.post("/api/system/health-check/{session_id}")
def run_system_health_check(session_id: str):
    instance = _get_session_instance(session_id)
    try:
        raw_data = instance.collect_health_data()
        os_info = raw_data.get("os_info") or getattr(instance, "os_info", None)
        report = ai_service.analyze_health_check(raw_data.get("raw", ""), os_info)
        return report
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"健康体检失败: {str(e)}")


# --- 终端生产力：SSH 密钥对管理与自动化免密推送 ---
class SSHKeyGenerateRequest(BaseModel):
    name: str
    key_type: str = "ed25519"


class SSHKeyDeployRequest(BaseModel):
    key_id: str
    host_id: str


@app.get("/api/ssh_keys")
@app.get("/api/keys")
def list_ssh_keys():
    return host_store.list_ssh_keys()


@app.post("/api/ssh_keys/generate")
@app.post("/api/keys/generate")
def generate_ssh_key(req: SSHKeyGenerateRequest):
    try:
        return host_store.generate_ssh_key(req.name, req.key_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"生成密钥对失败: {str(e)}")


@app.get("/api/ssh_keys/{key_id}/private")
@app.get("/api/keys/{key_id}/private")
def get_ssh_key_private(key_id: str):
    try:
        priv = host_store.get_ssh_key_private(key_id)
        if not priv:
            raise HTTPException(status_code=404, detail="私钥未找到")
        return {"key_id": key_id, "private_key": priv}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取私钥失败: {str(e)}")


@app.delete("/api/ssh_keys/{key_id}")
@app.delete("/api/keys/{key_id}")
def delete_ssh_key(key_id: str):
    try:
        host_store.delete_ssh_key(key_id)
        return {"status": "deleted", "key_id": key_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"删除密钥失败: {str(e)}")


@app.post("/api/ssh_keys/deploy")
@app.post("/api/keys/deploy")
def deploy_ssh_key(req: SSHKeyDeployRequest):
    try:
        return host_store.deploy_ssh_key_to_host(req.key_id, req.host_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"部署密钥到主机失败: {str(e)}")


# --- 托管前端构建产物 (SPA) ---
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import sys

if getattr(sys, "frozen", False):
    exe_dir = Path(sys.executable).resolve().parent
    meipass_dir = Path(getattr(sys, "_MEIPASS", exe_dir))
    candidates = [
        meipass_dir / "frontend" / "dist",
        meipass_dir / "_internal" / "frontend" / "dist",
        exe_dir / "frontend" / "dist",
        exe_dir / "_internal" / "frontend" / "dist",
        exe_dir.parent / "frontend" / "dist",
        exe_dir.parent / "Resources" / "backend" / "_internal" / "frontend" / "dist",
        Path.cwd() / "frontend" / "dist",
    ]
    DIST_DIR = next((p for p in candidates if p.exists()), candidates[0])
else:
    DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        try:
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
        except Exception as e:
            print(f"[Warning] Failed to mount /assets: {e}")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            raise HTTPException(status_code=404, detail="Not Found")
        target_file = DIST_DIR / full_path
        if target_file.is_file():
            return FileResponse(target_file)
        return FileResponse(DIST_DIR / "index.html")


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    import uvicorn
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8765,
        log_level="info",
        loop="asyncio",
        http="h11",
    )


