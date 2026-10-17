import os
import unittest
from pathlib import Path
from aiterm.executor import CommandExecutor


class TestCommandExecutor(unittest.TestCase):
    def setUp(self):
        self.executor = CommandExecutor()
        self.original_cwd = os.getcwd()

    def tearDown(self):
        os.chdir(self.original_cwd)

    def test_simple_command_execution(self):
        result = self.executor.execute("echo 'Hello AI Terminal'", stream=False)
        self.assertTrue(result.is_success)
        self.assertIn("Hello AI Terminal", result.stdout)
        self.assertEqual(result.returncode, 0)

    def test_cd_tracking(self):
        # 测试进入子目录
        target = Path(self.original_cwd) / "ai-terminal"
        if target.exists():
            result = self.executor.execute(f"cd '{target}'", stream=False)
            self.assertTrue(result.is_success)
            self.assertEqual(Path(os.getcwd()).resolve(), target.resolve())

            # 测试 cd - 返回
            result_back = self.executor.execute("cd -", stream=False)
            self.assertTrue(result_back.is_success)
            self.assertEqual(Path(os.getcwd()).resolve(), Path(self.original_cwd).resolve())

    def test_failed_command_capture(self):
        result = self.executor.execute("non_existent_command_12345", stream=False)
        self.assertFalse(result.is_success)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(len(result.stderr) > 0)


if __name__ == "__main__":
    unittest.main()
