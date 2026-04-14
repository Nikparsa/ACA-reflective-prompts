"""
Language Plugin Manager
Manages and loads language-specific plugins
"""

from typing import Dict, List, Optional, Any
import importlib
import os
from .base_plugin import LanguagePlugin


class PluginManager:
    """Manages language plugins"""
    
    def __init__(self):
        self.plugins: Dict[str, LanguagePlugin] = {}
        self._load_plugins()
    
    def _load_plugins(self):
        """Load all available language plugins"""
        # Plugin registry - maps language names to plugin classes
        plugin_registry = {
            'python': 'python_plugin.PythonPlugin',
            # Future languages can be added here easily
            # 'java': 'java_plugin.JavaPlugin',
            # 'javascript': 'javascript_plugin.JavaScriptPlugin',
            # 'kotlin': 'kotlin_plugin.KotlinPlugin',
            # 'swift': 'swift_plugin.SwiftPlugin',
            # 'go': 'go_plugin.GoPlugin',
            # 'ruby': 'ruby_plugin.RubyPlugin',
        }
        
        for language, plugin_path in plugin_registry.items():
            try:
                self._load_plugin(language, plugin_path)
            except (ImportError, AttributeError) as e:
                print(f"Warning: Could not load {language} plugin: {e}")
                continue
    
    def _load_plugin(self, language: str, plugin_path: str):
        """Load a specific plugin"""
        try:
            module_name, class_name = plugin_path.split('.')
            module = importlib.import_module(f'.{module_name}', package=__package__)
            plugin_class = getattr(module, class_name)
            
            # Instantiate the plugin
            plugin_instance = plugin_class()
            
            # Validate it's a proper plugin
            if not isinstance(plugin_instance, LanguagePlugin):
                raise ValueError(f"{plugin_path} is not a valid LanguagePlugin")
            
            self.plugins[language] = plugin_instance
            print(f"Loaded {language} plugin successfully")
            
        except Exception as e:
            raise ImportError(f"Failed to load {language} plugin: {e}")
    
    def get_plugin(self, language: str) -> Optional[LanguagePlugin]:
        """Get plugin for a specific language"""
        return self.plugins.get(language)
    
    def get_supported_languages(self) -> List[str]:
        """Get list of supported languages"""
        return list(self.plugins.keys())
    
    def detect_language(self, files: List[str]) -> Optional[str]:
        """Detect language from files using all available plugins"""
        if not files:
            return None
        
        # Try each plugin to detect the language
        for language, plugin in self.plugins.items():
            try:
                if plugin.detect_language(files):
                    return language
            except Exception as e:
                print(f"Error in {language} plugin detection: {e}")
                continue
        
        return None
    
    def validate_submission(self, files: List[str], language: Optional[str] = None) -> Dict[str, Any]:
        """Validate submission files"""
        if language:
            # Validate for specific language
            plugin = self.get_plugin(language)
            if not plugin:
                return {
                    'is_valid': False,
                    'errors': [f'Language {language} is not supported']
                }
            return plugin.validate_submission(files)
        else:
            # Auto-detect and validate
            detected_language = self.detect_language(files)
            if not detected_language:
                return {
                    'is_valid': False,
                    'errors': ['Could not detect programming language from submitted files']
                }
            
            plugin = self.get_plugin(detected_language)
            return plugin.validate_submission(files)
    
    def execute_tests(self, language: str, workdir: str, files: List[str], test_dir: str) -> Dict[str, Any]:
        """Execute tests for a specific language"""
        plugin = self.get_plugin(language)
        if not plugin:
            return {
                'success': False,
                'error': f'Language {language} is not supported',
                'result': {
                    'total_tests': 0,
                    'passed_tests': 0,
                    'failed_tests': 0,
                    'score': 0.0,
                    'feedback': f'Language {language} is not supported'
                }
            }
        
        try:
            # Prepare environment
            env_info = plugin.prepare_environment(workdir, files)
            
            # Run tests
            result = plugin.run_tests(workdir, test_dir, env_info)
            
            # Generate feedback
            if result.get('success', False):
                feedback = plugin.generate_feedback(result)
                if 'result' in result:
                    result['result']['feedback'] = feedback
            
            return result
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Execution failed: {str(e)}',
                'result': {
                    'total_tests': 0,
                    'passed_tests': 0,
                    'failed_tests': 0,
                    'score': 0.0,
                    'feedback': f'Execution failed: {str(e)}'
                }
            }
    
    def get_plugin_info(self, language: str) -> Optional[Dict[str, Any]]:
        """Get information about a plugin"""
        plugin = self.get_plugin(language)
        if not plugin:
            return None
        
        return {
            'language': plugin.language,
            'timeout': plugin.timeout,
            'memory_limit': plugin.memory_limit,
            'cpu_limit': plugin.cpu_limit,
            'docker_image': plugin.get_docker_image(),
            'supported_extensions': plugin.config.get('extensions', []),
            'test_framework': plugin.config.get('testFramework', 'unknown')
        }


# Global plugin manager instance
plugin_manager = PluginManager()







