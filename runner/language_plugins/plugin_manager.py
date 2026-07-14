"""Loads language plugins and routes test execution to them."""

from typing import Dict, List, Optional, Any
import importlib

from .base_plugin import LanguagePlugin

REGISTRY = {
    'python': 'python_plugin.PythonPlugin',
    # Add new languages here, e.g.:
    # 'java': 'java_plugin.JavaPlugin',
}


def _empty_result(feedback: str, executed: bool = False) -> Dict[str, Any]:
    return {
        'success': False,
        'executed': executed,
        'total_tests': 0,
        'passed_tests': 0,
        'failed_tests': 0,
        'score': 0.0,
        'feedback': feedback,
    }


class PluginManager:
    """Registry: loads plugins and delegates test execution."""

    def __init__(self):
        self._plugins: Dict[str, LanguagePlugin] = {}
        for language, plugin_path in REGISTRY.items():
            module_name, class_name = plugin_path.split('.')
            module = importlib.import_module(f'.{module_name}', package=__package__)
            plugin = getattr(module, class_name)()
            self._plugins[language] = plugin

    def get(self, language: str) -> Optional[LanguagePlugin]:
        return self._plugins.get(language)

    def supported_languages(self) -> List[str]:
        return list(self._plugins.keys())

    def detect(self, files: List[str]) -> Optional[str]:
        for language, plugin in self._plugins.items():
            if plugin.detect(files):
                return language
        return None

    def run(self, language: str, workdir: str, test_dir: str) -> Dict[str, Any]:
        plugin = self.get(language)
        if not plugin:
            return _empty_result(f'Language {language} is not supported')
        try:
            return plugin.run_tests(workdir, test_dir)
        except Exception as e:
            return _empty_result(f'Execution failed: {e}')


plugin_manager = PluginManager()
