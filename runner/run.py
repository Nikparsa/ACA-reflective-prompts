#!/usr/bin/env python3
"""
ACA Runner Entry Point
Simple wrapper to start the runner service
"""

import os
import sys

# Get the directory where this script is located
runner_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(runner_dir)

# Read runner.py and execute it
runner_file = os.path.join(runner_dir, 'runner.py')
with open(runner_file, 'r', encoding='utf-8') as f:
    runner_code = f.read()

# Create a namespace for execution
namespace = {
    '__name__': '__main__',
    '__file__': runner_file,
    'os': os,
    'sys': sys
}

# Execute the code
exec(runner_code, namespace)
