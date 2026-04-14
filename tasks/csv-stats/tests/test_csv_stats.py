import importlib.util
import sys
from pathlib import Path
import math

def load_solution():
    sol_path = Path('solution.py')
    assert sol_path.exists(), "solution.py not found in submission"
    spec = importlib.util.spec_from_file_location('solution', str(sol_path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules['solution'] = mod
    spec.loader.exec_module(mod)
    return mod

def test_calculate_mean():
    s = load_solution()
    data = [1, 2, 3, 4, 5]
    assert s.calculate_mean(data) == 3.0

def test_calculate_median():
    s = load_solution()
    data = [1, 2, 3, 4, 5]
    assert s.calculate_median(data) == 3.0
    
    data2 = [1, 2, 3, 4]
    assert s.calculate_median(data2) == 2.5

def test_calculate_std():
    s = load_solution()
    data = [1, 2, 3, 4, 5]
    std = s.calculate_std(data)
    # Expect population standard deviation (divide by N)
    expected_std = math.sqrt(2.0)
    assert abs(std - expected_std) < 0.02

def test_empty_data():
    s = load_solution()
    data = []
    assert s.calculate_mean(data) == 0
    assert s.calculate_median(data) == 0
    assert s.calculate_std(data) == 0







