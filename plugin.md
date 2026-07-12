# Plugin Architecture in This Project

## Overview

The **Runner** service uses a language plugin architecture to keep language-specific test execution separate from the core orchestration flow.

Instead of hardcoding language logic in `runner.py`, the runner defines a minimal plugin contract and delegates execution to language-specific plugins through a `PluginManager`.

## Why Plugins Were Introduced

- Separate language-specific test execution from the runner orchestration layer
- Make it easy to add new languages without changing `runner.py`
- Standardize the test result format across all languages
- Avoid large conditional blocks for language handling in one file

## Where It Is Implemented

```
runner/
├── runner.py                          # Orchestrator — no test execution here
└── language_plugins/
    ├── base_plugin.py                 # Abstract LanguagePlugin interface
    ├── python_plugin.py               # Python implementation (pytest)
    ├── plugin_manager.py              # Plugin registry and dispatcher
    └── __init__.py
```

## Core Design

### 1) Base Interface (`LanguagePlugin`)

Every language plugin must implement three methods:

| Method | Purpose |
|---|---|
| `name` | Language identifier (e.g. `'python'`) |
| `detect(files)` | Returns `True` if submitted files match this language |
| `run_tests(workdir, test_dir)` | Runs tests and returns a standardized result dict |

The base class also provides `run_command()` as a shared helper for executing shell commands.

### 2) Python Implementation (`PythonPlugin`)

`PythonPlugin` handles all Python-specific logic:

- Detects `.py` files
- Installs dependencies from `requirements.txt` (if present)
- Runs tests via `pytest` with JSON report output
- Parses the report and builds a standardized result dict via `_result()`

### 3) Plugin Manager (`PluginManager`)

`PluginManager` is a simple registry and dispatcher. It does **not** run tests itself.

| Method | Purpose |
|---|---|
| `get(language)` | Returns the plugin instance for a language |
| `supported_languages()` | Lists all loaded languages |
| `detect(files)` | Detects language by asking each plugin |
| `run(language, workdir, test_dir)` | Selects plugin and calls `run_tests()` |

Plugins are registered in `REGISTRY`:

```python
REGISTRY = {
    'python': 'python_plugin.PythonPlugin',
    # 'java': 'java_plugin.JavaPlugin',
}
```

## Runtime Flow

```
Backend
  │  POST /run  (submissionId, assignmentId, filename)
  ▼
runner.py  (Orchestrator)
  │  1. Extract ZIP → workdir
  │  2. Fetch assignment from Backend
  │  3. Copy tests from tasks/{slug}/tests/ → workdir/tests/
  │  4. Resolve language (_resolve_language)
  │  5. plugin_manager.run(language, workdir, test_dir)
  ▼
PluginManager  (Dispatcher)
  │  get(language) → PythonPlugin
  │  plugin.run_tests(workdir, test_dir)
  ▼
PythonPlugin
  │  install deps → run pytest → parse report → return dict
  ▼
runner.py
  │  POST /api/runner/callback → Backend
  ▼
Backend  (store result, update submission status)
```

### Language Resolution (in runner.py)

Language is determined **before** calling `plugin_manager.run()`:

1. Use `assignment.language` if set
2. Otherwise call `plugin_manager.detect(files)`
3. Default to `'python'`

`plugin_manager.run()` receives the language already resolved — it does not detect it again.

### Standardized Result Format

Every plugin returns the same dict structure:

```python
{
    'success': bool,       # all tests passed
    'executed': bool,      # tests were actually run
    'total_tests': int,
    'passed_tests': int,
    'failed_tests': int,
    'score': float,        # 0.0 to 1.0
    'feedback': str,
}
```

The runner maps this to the Backend callback format:

| Plugin field | Callback field |
|---|---|
| `executed` | `status` (`completed` / `failed`) |
| `total_tests` | `totalTests` |
| `passed_tests` | `passedTests` |
| `score` | `score` |
| `feedback` | `feedback` |

Note: `status: completed` means tests **ran** (even if some failed). `status: failed` means an **execution error** occurred.

## Adding a New Language

1. Create a new plugin file (e.g. `java_plugin.py`) implementing `LanguagePlugin`
2. Add one line to `REGISTRY` in `plugin_manager.py`
3. No changes needed in `runner.py`

Example:

```python
# java_plugin.py
class JavaPlugin(LanguagePlugin):
    @property
    def name(self):
        return 'java'

    def detect(self, files):
        return any(f.endswith('.java') for f in files)

    def run_tests(self, workdir, test_dir):
        # run JUnit, parse results, return standardized dict
        ...
```

## Responsibility Summary

| Component | Role |
|---|---|
| **Backend** | Upload, store ZIP, send `/run`, receive callback |
| **runner.py** | Orchestration — prepare environment, resolve language, send callback |
| **PluginManager** | Load plugins, select plugin by language, delegate |
| **PythonPlugin** | Python-specific logic — deps, pytest, parse, standardize |
| **pytest** | Actual test execution tool |
