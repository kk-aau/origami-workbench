"""Regression coverage for geometry with optional accelerators/plotting absent."""

import json
import os
from pathlib import Path
import subprocess
import sys
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
OPTIONAL = ("numba", "llvmlite", "matplotlib", "PIL")
PRELUDE = """
import importlib.abc
import json
import os
import sys

blocked = set(json.loads(os.environ['PLEAT_TEST_BLOCK_MODULES']))
attempts = []
class BlockOptional(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in blocked:
            attempts.append(fullname)
            raise ModuleNotFoundError('Optional dependency blocked by test: ' + fullname, name=fullname)
sys.meta_path.insert(0, BlockOptional())
"""

GEOMETRY = """
import numpy as np
from pleat.base import orientation, signed_area
from pleat.cutting import parallelpointinpolygon, polygon_line_segment_intersections
from pleat.overlap import line_segment_intersections

square = np.array([[0., 0.], [1., 0.], [1., 1.], [0., 1.]])
points = np.array([[.5, .5], [1.5, .5], [-.1, -.1]])
inside = parallelpointinpolygon(points, square)
assert inside.dtype == np.bool_
assert inside.tolist() == [True, False, False]
assert signed_area(square) == 1.
assert signed_area(square[::-1]) == -1.
assert orientation(square) == 1
assert orientation(square[::-1]) == -1
assert orientation(np.array([[0., 0.], [1., 0.], [2., 0.]])) == 0
crossing = line_segment_intersections(np.array([[0., 0.], [1., 1.]]), np.array([[0., 1.], [1., 0.]]))
np.testing.assert_allclose(crossing, [[.5, .5]])
collinear = line_segment_intersections(np.array([[0., 0.], [2., 0.]]), np.array([[1., 0.], [3., 0.]]))
np.testing.assert_allclose(sorted(map(tuple, collinear)), [[1., 0.], [2., 0.]])
through = polygon_line_segment_intersections(square, np.array([[-.5, .5], [1.5, .5]]))
np.testing.assert_allclose(sorted(map(tuple, through)), [[0., .5], [1., .5]])
print(json.dumps({'inside': inside.tolist(), 'area': signed_area(square), 'crossing': np.asarray(crossing).tolist()}))
"""


class PleatOptionalDependencyTests(unittest.TestCase):
    def run_child(self, code, *, blocked=OPTIONAL, jit=None):
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1",
               "PYTHONPATH": os.pathsep.join((str(ROOT / "backend"), str(ROOT / "vendor/pleat"))),
               "PLEAT_TEST_BLOCK_MODULES": json.dumps(blocked), "MPLBACKEND": "Agg",
               "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1", "NUMBA_NUM_THREADS": "1"}
        if jit is None:
            env.pop("NUMBA_DISABLE_JIT", None)
        else:
            env["NUMBA_DISABLE_JIT"] = jit
        result = subprocess.run([sys.executable, "-B", "-c", textwrap.dedent(PRELUDE) + textwrap.dedent(code)],
                                cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", timeout=90)
        self.assertEqual(result.returncode, 0, result.stdout + "\n" + result.stderr)
        return result.stdout.strip()

    def test_default_and_disabled_jit_keep_geometry_without_optional_imports(self):
        for setting in (None, "1"):
            with self.subTest(NUMBA_DISABLE_JIT=setting):
                self.run_child(textwrap.dedent("""
                    import numpy as np
                    from pleat._acceleration import boolean, jit, njit, prange
                    assert prange is range and boolean is np.bool_
                    def original(x): return x + 1
                    assert jit(original) is original
                    assert jit(nopython=True)(original) is original
                    assert njit(parallel=True)(original) is original
                    assert jit('float64(float64)')(original) is original
                """) + textwrap.dedent(GEOMETRY) + """
assert attempts == [], attempts
assert not any(name.split('.')[0] in blocked for name in sys.modules)
""", jit=setting)

    def test_backend_json_generation_without_optional_dependencies(self):
        self.run_child("""
            from tessellate import generate
            cases = [
                {'tiling': 'hexagon', 'rings': 2},
                {'family': 'periodic', 'tiling': 'square', 'rows': 2, 'columns': 2},
                {'family': 'periodic', 'tiling': 'triangle', 'rows': 2, 'columns': 3},
                {'family': 'periodic', 'tiling': 'hexagon', 'rows': 2, 'columns': 2},
                {'family': 'twist', 'sides': 3, 'angle': -36},
                {'family': 'twist', 'sides': 8, 'angle': 36},
                {'family': 'archimedean', 'tiling': '3.12.12', 'rings': 1},
                {'family': 'nonperiodic', 'kind': 'voronoi', 'seed': 17},
                {'family': 'custom', 'vertices': [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]], 'faces': [[0,1,4,3],[1,2,5,4]]},
                {'family': 'ring', 'sides': 8, 'rings': 2, 'growth': 1.8},
                {'family': 'flagstone'},
                {'family': 'woven', 'weave': 'twill'},
            ]
            for index, request in enumerate(cases):
                result = generate(request)
                fold = result['fold']
                assert result['stats']['checks']['geometry']['status'] == 'passed', request
                assert result['stats']['checks']['local']['status'] in ('passed', 'not_applicable'), request
                assert 'U' not in fold['edges_assignment'], request
                assert len(fold['vertices_coords']) - len(fold['edges_vertices']) + len(fold['faces_vertices']) == 1
                json.dumps(result, allow_nan=False)
                if index == 0:
                    assert (result['stats']['vertices'], result['stats']['edges']) == (96, 180)
            assert attempts == [], attempts
            assert not any(name.split('.')[0] in blocked for name in sys.modules)
            print(json.dumps({'cases': len(cases), 'optionalImportAttempts': attempts}))
        """)

    def test_explicit_acceleration_uses_real_numba_and_same_geometry(self):
        self.run_child(textwrap.dedent("""
            from pleat._acceleration import jit
            from numba import jit as actual_jit
            assert jit is actual_jit
        """) + textwrap.dedent(GEOMETRY), blocked=("matplotlib", "PIL"), jit="0")

    def test_missing_explicit_acceleration_has_actionable_error(self):
        self.run_child("""
            try:
                import pleat.base
            except ImportError as error:
                assert 'Optional Numba acceleration was requested' in str(error)
                assert 'NUMBA_DISABLE_JIT=1' in str(error)
                assert isinstance(error.__cause__, ModuleNotFoundError)
            else:
                raise AssertionError('Explicit acceleration must report missing dependencies')
            assert attempts == ['numba'], attempts
        """, jit="0")

    def test_visualization_imports_and_literal_colors_stay_lightweight(self):
        self.run_child("""
            import numpy as np
            from pleat.colorization import _make_palette
            from pleat.half import HalfEdgeGraph
            from pleat.plotting import plot_lines, set_equal_aspect
            from pleat.rendering import Rendering, inset_poly
            np.testing.assert_allclose(_make_palette(3, ['#ff0000', '#0000ff']),
                                       [[1,0,0,1], [0,0,1,1], [1,0,0,1]])
            assert len(inset_poly([np.array([0.,0.]), np.array([1.,0.]), np.array([1.,1.]), np.array([0.,1.])], .1)) == 4
            assert attempts == [], attempts
            for draw in (lambda: _make_palette(3, 'tab10'),
                         lambda: plot_lines(np.array([[[0.,0.],[1.,1.]]])),
                         lambda: set_equal_aspect(),
                         lambda: HalfEdgeGraph().show_spring_layout(),
                         lambda: Rendering(b'<svg/>', b'', 1, 1).show()):
                try:
                    draw()
                except ImportError as error:
                    assert 'optional Matplotlib/Pillow' in str(error), str(error)
                    assert isinstance(error.__cause__, ModuleNotFoundError)
                else:
                    raise AssertionError('Plotting must report its missing optional dependencies')
            assert not any(name.split('.')[0] in blocked for name in sys.modules)
        """)

    def test_existing_plotting_and_rendering_still_work_when_installed(self):
        self.run_child("""
            import tempfile
            from pathlib import Path
            import numpy as np
            from pleat.io.fold import fold_to_graph
            from pleat.plotting import plot_polygon, set_equal_aspect
            assert 'matplotlib' not in sys.modules and 'PIL' not in sys.modules
            graph = fold_to_graph({'vertices_coords': [[0.,0.],[1.,0.],[1.,1.],[0.,1.]],
                                   'edges_vertices': [[0,1],[1,2],[2,3],[3,0]],
                                   'edges_assignment': ['B'] * 4, 'faces_vertices': [[0,1,2,3]]})
            plot_polygon(np.array([[0.,0.],[1.,0.],[1.,1.]]))
            set_equal_aspect()
            graph.show_spring_layout(figsize=(2, 2))
            rendering = graph.render(width=64, height=64)
            assert rendering.png_bytes.startswith(b'\\x89PNG\\r\\n\\x1a\\n')
            assert '<svg' in rendering._repr_svg_()
            with tempfile.TemporaryDirectory() as directory:
                base = Path(directory) / 'pattern'
                rendering.save(str(base))
                assert base.with_suffix('.png').read_bytes() == rendering.png_bytes
                assert base.with_suffix('.svg').read_bytes() == rendering.svg_bytes
            from pleat.colorization import _make_palette
            assert _make_palette(3, 'tab10').shape == (3, 4)
            assert 'matplotlib' in sys.modules and 'PIL' in sys.modules
        """, blocked=("numba", "llvmlite"))


if __name__ == "__main__":
    unittest.main()
