from flask import Flask, request, jsonify
import os
import zipfile
import tempfile
import shutil
import requests
from language_plugins import plugin_manager

app = Flask(__name__)

PORT = int(os.getenv('PORT', 5001))
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:3000/api')

RUNNER_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(RUNNER_DIR)
SUBMISSIONS_DIR = os.path.join(PROJECT_ROOT, 'backend', 'src', 'data', 'submissions')
TASKS_DIR = os.path.join(PROJECT_ROOT, 'tasks')
CUSTOM_TASKS_DIR = os.path.join(PROJECT_ROOT, 'backend', 'src', 'data', 'tests')
os.makedirs(CUSTOM_TASKS_DIR, exist_ok=True)


def _as_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _find_assignment(assignments, assignment_id):
    target_id = _as_int(assignment_id)
    for assignment in assignments:
        if isinstance(assignment, dict) and _as_int(assignment.get('id')) == target_id:
            return assignment
    return None


def _resolve_test_dir(assignment):
    task_dir = os.path.join(TASKS_DIR, assignment['slug'])
    if not os.path.isdir(task_dir):
        task_dir = os.path.join(CUSTOM_TASKS_DIR, assignment['slug'])
    tests_dir = os.path.join(task_dir, 'tests')
    if not os.path.isdir(tests_dir):
        raise RuntimeError(f'Test directory not found: {tests_dir}')
    return tests_dir


def _copy_tests(tests_dir, workdir):
    dest = os.path.join(workdir, 'tests')
    os.makedirs(dest, exist_ok=True)
    for name in os.listdir(tests_dir):
        src = os.path.join(tests_dir, name)
        dst = os.path.join(dest, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)
    return dest


def _list_submission_files(workdir):
    files = []
    for root, _, names in os.walk(workdir):
        if 'tests' in root.split(os.sep):
            continue
        for name in names:
            files.append(name)
    return files


def _resolve_language(assignment, files):
    language = assignment.get('language') or plugin_manager.detect(files)
    return language or 'python'


def _send_callback(submission_id, test_result, language):
    executed = test_result.get('executed', False)
    callback_data = {
        'submissionId': submission_id,
        'status': 'completed' if executed else 'failed',
        'score': float(test_result.get('score', 0.0)),
        'totalTests': int(test_result.get('total_tests', 0)),
        'passedTests': int(test_result.get('passed_tests', 0)),
        'feedback': test_result.get('feedback', ''),
        'language': language,
    }
    requests.post(
        f'{BACKEND_URL}/runner/callback',
        json=callback_data,
        timeout=30,
        headers={'Content-Type': 'application/json'},
    )


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'ok': True,
        'supported_languages': plugin_manager.supported_languages(),
    })


@app.route('/languages', methods=['GET'])
def get_languages():
    return jsonify({
        'supported_languages': plugin_manager.supported_languages(),
    })


@app.route('/run', methods=['POST'])
def run():
    payload = request.get_json(force=True)
    submission_id = payload.get('submissionId')
    assignment_id = payload.get('assignmentId')
    filename = payload.get('filename')

    if not submission_id or not filename:
        return jsonify({'error': 'missing fields'}), 400

    submission_zip = os.path.join(SUBMISSIONS_DIR, filename)
    if not os.path.isfile(submission_zip):
        return jsonify({'error': 'file not found', 'path': submission_zip}), 404

    workdir = tempfile.mkdtemp(prefix=f'run_{submission_id}_')
    try:
        with zipfile.ZipFile(submission_zip, 'r') as zf:
            zf.extractall(workdir)

        response = requests.get(f'{BACKEND_URL}/runner/assignments', timeout=30)
        response.raise_for_status()
        assignments = response.json()
        if not isinstance(assignments, list):
            raise RuntimeError(f'Expected list of assignments, got {type(assignments)}')

        assignment = _find_assignment(assignments, assignment_id)
        if not assignment:
            raise RuntimeError(f'Assignment not found for id={assignment_id!r}')

        tests_dir = _resolve_test_dir(assignment)
        workdir_tests = _copy_tests(tests_dir, workdir)

        files = _list_submission_files(workdir)
        language = _resolve_language(assignment, files)

        test_result = plugin_manager.run(language, workdir, workdir_tests)

        try:
            _send_callback(submission_id, test_result, language)
        except Exception as e:
            print(f'Callback failed: {e}')

        return jsonify({'ok': True, 'language': language, 'result': test_result})

    except Exception as e:
        try:
            _send_callback(submission_id, {
                'executed': False,
                'score': 0.0,
                'total_tests': 0,
                'passed_tests': 0,
                'feedback': str(e),
            }, 'unknown')
        except Exception:
            pass
        return jsonify({'error': 'runner error', 'message': str(e)}), 500
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == '__main__':
    print(f'Starting ACA Runner on port {PORT}')
    print(f'Supported languages: {plugin_manager.supported_languages()}')
    app.run(host='0.0.0.0', port=PORT, debug=False)
