import importlib.util
import sys
from pathlib import Path

def load_solution():
    # Expect solution file named solution.py at workdir root after unzip
    sol_path = Path('solution.py')
    assert sol_path.exists(), "solution.py not found in submission"
    spec = importlib.util.spec_from_file_location('solution', str(sol_path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules['solution'] = mod
    spec.loader.exec_module(mod)
    return mod

def test_returns_number():
    s = load_solution()
    assert s.fizzbuzz(1) == '1'

def test_returns_fizz():
    s = load_solution()
    assert s.fizzbuzz(3) == 'Fizz'

def test_returns_buzz():
    s = load_solution()
    assert s.fizzbuzz(5) == 'Buzz'

def test_returns_fizzbuzz():
    s = load_solution()
    assert s.fizzbuzz(15) == 'FizzBuzz'

def test_handles_zero():
    s = load_solution()
    assert s.fizzbuzz(0) == '0'

def test_handles_negative_multiples():
    s = load_solution()
    assert s.fizzbuzz(-3) == 'Fizz'







