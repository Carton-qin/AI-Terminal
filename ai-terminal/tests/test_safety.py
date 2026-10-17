import unittest
from aiterm.safety import RiskLevel, analyze_command_safety


class TestSafetyAnalysis(unittest.TestCase):
    def test_safe_commands(self):
        safe_cases = [
            "ls -la",
            "cat /etc/hosts",
            "ps aux | grep python",
            "df -h",
            "free -m",
            "git status",
            "git log -n 5",
            "uptime",
            "whoami",
            "echo 'hello world'",
        ]
        for cmd in safe_cases:
            assessment = analyze_command_safety(cmd)
            self.assertEqual(
                assessment.level,
                RiskLevel.SAFE,
                f"Command '{cmd}' should be SAFE, got {assessment.level} ({assessment.reason})",
            )

    def test_moderate_commands(self):
        moderate_cases = [
            "mkdir -p /tmp/testdir",
            "touch myfile.txt",
            "git add .",
            "git commit -m 'update'",
            "curl -O https://example.com/file.tar.gz",
            "echo 'test' > output.log",
        ]
        for cmd in moderate_cases:
            assessment = analyze_command_safety(cmd)
            self.assertEqual(
                assessment.level,
                RiskLevel.MODERATE,
                f"Command '{cmd}' should be MODERATE, got {assessment.level}",
            )

    def test_dangerous_commands(self):
        dangerous_cases = [
            "rm -rf /",
            "rm -rf /*",
            "rm -rf ~",
            "rm -rf ./*",
            "mkfs.ext4 /dev/sda1",
            "dd if=/dev/zero of=/dev/sdb bs=1M",
            "chmod -R 777 /etc",
            "iptables -F",
            "ufw disable",
            "reboot",
            "shutdown -h now",
            ":(){ :|:& };:",
            "kill -9 1",
        ]
        for cmd in dangerous_cases:
            assessment = analyze_command_safety(cmd)
            self.assertEqual(
                assessment.level,
                RiskLevel.DANGEROUS,
                f"Command '{cmd}' should be DANGEROUS, got {assessment.level}",
            )


if __name__ == "__main__":
    unittest.main()
