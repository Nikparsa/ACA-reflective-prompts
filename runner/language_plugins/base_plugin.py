"""
Base Language Plugin Interface
Defines the interface that all language runners must implement
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
import tempfile
import subprocess
import json
import os


class LanguagePlugin(ABC):
    """Base class for language-specific test runners"""
    
    def __init__(self, language: str, config: Dict[str, Any]):
        self.language = language
        self.config = config
        self.timeout = config.get('timeout', 60)
        self.memory_limit = config.get('memoryLimit', '512m')
        self.cpu_limit = config.get('cpuLimit', '1.0')
    
    @abstractmethod
    def detect_language(self, files: List[str]) -> bool:
        """
        Detect if the submitted files match this language
        Args:
            files: List of file paths in the submission
        Returns:
            bool: True if files match this language
        """
        pass
    
    @abstractmethod
    def prepare_environment(self, workdir: str, files: List[str]) -> Dict[str, Any]:
        """
        Prepare the execution environment for this language
        Args:
            workdir: Working directory path
            files: List of submitted files
        Returns:
            Dict with environment setup information
        """
        pass
    
    @abstractmethod
    def run_tests(self, workdir: str, test_dir: str, env_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute tests for this language
        Args:
            workdir: Working directory with submitted code
            test_dir: Directory containing test files
            env_info: Environment information from prepare_environment
        Returns:
            Dict with test results
        """
        pass
    
    @abstractmethod
    def generate_feedback(self, result: Dict[str, Any]) -> str:
        """
        Generate human-readable feedback from test results
        Args:
            result: Test execution results
        Returns:
            str: Formatted feedback message
        """
        pass
    
    def get_docker_config(self) -> Dict[str, Any]:
        """
        Get Docker configuration for this language
        Returns:
            Dict with Docker run configuration
        """
        return {
            'image': self.get_docker_image(),
            'timeout': self.timeout,
            'memory': self.memory_limit,
            'cpu': self.cpu_limit,
            'network': False,  # No network access for security
            'read_only': True
        }
    
    @abstractmethod
    def get_docker_image(self) -> str:
        """
        Get the Docker image name for this language
        Returns:
            str: Docker image name
        """
        pass
    
    def validate_submission(self, files: List[str]) -> Dict[str, Any]:
        """
        Validate submission files for this language
        Args:
            files: List of submitted file paths
        Returns:
            Dict with validation result
        """
        if not self.detect_language(files):
            return {
                'is_valid': False,
                'errors': [f'Files do not match {self.language} language requirements']
            }
        
        return {'is_valid': True, 'errors': []}
    
    def run_command(self, cmd: List[str], cwd: str, timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        Execute a command with proper error handling
        Args:
            cmd: Command to execute
            cwd: Working directory
            timeout: Command timeout (uses plugin timeout if not specified)
        Returns:
            Dict with execution results
        """
        timeout = timeout or self.timeout
        
        try:
            result = subprocess.run(
                cmd,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False
            )
            
            return {
                'success': result.returncode == 0,
                'returncode': result.returncode,
                'stdout': result.stdout,
                'stderr': result.stderr
            }
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'returncode': -1,
                'stdout': '',
                'stderr': f'Command timed out after {timeout} seconds'
            }
        except Exception as e:
            return {
                'success': False,
                'returncode': -1,
                'stdout': '',
                'stderr': f'Command execution failed: {str(e)}'
            }


class TestResult:
    """Standardized test result format"""
    
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.skipped_tests = 0
        self.score = 0.0
        self.feedback = ""
        self.execution_time = 0.0
        self.errors = []
        self.warnings = []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format"""
        return {
            'total_tests': self.total_tests,
            'passed_tests': self.passed_tests,
            'failed_tests': self.failed_tests,
            'skipped_tests': self.skipped_tests,
            'score': self.score,
            'feedback': self.feedback,
            'execution_time': self.execution_time,
            'errors': self.errors,
            'warnings': self.warnings
        }
    
    def calculate_score(self):
        """Calculate score based on passed tests"""
        if self.total_tests > 0:
            self.score = self.passed_tests / self.total_tests
        else:
            self.score = 0.0







