"""Optional Numba acceleration without loading LLVM for ordinary geometry.

The workbench runs small graphs with JIT disabled. Set ``NUMBA_DISABLE_JIT=0``
before importing Pleat to opt into the real Numba decorators when installed.
The lightweight path executes the same function bodies with NumPy dtypes.
"""

from __future__ import annotations

import os

import numpy as np


def _python_jit(signature_or_function=None, **options):
    """Support both ``@jit`` and ``@jit(...)`` without wrapping the function."""
    if callable(signature_or_function):
        return signature_or_function

    def decorate(function):
        return function

    return decorate


jit = _python_jit
njit = _python_jit
prange = range
boolean = np.bool_

if os.environ.get("NUMBA_DISABLE_JIT") == "0":
    try:
        from numba import boolean, jit, njit, prange
    except ImportError as exc:
        raise ImportError(
            "Optional Numba acceleration was requested but is unavailable. "
            "Install compatible numba/llvmlite, or use NUMBA_DISABLE_JIT=1 "
            "to run the same geometry algorithms without JIT."
        ) from exc
