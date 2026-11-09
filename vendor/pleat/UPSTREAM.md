# Pleat provenance

- Source: https://github.com/imagirom/pleat
- Fixed revision: `6a7015834b3357290a1678abf35b613987b07c44`
- Original author: Roman Remme; code license: MIT, preserved in `LICENSE`.
- Imported: Python package source only. No `docs/`, notebook photographs,
  example images, upstream `.git`, trained models, or external solver executables.
- Local adaptation: top-level `pleat/__init__.py` no longer eagerly imports every
  public module. This prevents unrelated optional dependencies from loading.
- Local adaptation (2026-09-20): `flat_foldable.max_kawasaki_sum` returns zero
  for patches with no interior vertices and reduces absolute residuals as
  documented, allowing two-face custom meshes through the upstream pipeline.
- Local adaptation (2026-10-18): `_acceleration.py` supplies the unmodified
  Python geometry functions by default, with identity `jit`/`njit`, serial
  `prange`, and a NumPy boolean dtype. This avoids importing Numba/LLVM when
  JIT is disabled. Setting `NUMBA_DISABLE_JIT=0` before importing Pleat opts
  into real Numba acceleration and requires compatible Numba/llvmlite.
- Local adaptation (2026-10-18): geometry modules no longer eagerly import
  Matplotlib/Pillow through plotting helpers or colormap lookup. Visualization
  entry points load these optional dependencies only when used and report a
  missing-dependency error; the original plotting algorithms remain available
  in source environments that install the dependencies.
- Application entry point: `../../backend/tessellate.py` uses the original
  tiling, Shrink-Rotate, crease assignment and FOLD export algorithms.
- The shipped application does not call Pleat's ILP layer-order solver, rendering
  UI, notebook integrations, or the external Origami Simulator website.

The dependency environment is private to this workbench. `requirements-lock.txt`
records the tested dependency versions; third-party wheel licenses remain with
their installed packages. Binary packaging and redistribution require a further
dependency/license audit; this source checkout is not such an installer.
