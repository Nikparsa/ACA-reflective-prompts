"""
Python Language Plugin
Implements Python-specific test execution using pytest
"""

import os
import json
import tempfile
from typing import Dict, List, Any
from .base_plugin import LanguagePlugin, TestResult


class PythonPlugin(LanguagePlugin):
    """Python language plugin using pytest"""
    
    def __init__(self):
        config = {
            'timeout': 60,
            'memoryLimit': '512m',
            'cpuLimit': '1.0',
            'extensions': ['.py'],
            'testFramework': 'pytest'
        }
        super().__init__('python', config)
    
    def detect_language(self, files: List[str]) -> bool:
        """Detect Python files"""
        return any(f.endswith('.py') for f in files)
    
    def prepare_environment(self, workdir: str, files: List[str]) -> Dict[str, Any]:
        """Prepare Python environment"""
        # Check for requirements.txt
        requirements_file = None
        for file in files:
            if file.endswith('requirements.txt'):
                requirements_file = os.path.join(workdir, file)
                break
        
        # Install dependencies if requirements.txt exists
        if requirements_file and os.path.exists(requirements_file):
            install_result = self.run_command(
                ['pip', 'install', '-r', 'requirements.txt'],
                workdir,
                timeout=30
            )
            if not install_result['success']:
                return {
                    'success': False,
                    'error': f'Failed to install dependencies: {install_result["stderr"]}'
                }
        
        return {
            'success': True,
            'python_version': self._get_python_version(),
            'dependencies_installed': requirements_file is not None
        }
    
    def run_tests(self, workdir: str, test_dir: str, env_info: Dict[str, Any]) -> Dict[str, Any]:
        """Run pytest tests"""
        if not env_info.get('success', True):
            return {
                'success': False,
                'error': env_info.get('error', 'Environment preparation failed')
            }
        
        # Generate pytest command
        report_path = os.path.join(workdir, 'report.json')
        cmd = [
            'pytest',
            '-q',
            '--maxfail=1',
            '--disable-warnings',
            '--json-report',
            f'--json-report-file={report_path}',
            test_dir
        ]
        
        # Execute tests
        result = self.run_command(cmd, workdir)
        
        # Parse results
        test_result = TestResult()
        
        if result['success']:
            # Parse JSON report if available
            if os.path.exists(report_path):
                try:
                    with open(report_path, 'r', encoding='utf-8') as f:
                        report = json.load(f)
                    
                    summary = report.get('summary', {})
                    test_result.total_tests = summary.get('total', 0)
                    test_result.passed_tests = summary.get('passed', 0)
                    test_result.failed_tests = summary.get('failed', 0)
                    test_result.skipped_tests = summary.get('skipped', 0)
                    
                    # Generate feedback from failed tests
                    test_result.feedback = self._generate_pytest_feedback(report)
                    
                except (json.JSONDecodeError, IOError) as e:
                    test_result.feedback = f"Failed to parse test results: {str(e)}"
            else:
                test_result.feedback = "Test execution completed but no report generated"
        else:
            test_result.feedback = result['stderr'] or "Test execution failed"
            test_result.errors.append(test_result.feedback)
        
        test_result.calculate_score()
        
        return {
            'success': result['success'],
            'result': test_result.to_dict(),
            'raw_output': result['stdout'],
            'raw_errors': result['stderr']
        }
    
    def generate_feedback(self, result: Dict[str, Any]) -> str:
        """Generate human-readable feedback"""
        if not result.get('success', False):
            return f"Execution failed: {result.get('raw_errors', 'Unknown error')}"
        
        test_data = result.get('result', {})
        total = test_data.get('total_tests', 0)
        passed = test_data.get('passed_tests', 0)
        failed = test_data.get('failed_tests', 0)
        score = test_data.get('score', 0.0)
        
        feedback_parts = [
            f"Tests: {passed}/{total} passed ({score:.1%})",
            f"Score: {score:.1%}"
        ]
        
        if failed > 0:
            feedback_parts.append(f"\nFailed tests: {failed}")
            if test_data.get('feedback'):
                feedback_parts.append(f"Details: {test_data['feedback']}")
        
        return '\n'.join(feedback_parts)
    
    def get_docker_image(self) -> str:
        """Get Docker image for Python"""
        return 'python:3.11-slim'
    
    def _get_python_version(self) -> str:
        """Get Python version"""
        result = self.run_command(['python', '--version'], '.', timeout=5)
        if result['success']:
            return result['stdout'].strip()
        return 'Unknown'
    
    def _generate_pytest_feedback(self, report: Dict[str, Any]) -> str:
        """Generate detailed feedback from pytest report"""
        feedback_parts = []
        
        # Add failed test details
        tests = report.get('tests', [])
        failed_tests = [t for t in tests if t.get('outcome') == 'failed']
        
        if failed_tests:
            feedback_parts.append("Failed tests:")
            for test in failed_tests[:5]:  # Limit to first 5 failures
                nodeid = test.get('nodeid', 'Unknown test')
                longrepr = test.get('call', {}).get('longrepr', '')
                if longrepr:
                    # Extract just the assertion error
                    lines = longrepr.split('\n')
                    error_line = next((line for line in lines if 'AssertionError' in line), lines[0] if lines else '')
                    feedback_parts.append(f"  • {nodeid}: {error_line}")
        
        # Add warnings
        warnings = report.get('warnings', [])
        if warnings:
            feedback_parts.append(f"\nWarnings ({len(warnings)}):")
            for warning in warnings[:3]:  # Limit to first 3 warnings
                message = warning.get('message', '')
                if message:
                    feedback_parts.append(f"  • {message}")
        
        return '\n'.join(feedback_parts)







