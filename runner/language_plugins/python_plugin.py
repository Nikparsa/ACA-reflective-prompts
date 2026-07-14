"""Python language plugin — pytest execution."""

import json
import os
import re
from typing import Any, Dict, List

from .base_plugin import LanguagePlugin


class PythonPlugin(LanguagePlugin):
    @property
    def name(self) -> str:
        return 'python'

    def detect(self, files: List[str]) -> bool:
        return any(f.endswith('.py') for f in files)

    def run_tests(self, workdir: str, test_dir: str) -> Dict[str, Any]:
        if not os.path.isdir(test_dir):
            return self._result(
                success=False, executed=False,
                feedback=f'Test directory not found: {test_dir}',
            )

        test_files = [
            f for f in os.listdir(test_dir)
            if f.startswith('test_') and f.endswith('.py')
        ]
        if not test_files:
            return self._result(
                success=False, executed=False,
                feedback=f'No test files found in {test_dir}',
            )

        self._install_dependencies(workdir)

        report_path = os.path.join(workdir, 'report.json')
        cmd = [
            'python', '-m', 'pytest',
            '-q', '--disable-warnings',
            '--json-report',
            f'--json-report-file={report_path}',
            test_dir,
        ]
        proc = self.run_command(cmd, workdir)

        total, passed, failed, feedback = self._parse_report(report_path, proc)

        score = passed / total if total > 0 else 0.0
        return self._result(
            success=proc['returncode'] == 0,
            executed=True,
            total=total, passed=passed, failed=failed,
            score=score, feedback=feedback,
        )

    def _install_dependencies(self, workdir: str) -> None:
        req = os.path.join(workdir, 'requirements.txt')
        if os.path.isfile(req):
            self.run_command(['pip', 'install', '-r', 'requirements.txt'], workdir, timeout=30)

    def _parse_report(self, report_path: str, proc: Dict[str, Any]):
        total = passed = failed = 0
        feedback = ''

        if not os.path.isfile(report_path):
            return 0, 0, 0, proc['stderr'] or proc['stdout'] or 'No test report generated'

        try:
            with open(report_path, encoding='utf-8') as f:
                report = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            return 0, 0, 0, f'Failed to parse test results: {e}'

        tests = report.get('tests', [])
        if tests:
            total = len(tests)
            passed = sum(1 for t in tests if t.get('outcome') == 'passed')
            failed = sum(1 for t in tests if t.get('outcome') == 'failed')
        else:
            summary = report.get('summary', {})
            total = summary.get('total', 0)
            passed = summary.get('passed', 0)
            failed = summary.get('failed', 0)

        if total == 0 and proc['stdout']:
            m_passed = re.search(r'(\d+)\s+passed', proc['stdout'])
            m_failed = re.search(r'(\d+)\s+failed', proc['stdout'])
            if m_passed or m_failed:
                passed = int(m_passed.group(1)) if m_passed else 0
                failed = int(m_failed.group(1)) if m_failed else 0
                total = passed + failed

        failed_tests = [t for t in tests if t.get('outcome') == 'failed']
        if failed_tests:
            lines = ['Failed tests:']
            for test in failed_tests[:3]:
                nodeid = test.get('nodeid', 'Unknown')
                longrepr = test.get('call', {}).get('longrepr', '')
                error = self._extract_error(longrepr)
                lines.append(f'  • {nodeid}: {error}')
            feedback = '\n'.join(lines)
        elif total > 0:
            feedback = f'All {passed} tests passed!'
        else:
            feedback = 'Tests executed but no results found'

        return total, passed, failed, feedback

    @staticmethod
    def _extract_error(longrepr: str) -> str:
        if not longrepr:
            return ''
        lines = longrepr.split('\n')
        for line in lines:
            if 'AssertionError' in line:
                return line
        return lines[0] if lines else ''

    @staticmethod
    def _result(
        success: bool, executed: bool,
        total: int = 0, passed: int = 0, failed: int = 0,
        score: float = 0.0, feedback: str = '',
    ) -> Dict[str, Any]:
        return {
            'success': success,
            'executed': executed,
            'total_tests': total,
            'passed_tests': passed,
            'failed_tests': failed,
            'score': max(0.0, min(1.0, score)),
            'feedback': feedback,
        }
