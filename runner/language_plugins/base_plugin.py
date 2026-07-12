"""Base interface for language plugins."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List
import subprocess


class LanguagePlugin(ABC):
    """Each language plugin detects its files and runs tests."""

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def detect(self, files: List[str]) -> bool:
        pass

    @abstractmethod
    def run_tests(self, workdir: str, test_dir: str) -> Dict[str, Any]:
        """
        Run tests and return a standardized result dict:
        success, executed, total_tests, passed_tests, failed_tests, score, feedback
        """
        pass

    def run_command(self, cmd: List[str], cwd: str, timeout: int = 60) -> Dict[str, Any]:
        try:
            result = subprocess.run(
                cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False
            )
            return {
                'success': result.returncode == 0,
                'returncode': result.returncode,
                'stdout': result.stdout,
                'stderr': result.stderr,
            }
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'returncode': -1,
                'stdout': '',
                'stderr': f'Command timed out after {timeout} seconds',
            }
        except Exception as e:
            return {
                'success': False,
                'returncode': -1,
                'stdout': '',
                'stderr': str(e),
            }
