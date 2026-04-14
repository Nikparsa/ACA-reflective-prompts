from flask import Flask, request, jsonify
import os
import zipfile
import tempfile
import subprocess
import json
import shutil
import requests
from language_plugins import plugin_manager

app = Flask(__name__)

PORT = int(os.getenv('PORT', 5001))
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:3000/api')
print(f"DEBUG: Runner started with BACKEND_URL={BACKEND_URL}, PORT={PORT}")

# Get absolute paths relative to this file
RUNNER_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(RUNNER_DIR)
SUBMISSIONS_DIR = os.path.join(PROJECT_ROOT, 'backend', 'src', 'data', 'submissions')
RESULTS_DIR = os.path.join(PROJECT_ROOT, 'backend', 'src', 'data', 'results')
TASKS_DIR = os.path.join(PROJECT_ROOT, 'tasks')
CUSTOM_TASKS_DIR = os.path.join(PROJECT_ROOT, 'backend', 'src', 'data', 'tests')
os.makedirs(CUSTOM_TASKS_DIR, exist_ok=True)

os.makedirs(RESULTS_DIR, exist_ok=True)

def run_pytest(workdir, test_dir):
    """Run pytest and return results"""
    report_path = os.path.join(workdir, 'report.json')
    
    # Ensure test_dir exists and has test files
    if not os.path.exists(test_dir):
        return {
            'success': False,
            'total_tests': 0,
            'passed_tests': 0,
            'failed_tests': 0,
            'score': 0.0,
            'feedback': f'Test directory not found: {test_dir}',
            'pytest_executed': False  # Pytest won't execute
        }
    
    test_files = [f for f in os.listdir(test_dir) if f.startswith('test_') and f.endswith('.py')]
    if not test_files:
        return {
            'success': False,
            'total_tests': 0,
            'passed_tests': 0,
            'failed_tests': 0,
            'score': 0.0,
            'feedback': f'No test files found in {test_dir}',
            'pytest_executed': False  # Pytest won't execute (no test files)
        }
    
    print(f"DEBUG: Running pytest with {len(test_files)} test files in {test_dir}")
    
    cmd = [
        'python', '-m', 'pytest',
        '-q',
        '--disable-warnings',
        '--json-report',
        f'--json-report-file={report_path}',
        test_dir
    ]
    
    print(f"DEBUG: Pytest command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        print(f"DEBUG: Pytest return code: {result.returncode}")
        print(f"DEBUG: Pytest stdout (first 1000 chars): {result.stdout[:1000] if result.stdout else 'None'}")
        print(f"DEBUG: Pytest stderr (first 500 chars): {result.stderr[:500] if result.stderr else 'None'}")
        
        # Parse results
        total_tests = 0
        passed_tests = 0
        failed_tests = 0
        feedback = ""
        pytest_executed = True  # pytest was executed (even if with errors)
        
        if os.path.exists(report_path):
            try:
                with open(report_path, 'r') as f:
                    report = json.load(f)
                
                print(f"DEBUG: Full JSON report structure: {json.dumps(report, indent=2)[:2000]}")
                
                # CRITICAL FIX: Count from tests array FIRST - this is most reliable
                # The tests array always exists and has the actual test results
                tests_list = report.get('tests', [])
                if tests_list:
                    # Count directly from tests array - most reliable method
                    total_tests = len(tests_list)
                    passed_tests = len([t for t in tests_list if t.get('outcome') == 'passed'])
                    failed_tests = len([t for t in tests_list if t.get('outcome') == 'failed'])
                    skipped_tests = len([t for t in tests_list if t.get('outcome') == 'skipped'])
                    print(f"DEBUG: COUNTED FROM TESTS ARRAY: total={total_tests}, passed={passed_tests}, failed={failed_tests}, skipped={skipped_tests}")
                    
                    # Log each test for debugging
                    for i, test in enumerate(tests_list):
                        nodeid = test.get('nodeid', 'unknown')
                        outcome = test.get('outcome', 'unknown')
                        print(f"DEBUG: Test {i+1}: {nodeid} - outcome: {outcome}")
                else:
                    # Fallback to summary if tests array is empty
                    summary = report.get('summary', {})
                    
                    # Try different possible structures for pytest-json-report
                    # Structure 1: report.summary.total, report.summary.passed, etc.
                    total_tests = summary.get('total', 0)
                    passed_tests = summary.get('passed', 0)
                    failed_tests = summary.get('failed', 0)
                    
                    # Structure 2: Maybe summary is directly the numbers?
                    if total_tests == 0 and isinstance(summary, dict):
                        # Try alternative keys
                        total_tests = summary.get('total_tests', summary.get('count', 0))
                        passed_tests = summary.get('passed_tests', summary.get('passed_count', 0))
                        failed_tests = summary.get('failed_tests', summary.get('failed_count', 0))
                    
                    # Structure 3: Maybe the structure is different?
                    if total_tests == 0:
                        # Try report-level keys
                        total_tests = report.get('total', report.get('total_tests', 0))
                        passed_tests = report.get('passed', report.get('passed_tests', 0))
                        failed_tests = report.get('failed', report.get('failed_tests', 0))
                    
                    print(f"DEBUG: Counted from summary: total={total_tests}, passed={passed_tests}, failed={failed_tests}")
                
                # LAST RESORT: Parse from pytest output if JSON report is empty or tests array was empty
                if total_tests == 0 and result.stdout:
                    # Try to parse from stdout: "X passed" or "X failed" or "X passed, Y failed"
                    import re
                    passed_match = re.search(r'(\d+)\s+passed', result.stdout)
                    failed_match = re.search(r'(\d+)\s+failed', result.stdout)
                    if passed_match or failed_match:
                        passed_tests = int(passed_match.group(1)) if passed_match else 0
                        failed_tests = int(failed_match.group(1)) if failed_match else 0
                        total_tests = passed_tests + failed_tests
                        print(f"DEBUG: Parsed from stdout: total={total_tests}, passed={passed_tests}, failed={failed_tests}")
                
                # Log final counts
                print(f"DEBUG: ===== FINAL TEST COUNTS =====")
                print(f"DEBUG: total_tests: {total_tests}")
                print(f"DEBUG: passed_tests: {passed_tests}")
                print(f"DEBUG: failed_tests: {failed_tests}")
                if 'tests' in report and report.get('tests'):
                    test_outcomes = {}
                    for test in report.get('tests', []):
                        outcome = test.get('outcome', 'unknown')
                        test_outcomes[outcome] = test_outcomes.get(outcome, 0) + 1
                    print(f"DEBUG: Test outcomes breakdown: {test_outcomes}")
                
                # Generate feedback from failed tests
                tests = report.get('tests', [])
                failed_tests_list = [t for t in tests if t.get('outcome') == 'failed']
                
                if failed_tests_list:
                    feedback_parts = ["Failed tests:"]
                    for test in failed_tests_list[:3]:  # Limit to first 3 failures
                        nodeid = test.get('nodeid', 'Unknown test')
                        longrepr = test.get('call', {}).get('longrepr', '')
                        if longrepr:
                            lines = longrepr.split('\n')
                            error_line = next((line for line in lines if 'AssertionError' in line), lines[0] if lines else '')
                            feedback_parts.append(f"  • {nodeid}: {error_line}")
                    feedback = '\n'.join(feedback_parts)
                elif total_tests > 0:
                    feedback = f"All {passed_tests} tests passed!"
                else:
                    feedback = "Tests executed but no test results found in report"
                    
            except (json.JSONDecodeError, IOError) as e:
                feedback = f"Failed to parse test results: {str(e)}"
                print(f"DEBUG: JSON parse error: {e}")
        else:
            # Pytest was executed but no report.json was generated
            # This could mean pytest-json-report is not installed or there was an issue
            feedback = result.stderr or result.stdout or "Test execution completed but no report generated"
            print(f"DEBUG: No report.json found. Pytest returncode: {result.returncode}")
            print(f"DEBUG: Pytest stdout: {result.stdout[:500] if result.stdout else 'None'}")
            print(f"DEBUG: Pytest stderr: {result.stderr[:500] if result.stderr else 'None'}")
        
        # Calculate score - ensure it's a float between 0 and 1
        # CRITICAL: Only calculate if we have tests
        if total_tests > 0:
            score = float(passed_tests) / float(total_tests)
            print(f"DEBUG: Score calculation: {passed_tests} / {total_tests} = {score}")
        else:
            score = 0.0
            print(f"ERROR: total_tests is 0! Cannot calculate score. Setting to 0.0")
            print(f"ERROR: This means no tests were found or counted!")
        
        # Ensure score is between 0 and 1
        score = max(0.0, min(1.0, score))
        
        print(f"DEBUG: ===== FINAL SCORE =====")
        print(f"DEBUG: Score: {score} ({score * 100}%)")
        print(f"DEBUG: passed_tests: {passed_tests}")
        print(f"DEBUG: total_tests: {total_tests}")
        print(f"DEBUG: =======================")
        
        return {
            'success': result.returncode == 0,
            'total_tests': total_tests,
            'passed_tests': passed_tests,
            'failed_tests': failed_tests,
            'score': score,
            'feedback': feedback,
            'pytest_executed': pytest_executed  # Track if pytest was actually executed
        }
        
    except subprocess.TimeoutExpired:
        # Pytest started but timed out - still counts as executed
        return {
            'success': False,
            'total_tests': 0,
            'passed_tests': 0,
            'failed_tests': 0,
            'score': 0.0,
            'feedback': 'Test execution timed out after 60 seconds',
            'pytest_executed': True  # Pytest was executed but timed out
        }
    except Exception as e:
        # Other exceptions mean pytest didn't execute
        return {
            'success': False,
            'total_tests': 0,
            'passed_tests': 0,
            'failed_tests': 0,
            'score': 0.0,
            'feedback': f'Test execution failed: {str(e)}',
            'pytest_executed': False  # Pytest didn't execute
        }

print("DEBUG: About to register /health route")  # Debug before route
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "ok": True,
        "supported_languages": plugin_manager.get_supported_languages()
    })

@app.route('/languages', methods=['GET'])
def get_languages():
    """Get information about supported languages"""
    languages_info = {}
    for language in plugin_manager.get_supported_languages():
        languages_info[language] = plugin_manager.get_plugin_info(language)
    
    return jsonify({
        "supported_languages": plugin_manager.get_supported_languages(),
        "languages_info": languages_info
    })

print("DEBUG: About to register /run route")  # Debug before route
@app.route('/run', methods=['POST'])
def run():
    print("DEBUG: /run endpoint called")  # Debug line
    payload = request.get_json(force=True)
    submission_id = payload.get('submissionId')
    assignment_id = payload.get('assignmentId')
    filename = payload.get('filename')
    
    if not submission_id or not filename:
        return jsonify({'error': 'missing fields'}), 400

    submission_zip = os.path.join(SUBMISSIONS_DIR, filename)
    print(f"DEBUG: Looking for file: {submission_zip}")  # Debug
    print(f"DEBUG: File exists: {os.path.isfile(submission_zip)}")  # Debug
    if not os.path.isfile(submission_zip):
        return jsonify({'error': 'file not found', 'path': submission_zip}), 404

    workdir = tempfile.mkdtemp(prefix=f"run_{submission_id}_")
    print(f"DEBUG: Created workdir: {workdir}")  # Debug
    try:
        # Extract submission files
        print("DEBUG: Extracting ZIP file...")  # Debug
        with zipfile.ZipFile(submission_zip, 'r') as zf:
            zf.extractall(workdir)
        print("DEBUG: ZIP extracted successfully")  # Debug

        # Get assignment information
        try:
            assignment_response = requests.get(f"{BACKEND_URL}/runner/assignments")
            assignment_response.raise_for_status()
            assignments = assignment_response.json()
            print(f"DEBUG: Got assignments: {assignments}")  # Debug
            print(f"DEBUG: Assignments type: {type(assignments)}")  # Debug
        except Exception as e:
            raise RuntimeError(f'Failed to fetch assignment info: {e}')

        # Find assignment by ID (coerce to int — JSON may deliver int or str)
        def _as_int(v):
            try:
                return int(v)
            except (TypeError, ValueError):
                return None

        target_id = _as_int(assignment_id)
        assignment = None
        if isinstance(assignments, list):
            for a in assignments:
                if isinstance(a, dict) and _as_int(a.get('id')) == target_id:
                    assignment = a
                    break
        else:
            raise RuntimeError(f'Expected list of assignments, got {type(assignments)}')
        
        if not assignment:
            raise RuntimeError(f'Assignment not found for id={assignment_id!r} (parsed={target_id})')

        # Set up test directory
        task_dir = os.path.join(TASKS_DIR, assignment['slug'])
        if not os.path.exists(task_dir):
            task_dir = os.path.join(CUSTOM_TASKS_DIR, assignment['slug'])

        tests_dir = os.path.join(task_dir, 'tests')
        
        if not os.path.exists(tests_dir):
            raise RuntimeError(f'Test directory not found: {tests_dir}')

        # Copy test files to workdir
        workdir_tests = os.path.join(workdir, 'tests')
        os.makedirs(workdir_tests, exist_ok=True)
        
        for name in os.listdir(tests_dir):
            src = os.path.join(tests_dir, name)
            dst = os.path.join(workdir_tests, name)
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
        
        print(f"DEBUG: Copied tests from {tests_dir} to {workdir_tests}")

        # Get extracted files list
        extracted_files = []
        for root, dirs, files in os.walk(workdir):
            for file in files:
                # Skip test files and files in test directories
                if not file.startswith('test_') and file.endswith('.py') and 'tests' not in root:
                    extracted_files.append(file)
        
        print(f"DEBUG: Found extracted files: {extracted_files}")

        # Determine language (from assignment or auto-detect)
        detected_language = assignment.get('language', 'python')
        if not detected_language:
            detected_language = plugin_manager.detect_language(extracted_files)
        
        if not detected_language:
            detected_language = 'python'  # Default to python
            print(f"DEBUG: Could not detect language, defaulting to python")
        else:
            print(f"DEBUG: Detected language: {detected_language}")

        # Execute tests using language plugin (simplified for Python)
        print(f"DEBUG: About to run pytest in workdir: {workdir}, tests_dir: {workdir_tests}")  # Debug
        test_result = run_pytest(workdir, workdir_tests)
        print(f"DEBUG: Test result: {test_result}")  # Debug

        # Prepare callback data
        # Always send 'completed' if pytest was executed (even if no tests found or parsing failed)
        # 'failed' status is only for execution errors before pytest runs
        pytest_was_executed = test_result.get('pytest_executed', False)
        test_count = test_result.get('total_tests', 0)
        
        # If pytest was executed, it's 'completed' even if total_tests == 0
        # (could mean no tests found, parsing error, but pytest itself ran)
        callback_status = 'completed' if pytest_was_executed else 'failed'
        
        score_value = test_result.get('score', 0.0)
        total_tests_value = test_result.get('total_tests', 0)
        passed_tests_value = test_result.get('passed_tests', 0)
        
        # CRITICAL: Ensure score is calculated correctly
        # If score is 0 but we have passed tests, recalculate
        if score_value == 0.0 and total_tests_value > 0 and passed_tests_value > 0:
            score_value = float(passed_tests_value) / float(total_tests_value)
            print(f"DEBUG: WARNING: Score was 0 but tests passed! Recalculated: {score_value}")
        
        print(f"DEBUG: ===== PREPARING CALLBACK =====")
        print(f"DEBUG: Test result score: {score_value} (type: {type(score_value)})")
        print(f"DEBUG: Test result total_tests: {total_tests_value}")
        print(f"DEBUG: Test result passed_tests: {passed_tests_value}")
        print(f"DEBUG: Score calculation: {passed_tests_value}/{total_tests_value} = {score_value}")
        print(f"DEBUG: Full test_result keys: {list(test_result.keys())}")
        print(f"DEBUG: Full test_result: {test_result}")
        
        callback_data = {
            'submissionId': submission_id,
            'status': callback_status,
            'score': float(score_value),  # Ensure it's a float
            'totalTests': int(total_tests_value),
            'passedTests': int(passed_tests_value),
            'feedback': test_result.get('feedback', ''),
            'language': 'python'
        }
        
        print(f"DEBUG: ===== CALLBACK DATA =====")
        print(f"DEBUG: Callback score: {callback_data['score']} (type: {type(callback_data['score'])})")
        print(f"DEBUG: Callback totalTests: {callback_data['totalTests']}")
        print(f"DEBUG: Callback passedTests: {callback_data['passedTests']}")
        print(f"DEBUG: Full callback_data: {callback_data}")
        
        print(f"DEBUG: Callback status: {callback_status} (tests executed: {pytest_was_executed}, total: {test_result.get('total_tests', 0)})")

        # Send results back to backend
        print(f"DEBUG: Sending callback to backend: {BACKEND_URL}/runner/callback")
        print(f"DEBUG: Callback data: {callback_data}")
        try:
            callback_response = requests.post(
                f"{BACKEND_URL}/runner/callback", 
                json=callback_data, 
                timeout=30,
                headers={'Content-Type': 'application/json'}
            )
            print(f"DEBUG: Callback response status: {callback_response.status_code}")
            print(f"DEBUG: Callback response body: {callback_response.text}")
            if callback_response.status_code != 200:
                print(f"ERROR: Callback failed with status {callback_response.status_code}")
                print(f"ERROR: Response: {callback_response.text}")
        except requests.exceptions.Timeout as e:
            print(f"ERROR: Callback timeout after 30 seconds: {e}")
        except requests.exceptions.ConnectionError as e:
            print(f"ERROR: Could not connect to backend at {BACKEND_URL}: {e}")
        except Exception as e:
            print(f"ERROR: Failed to send callback: {type(e).__name__}: {e}")
            import traceback
            print(f"ERROR: Traceback: {traceback.format_exc()}")

        return jsonify({
            'ok': True, 
            'language': 'python',
            'result': test_result
        })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"DEBUG: Error occurred: {str(e)}")  # Debug
        print(f"DEBUG: Traceback:\n{error_trace}")  # Debug
        # Send error callback
        print(f"ERROR: Sending error callback for submission {submission_id}")
        try:
            callback_response = requests.post(
                f"{BACKEND_URL}/runner/callback", 
                json={
                    'submissionId': submission_id,
                    'status': 'failed',
                    'score': 0,
                    'totalTests': 0,
                    'passedTests': 0,
                    'feedback': str(e),
                    'language': 'python'
                }, 
                timeout=30,
                headers={'Content-Type': 'application/json'}
            )
            print(f"ERROR: Error callback response: {callback_response.status_code}")
        except Exception as callback_err:
            print(f"ERROR: Failed to send error callback: {callback_err}")
            import traceback
            print(f"ERROR: Callback error traceback: {traceback.format_exc()}")
        
        return jsonify({'error': 'runner error', 'message': str(e)}), 500
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

if __name__ == '__main__':
    print(f"=== RUNNER STARTED ===")
    print(f"Starting ACA Runner on port {PORT}")
    print(f"BACKEND_URL configured as: {BACKEND_URL}")
    print(f"Callback will be sent to: {BACKEND_URL}/runner/callback")
    # Debug: Print all registered routes
    print("DEBUG: Registered routes:")
    for rule in app.url_map.iter_rules():
        print(f"  {rule.rule} -> {rule.endpoint} [{', '.join(rule.methods)}]")
    print(f"Runner listening on 0.0.0.0:{PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=False)
