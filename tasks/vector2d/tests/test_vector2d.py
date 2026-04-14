import importlib.util
import sys
from pathlib import Path

def load_solution():
    sol_path = Path('solution.py')
    assert sol_path.exists(), "solution.py not found in submission"
    spec = importlib.util.spec_from_file_location('solution', str(sol_path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules['solution'] = mod
    spec.loader.exec_module(mod)
    return mod

def test_vector_creation():
    s = load_solution()
    v = s.Vector2D(3, 4)
    assert v.x == 3
    assert v.y == 4

def test_vector_addition():
    s = load_solution()
    v1 = s.Vector2D(1, 2)
    v2 = s.Vector2D(3, 4)
    result = v1 + v2
    assert result.x == 4
    assert result.y == 6

def test_vector_magnitude():
    s = load_solution()
    v = s.Vector2D(3, 4)
    assert abs(v.magnitude() - 5.0) < 0.001

def test_vector_scalar_multiplication():
    s = load_solution()
    v = s.Vector2D(2, 3)
    result = v * 2
    assert result.x == 4
    assert result.y == 6

def test_vector_dot_product():
    s = load_solution()
    v1 = s.Vector2D(1, 2)
    v2 = s.Vector2D(3, 4)
    assert v1.dot(v2) == 11







