import unittest
from aiterm.context import get_current_context


class TestContextProbe(unittest.TestCase):
    def test_context_gathering(self):
        ctx = get_current_context()
        self.assertIsNotNone(ctx.os_name)
        self.assertIsNotNone(ctx.architecture)
        self.assertIsNotNone(ctx.distro)
        self.assertIsNotNone(ctx.cwd)
        self.assertIsNotNone(ctx.username)

        summary = ctx.get_summary_prompt()
        self.assertIn("操作系统:", summary)
        self.assertIn("当前工作目录:", summary)

    def test_prompt_html(self):
        from aiterm.repl import REPL
        from aiterm.config import Config
        from aiterm.context import SystemContext
        repl = REPL(Config())
        ctx1 = SystemContext(
            os_name="Darwin", os_version="24.0", architecture="arm64", distro="macOS 15",
            shell="zsh", username="testuser", is_root=False, cwd="/test/dir", home_dir="/test",
            git_branch="main", git_dirty=True
        )
        ctx2 = SystemContext(
            os_name="Linux", os_version="6.1", architecture="x86_64", distro="Debian 11",
            shell="bash", username="root", is_root=True, cwd="/root", home_dir="/root",
            git_branch=None, git_dirty=False
        )
        # Should not raise xml.parsers.expat.ExpatError
        html1 = repl._get_prompt_html(ctx1)
        html2 = repl._get_prompt_html(ctx2)
        self.assertIsNotNone(html1)
        self.assertIsNotNone(html2)


if __name__ == "__main__":
    unittest.main()
