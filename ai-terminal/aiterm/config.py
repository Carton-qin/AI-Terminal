"""配置管理模块：处理配置文件、环境变量与交互式初始化引导."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional


CONFIG_DIR = Path.home() / ".aiterm"
GLOBAL_CONFIG_PATH = CONFIG_DIR / "config.json"
LOCAL_CONFIG_NAME = ".aiterm.json"

MODEL_PRESETS: Dict[str, Dict[str, str]] = {
    "1": {
        "name": "DeepSeek (推荐，高性价比)",
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
    },
    "2": {
        "name": "OpenAI (官方 / 代理)",
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o",
    },
    "3": {
        "name": "Ollama (本地离线，无需Key)",
        "base_url": "http://localhost:11434/v1",
        "default_model": "qwen2.5:7b",
    },
    "4": {
        "name": "通义千问 (阿里云 DashScope 兼容接口)",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-plus",
    },
    "5": {
        "name": "Moonshot / Kimi",
        "base_url": "https://api.moonshot.cn/v1",
        "default_model": "moonshot-v1-8k",
    },
    "6": {
        "name": "自定义第三方 API / 兼容网关 (如 OpenRouter, OneAPI)",
        "base_url": "",
        "default_model": "",
    },
}


@dataclass
class Config:
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-chat"
    temperature: float = 0.2
    timeout: int = 60
    auto_execute_safe: bool = False
    language: str = "zh"
    extra_headers: Dict[str, str] = field(default_factory=dict)

    def is_configured(self) -> bool:
        """检查是否有有效配置（Ollama 等本地模型可无需真实 key）"""
        if "localhost" in self.base_url or "127.0.0.1" in self.base_url:
            return bool(self.model)
        return bool(self.api_key and self.base_url and self.model)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Config:
        fields = cls.__dataclass_fields__
        filtered = {k: v for k, v in data.items() if k in fields}
        return cls(**filtered)


def get_config_file_path() -> Path:
    """优先使用当前工作目录下的 .aiterm.json，否则使用全局 ~/.aiterm/config.json"""
    local_path = Path.cwd() / LOCAL_CONFIG_NAME
    if local_path.is_file():
        return local_path
    return GLOBAL_CONFIG_PATH


def load_config() -> Config:
    """加载配置：合并配置文件和环境变量"""
    config = Config()
    config_path = get_config_file_path()

    if config_path.is_file():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                config = Config.from_dict(data)
        except Exception:
            pass

    # 环境变量覆盖
    env_key = (
        os.getenv("AITERM_API_KEY")
        or os.getenv("DEEPSEEK_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )
    if env_key:
        config.api_key = env_key

    env_url = os.getenv("AITERM_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    if env_url:
        config.base_url = env_url

    env_model = os.getenv("AITERM_MODEL") or os.getenv("OPENAI_MODEL")
    if env_model:
        config.model = env_model

    return config


def save_config(config: Config, is_local: bool = False) -> Path:
    """保存配置到文件"""
    if is_local:
        target_path = Path.cwd() / LOCAL_CONFIG_NAME
    else:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        target_path = GLOBAL_CONFIG_PATH

    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(config.to_dict(), f, indent=2, ensure_ascii=False)

    return target_path


def interactive_setup() -> Config:
    """终端交互式向导配置"""
    from rich.console import Console
    from rich.panel import Panel
    from rich.prompt import Confirm, Prompt

    console = Console()
    console.print(
        Panel(
            "[bold cyan]AI Terminal - 快速配置向导[/bold cyan]\n"
            "支持 DeepSeek、OpenAI、Ollama 本地大模型及兼容 OpenAI 规范的任意服务商。",
            border_style="cyan",
        )
    )

    console.print("[bold yellow]请选择 API 服务商预设：[/bold yellow]")
    for key, item in MODEL_PRESETS.items():
        console.print(f"  [bold green]{key}[/bold green]. {item['name']}")

    choice = Prompt.ask("输入序号", choices=list(MODEL_PRESETS.keys()), default="1")
    preset = MODEL_PRESETS[choice]

    base_url = preset["base_url"]
    default_model = preset["default_model"]

    if not base_url:
        base_url = Prompt.ask(
            "请输入 Base URL (例如 https://api.xxx.com/v1)",
            default="https://api.openai.com/v1",
        )

    model = Prompt.ask("请输入模型名称 (Model ID)", default=default_model or "deepseek-chat")

    if "localhost" in base_url or "127.0.0.1" in base_url:
        api_key = Prompt.ask("请输入 API Key (本地 Ollama 可直接回车)", default="ollama")
    else:
        api_key = Prompt.ask("请输入 API Key (输入时隐藏)", password=True)

    save_local = Confirm.ask(
        "是否仅在当前项目保存为本地配置 (.aiterm.json)？",
        default=False,
    )

    config = Config(
        api_key=api_key,
        base_url=base_url.rstrip("/"),
        model=model,
    )

    path = save_config(config, is_local=save_local)
    console.print(f"[bold green]✓ 配置已成功保存至:[/bold green] {path}\n")
    return config
