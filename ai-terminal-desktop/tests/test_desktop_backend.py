import os
import sys
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

# 确保路径加载
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "ai-terminal"))

from app import app


class TestDesktopBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_get_hosts(self):
        res = self.client.get("/api/hosts")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)

    def test_add_and_delete_host(self):
        # 添加测试主机
        payload = {
            "name": "Test-VPS",
            "ip": "1.2.3.4",
            "port": 22,
            "username": "root",
            "auth_type": "password",
            "secret": "mysecretpassword123",
            "group_name": "测试分组",
            "description": "单元测试主机",
        }
        create_res = self.client.post("/api/hosts", json=payload)
        self.assertEqual(create_res.status_code, 200)
        host_id = create_res.json().get("id")
        self.assertIsNotNone(host_id)

        # 检查列表包含
        list_res = self.client.get("/api/hosts")
        hosts = list_res.json()
        found = any(h["id"] == host_id for h in hosts)
        self.assertTrue(found)

        # 删除
        del_res = self.client.delete(f"/api/hosts/{host_id}")
        self.assertEqual(del_res.status_code, 200)

    def test_groups_crud_and_host_movement(self):
        # 1. 查询分组，默认分组必须存在
        res = self.client.get("/api/groups")
        self.assertEqual(res.status_code, 200)
        groups = res.json()
        names = [g["name"] for g in groups]
        self.assertIn("默认分组", names)

        # 2. 创建新分组
        c_res = self.client.post("/api/groups", json={"name": "香港特权组"})
        self.assertEqual(c_res.status_code, 200)
        gid = c_res.json()["id"]

        # 3. 创建主机并加入该分组
        h_res = self.client.post("/api/hosts", json={
            "name": "HK-Node-1",
            "ip": "45.1.2.3",
            "group_name": "香港特权组",
        })
        hid = h_res.json()["id"]

        # 4. 移动主机到新分组
        m_res = self.client.post(f"/api/hosts/{hid}/move", json={"group_name": "美西CN2"})
        self.assertEqual(m_res.status_code, 200)

        # 验证主机已在美西CN2
        hosts = self.client.get("/api/hosts").json()
        h_item = next(h for h in hosts if h["id"] == hid)
        self.assertEqual(h_item["group_name"], "美西CN2")

        # 5. 更新主机信息
        u_res = self.client.put(f"/api/hosts/{hid}", json={
            "name": "HK-Node-Renamed",
            "ip": "45.1.2.99",
            "port": 2222,
            "username": "admin",
            "auth_type": "password",
            "group_name": "美西CN2",
        })
        self.assertEqual(u_res.status_code, 200)
        hosts = self.client.get("/api/hosts").json()
        h_updated = next(h for h in hosts if h["id"] == hid)
        self.assertEqual(h_updated["name"], "HK-Node-Renamed")
        self.assertEqual(h_updated["port"], 2222)

        # 6. 重命名分组
        r_res = self.client.put(f"/api/groups/{gid}", json={"name": "香港VIP专区"})
        self.assertEqual(r_res.status_code, 200)

        # 7. 删除分组
        d_res = self.client.delete(f"/api/groups/{gid}")
        self.assertEqual(d_res.status_code, 200)

        # 清理测试主机
        self.client.delete(f"/api/hosts/{hid}")

    def test_get_snippets(self):
        res = self.client.get("/api/snippets")
        self.assertEqual(res.status_code, 200)
        snippets = res.json()
        self.assertTrue(len(snippets) > 0)
        # 验证包含我们预置的系统优化与 BBR
        names = [s["name"] for s in snippets]
        self.assertTrue(any("优化" in n for n in names))

    def test_custom_snippet_crud(self):
        # 1. 创建自定义命令
        payload = {
            "name": "Nginx 日志追踪",
            "category": "日常维护",
            "description": "实时查看 access.log",
            "script": "tail -n 100 -f /var/log/nginx/access.log",
        }
        c_res = self.client.post("/api/snippets", json=payload)
        self.assertEqual(c_res.status_code, 200)
        snip_id = c_res.json()["id"]

        # 2. 验证出现在列表中且 is_custom 为 1
        list_res = self.client.get("/api/snippets")
        snips = list_res.json()
        found = next(s for s in snips if s["id"] == snip_id)
        self.assertEqual(found["name"], "Nginx 日志追踪")
        self.assertEqual(found["is_custom"], 1)

        # 3. 编辑该自定义命令
        u_res = self.client.put(f"/api/snippets/{snip_id}", json={
            "name": "Nginx 日志追踪增强版",
            "category": "日常维护",
            "description": "实时查看 200 行",
            "script": "tail -n 200 -f /var/log/nginx/access.log",
        })
        self.assertEqual(u_res.status_code, 200)

        # 4. 删除该自定义命令
        d_res = self.client.delete(f"/api/snippets/{snip_id}")
        self.assertEqual(d_res.status_code, 200)

        # 验证已不存在
        snips_after = self.client.get("/api/snippets").json()
        self.assertFalse(any(s["id"] == snip_id for s in snips_after))

    def test_frontend_spa_serving(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("AI Terminal", res.text)

    def test_ai_profiles_crud(self):
        # 1. 检查默认预设包含 AgentRouter
        res = self.client.get("/api/ai/profiles")
        self.assertEqual(res.status_code, 200)
        profiles = res.json()
        self.assertTrue(len(profiles) > 0)
        names = [p["name"] for p in profiles]
        self.assertTrue(any("AgentRouter" in n for n in names))

        # 2. 新增预设档案
        payload = {
            "name": "My-Custom-Router",
            "base_url": "https://agentrouter.org/v1",
            "api_key": "sk-test123456",
            "model": "claude-3-5-sonnet-20241022",
        }
        create_res = self.client.post("/api/ai/profiles", json=payload)
        self.assertEqual(create_res.status_code, 200)
        pid = create_res.json()["id"]

        # 3. 验证存在并解密出 api_key
        list_res = self.client.get("/api/ai/profiles")
        found = [p for p in list_res.json() if p["id"] == pid]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["api_key"], "sk-test123456")

        # 4. 删除预设
        del_res = self.client.delete(f"/api/ai/profiles/{pid}")
        self.assertEqual(del_res.status_code, 200)

    def test_session_create_and_info(self):
        # 1. 创建本地会话
        res = self.client.post("/api/session/create", json={"type": "local"})
        self.assertEqual(res.status_code, 200)
        sess_id = res.json()["session_id"]

        # 2. 获取会话 info
        info_res = self.client.get(f"/api/session/{sess_id}/info")
        self.assertEqual(info_res.status_code, 200)
        info_data = info_res.json()
        self.assertEqual(info_data["type"], "local")
        self.assertIn("os_info", info_data)

        # 3. 获取实时性能指标 (FinalShell 监控数据源)
        metrics_res = self.client.get(f"/api/session/{sess_id}/metrics")
        self.assertEqual(metrics_res.status_code, 200)
        m_data = metrics_res.json()
        self.assertTrue(m_data["online"])
        self.assertIn("cpu", m_data)
        self.assertIn("memory", m_data)
        self.assertIn("disk", m_data)
        self.assertIn("network", m_data)
        self.assertIn("load", m_data)

    def test_ai_os_info_context_injection(self):
        from ai_service import AIService
        from aiterm.context import SystemContext

        svc = AIService()
        ctx = SystemContext(
            os_name="Darwin",
            os_version="14.0",
            architecture="arm64",
            distro="macOS",
            shell="/bin/zsh",
            username="testuser",
            is_root=False,
            cwd="/Users/testuser",
            home_dir="/Users/testuser",
        )

        # 注入远程 VPS Linux 信息
        svc._apply_os_info(
            ctx,
            {
                "os_name": "Linux",
                "distro": "Debian GNU/Linux 12 (bookworm)",
                "arch": "x86_64",
                "username": "root",
                "is_root": True,
            },
        )
        self.assertEqual(ctx.os_name, "Linux")
        self.assertEqual(ctx.distro, "Debian GNU/Linux 12 (bookworm)")
        self.assertEqual(ctx.username, "root")
        self.assertTrue(ctx.is_root)
        self.assertEqual(ctx.cwd, "/root")
        self.assertIn("apt", ctx.available_pkg_managers)

        prompt = ctx.get_summary_prompt()
        self.assertIn("Linux", prompt)
        self.assertIn("Debian", prompt)
        self.assertIn("Root", prompt)

    def test_ai_analyze_output_endpoint(self):
        from unittest.mock import patch
        with patch("app.ai_service.analyze_output", return_value="✅ 结论：当前系统已开启 BBR！"):
            res = self.client.post(
                "/api/ai/analyze_output",
                json={
                    "query": "这个系统开启bbr了吗",
                    "command": "sysctl net.ipv4.tcp_congestion_control",
                    "output": "net.ipv4.tcp_congestion_control = bbr",
                },
            )
            self.assertEqual(res.status_code, 200)
            self.assertIn("开启 BBR", res.json()["answer"])

    def test_ai_agent_step_endpoint(self):
        from unittest.mock import patch
        mock_step_res = {
            "thought": "首先检查80端口占用情况",
            "command": "ss -tulpn | grep :80",
            "status": "CONTINUE",
            "final_report": None,
            "risk": {"level": "SAFE", "reason": None, "badge": "SAFE", "patterns": []},
        }
        with patch("app.ai_service.agent_step", return_value=mock_step_res):
            res = self.client.post(
                "/api/ai/agent_step",
                json={
                    "task": "排查80端口被谁占用并解决",
                    "step": 1,
                    "max_steps": 5,
                    "history": [],
                    "last_output": "",
                },
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["status"], "CONTINUE")
            self.assertEqual(data["command"], "ss -tulpn | grep :80")
            self.assertEqual(data["risk"]["level"], "SAFE")


    def test_file_management_apis_local(self):
        import tempfile
        import shutil
        test_dir = tempfile.mkdtemp()
        try:
            from pty_session import PTYSession
            from app import active_sessions
            session_id = "test-session-files"
            pty = PTYSession()
            active_sessions[session_id] = {
                "type": "local",
                "instance": pty,
                "host_id": None,
                "host_name": "本地终端",
            }

            # 1. 列表目录
            res = self.client.get(f"/api/session/{session_id}/files?path={test_dir}")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["current_path"], os.path.realpath(test_dir))

            # 2. 新建子目录
            sub_dir = os.path.join(test_dir, "my_sub_dir")
            res_mkdir = self.client.post(f"/api/session/{session_id}/files/mkdir", json={"path": sub_dir})
            self.assertEqual(res_mkdir.status_code, 200)
            self.assertTrue(os.path.isdir(sub_dir))

            # 3. 写入文本文件
            txt_file = os.path.join(test_dir, "hello.txt")
            res_write = self.client.post(f"/api/session/{session_id}/files/text", json={"path": txt_file, "content": "Hello SFTP"})
            self.assertEqual(res_write.status_code, 200)
            self.assertTrue(os.path.isfile(txt_file))

            # 4. 读取文本文件
            res_read = self.client.get(f"/api/session/{session_id}/files/text?path={txt_file}")
            self.assertEqual(res_read.status_code, 200)
            self.assertEqual(res_read.json()["content"], "Hello SFTP")

            # 5. 上传二进制/流式文件
            upload_target = os.path.join(test_dir, "uploaded.bin")
            res_upload = self.client.post(
                f"/api/session/{session_id}/files/upload?path={upload_target}",
                content=b"binary-data-stream-123456",
            )
            self.assertEqual(res_upload.status_code, 200)
            with open(upload_target, "rb") as f:
                self.assertEqual(f.read(), b"binary-data-stream-123456")

            # 6. 下载文件
            res_down = self.client.get(f"/api/session/{session_id}/files/download?path={upload_target}")
            self.assertEqual(res_down.status_code, 200)
            self.assertEqual(res_down.content, b"binary-data-stream-123456")

            # 7. 重命名
            renamed_target = os.path.join(test_dir, "renamed.bin")
            res_ren = self.client.post(
                f"/api/session/{session_id}/files/rename",
                json={"old_path": upload_target, "new_path": renamed_target},
            )
            self.assertEqual(res_ren.status_code, 200)
            self.assertFalse(os.path.exists(upload_target))
            self.assertTrue(os.path.exists(renamed_target))

            # 8. 删除
            res_del = self.client.delete(f"/api/session/{session_id}/files?path={renamed_target}")
            self.assertEqual(res_del.status_code, 200)
            self.assertFalse(os.path.exists(renamed_target))

            pty.close()
            active_sessions.pop(session_id, None)
        finally:
            shutil.rmtree(test_dir, ignore_errors=True)

    def test_advanced_file_operations_compress_extract_chmod_search(self):
        import tempfile
        import shutil
        test_dir = tempfile.mkdtemp()
        try:
            from pty_session import PTYSession
            from app import active_sessions
            session_id = "test-session-adv-files"
            pty = PTYSession()
            active_sessions[session_id] = {
                "type": "local",
                "instance": pty,
                "host_id": None,
                "host_name": "本地终端",
            }

            # 1. 准备测试文件
            file_a = os.path.join(test_dir, "file_a.txt")
            with open(file_a, "w") as f:
                f.write("content of A")

            # 2. 压缩文件 (zip / tar.gz)
            zip_target = os.path.join(test_dir, "archive.zip")
            res_comp = self.client.post(
                f"/api/session/{session_id}/files/compress",
                json={"paths": [file_a], "archive_name": zip_target, "archive_type": "zip"},
            )
            self.assertEqual(res_comp.status_code, 200)
            self.assertTrue(os.path.isfile(zip_target))

            # 3. 解压文件
            unzip_dir = os.path.join(test_dir, "unzipped")
            res_ext = self.client.post(
                f"/api/session/{session_id}/files/extract",
                json={"path": zip_target, "target_dir": unzip_dir},
            )
            self.assertEqual(res_ext.status_code, 200)
            self.assertTrue(os.path.isdir(unzip_dir))

            # 4. 修改权限 chmod
            res_chmod = self.client.post(
                f"/api/session/{session_id}/files/chmod",
                json={"path": file_a, "mode": "0755"},
            )
            self.assertEqual(res_chmod.status_code, 200)

            # 5. 快速搜索文件
            res_search = self.client.get(
                f"/api/session/{session_id}/files/search?path={test_dir}&query=file_a"
            )
            self.assertEqual(res_search.status_code, 200)
            results = res_search.json()["results"]
            self.assertTrue(any("file_a" in r["name"] for r in results))

            pty.close()
            active_sessions.pop(session_id, None)
        finally:
            shutil.rmtree(test_dir, ignore_errors=True)

    def test_devops_ports_processes_docker_health(self):
        from pty_session import PTYSession
        from app import active_sessions
        session_id = "test-session-devops"
        pty = PTYSession()
        active_sessions[session_id] = {
            "type": "local",
            "instance": pty,
            "host_id": None,
            "host_name": "本地终端",
        }

        # 1. 查询端口
        p_res = self.client.get(f"/api/session/{session_id}/system/ports")
        self.assertEqual(p_res.status_code, 200)
        self.assertIn("ports", p_res.json())

        # 2. 查询进程
        proc_res = self.client.get(f"/api/session/{session_id}/system/processes")
        self.assertEqual(proc_res.status_code, 200)
        self.assertIn("processes", proc_res.json())

        # 3. Docker 容器列表与操作
        d_res = self.client.get(f"/api/session/{session_id}/docker/containers")
        self.assertEqual(d_res.status_code, 200)
        self.assertIn("containers", d_res.json())

        # 4. AI 全景健康体检 (兜底测试)
        from unittest.mock import patch
        mock_report = {
            "score": 90,
            "summary": "服务器整体运行稳定健康",
            "items": [{"title": "磁盘空间", "status": "ok", "detail": "充足", "suggestion": "保持日常清理"}],
            "fix_command": "",
        }
        with patch("app.ai_service.analyze_health_check", return_value=mock_report):
            h_res = self.client.post(f"/api/session/{session_id}/system/health_check")
            self.assertEqual(h_res.status_code, 200)
            self.assertEqual(h_res.json()["score"], 90)

        pty.close()
        active_sessions.pop(session_id, None)

    def test_ssh_keys_crud(self):
        # 1. 生成 Ed25519 密钥对
        gen_res = self.client.post(
            "/api/ssh_keys/generate",
            json={"name": "Test-DevOps-Key", "key_type": "ed25519"},
        )
        self.assertEqual(gen_res.status_code, 200)
        data = gen_res.json()
        key_id = data["id"]
        self.assertTrue(data["public_key"].startswith("ssh-ed25519"))

        # 2. 查询列表
        list_res = self.client.get("/api/ssh_keys")
        self.assertEqual(list_res.status_code, 200)
        keys = list_res.json()
        self.assertTrue(any(k["id"] == key_id for k in keys))

        # 3. 删除密钥
        del_res = self.client.delete(f"/api/ssh_keys/{key_id}")
        self.assertEqual(del_res.status_code, 200)


if __name__ == "__main__":
    unittest.main()


