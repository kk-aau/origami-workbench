from __future__ import annotations

import json
import math
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from tessellate import check_geometry, check_local_conditions, generate, validate_request


class TessellateTests(unittest.TestCase):
    def test_defaults(self):
        self.assertEqual(validate_request({}), {"tiling": "square", "rings": 1, "angle": 36.0, "scale": 0.5})

    def test_bad_inputs(self):
        cases = [None, [], "x", {"tiling": "pentagon"}, {"tiling": []},
                 {"rings": -1}, {"rings": 4}, {"rings": 1.5}, {"rings": True},
                 {"angle": 0}, {"angle": 90}, {"angle": -90}, {"angle": "36"},
                 {"angle": float("nan")}, {"angle": float("inf")}, {"angle": 10 ** 1000},
                 {"scale": 0.19}, {"scale": 0.86}, {"scale": False}, {"x": 1}]
        for data in cases:
            with self.subTest(data=str(data)[:120]), self.assertRaises(ValueError):
                validate_request(data)

    def test_supported_tilings_and_rings(self):
        for tiling in ("square", "triangle", "hexagon"):
            for rings in (0, 1, 2, 3):
                with self.subTest(tiling=tiling, rings=rings):
                    result = generate({"tiling": tiling, "rings": rings})
                    stats, fold = result["stats"], result["fold"]
                    self.assertGreater(stats["vertices"], 0)
                    self.assertEqual(stats["vertices"], len(fold["vertices_coords"]))
                    self.assertEqual(len(fold["edges_vertices"]), len(fold["edges_assignment"]))
                    self.assertEqual(len(fold["edges_vertices"]), len(fold["edges_foldAngle"]))
                    self.assertEqual(stats["vertices"] - stats["edges"] + stats["faces"], 1)
                    self.assertEqual(stats["checks"]["geometry"]["status"], "passed")
                    self.assertEqual(stats["checks"]["local"]["status"], "passed" if rings else "not_applicable")
                    self.assertEqual(stats["checks"]["layerOrder"]["status"], "not_checked")
                    self.assertEqual(stats["foldability"], "candidate")
                    self.assertTrue(result["warnings"])
                    for xy in fold["vertices_coords"]:
                        self.assertEqual(len(xy), 2)
                        self.assertTrue(all(math.isfinite(x) for x in xy))
                    for edge, assignment, angle in zip(fold["edges_vertices"], fold["edges_assignment"], fold["edges_foldAngle"]):
                        self.assertTrue(all(isinstance(v, int) and 0 <= v < stats["vertices"] for v in edge))
                        self.assertEqual(angle, {"M": -180, "V": 180, "B": None, "U": None}[assignment])
                    if rings:
                        self.assertGreater(stats["mountainEdges"], 0)
                        self.assertGreater(stats["valleyEdges"], 0)

    def test_parameter_exploration_matrix(self):
        outcomes = {}
        for tiling in ("square", "triangle", "hexagon"):
            for angle in (-60, -36, -18, 18, 36, 60):
                for scale in (0.2, 0.5, 0.85):
                    with self.subTest(tiling=tiling, angle=angle, scale=scale):
                        result = generate({"tiling": tiling, "rings": 1, "angle": angle, "scale": scale})
                        checks = result["stats"]["checks"]
                        key = (checks["geometry"]["status"], checks["local"]["status"])
                        outcomes[key] = outcomes.get(key, 0) + 1
                        self.assertEqual(result["stats"]["foldability"], "candidate")
                        if "failed" in key:
                            self.assertGreaterEqual(len(result["warnings"]), 2)
        self.assertEqual(outcomes, {("passed", "passed"): 36, ("failed", "failed"): 12, ("failed", "passed"): 6})

    def test_parameters_change_real_geometry(self):
        base = generate({})["fold"]["vertices_coords"]
        rotated = generate({"angle": 18})["fold"]["vertices_coords"]
        scaled = generate({"scale": 0.7})["fold"]["vertices_coords"]
        canonical = lambda coords: sorted(tuple(round(v, 7) for v in p) for p in coords)
        self.assertNotEqual(canonical(base), canonical(rotated))
        self.assertNotEqual(canonical(base), canonical(scaled))

    def test_extreme_parameters_do_not_claim_validity(self):
        result = generate({"tiling": "square", "angle": 70, "scale": 0.85})
        self.assertEqual(result["stats"]["foldability"], "candidate")
        self.assertTrue(result["warnings"])
        self.assertEqual(result["stats"]["checks"]["geometry"]["status"], "failed")

    def test_independent_checker_negative_controls(self):
        # Four equal sectors satisfy Kawasaki; 2M2V violates Maekawa.
        fold = {"vertices_coords": [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]],
                "edges_vertices": [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1]],
                "edges_assignment": ["M", "M", "V", "V", "B", "B", "B", "B"]}
        checks = check_local_conditions(fold)
        self.assertEqual(checks["kawasakiViolations"], [])
        self.assertEqual(checks["maekawaViolations"], [0])
        fold["edges_assignment"][2] = "M"
        self.assertEqual(check_local_conditions(fold)["status"], "passed")
        fold["vertices_coords"][2] = [0.5, 1]
        self.assertEqual(check_local_conditions(fold)["status"], "failed")
        crossing = {"vertices_coords": [[0, 0], [1, 1], [0, 1], [1, 0]], "edges_vertices": [[0, 1], [2, 3]]}
        self.assertEqual(check_geometry(crossing)["crossingCount"], 1)

    def test_cli_json_only_and_errors(self):
        def invoke(raw):
            return subprocess.run([sys.executable, str(ROOT / "backend" / "tessellate.py")], input=raw,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        result = invoke(b'{"tiling":"square","rings":1,"angle":36,"scale":0.5}')
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
        self.assertEqual(result.stderr, b"")
        self.assertIn("fold", json.loads(result.stdout))
        for raw in (b'{"angle":NaN}', b'{"angle":1e999}', b'{', b'x' * 4097, b'{"rings":4}'):
            with self.subTest(raw=raw[:60]):
                result = invoke(raw)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, b"")
                self.assertIn("失败", result.stderr.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
