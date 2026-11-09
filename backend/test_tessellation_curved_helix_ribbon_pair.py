"""Independent geometric checks for the Origamica RibbonPair helix subdomain."""

import math
import unittest

from tessellation_curved_helix_ribbon_pair import certify_helix_ribbon_pair


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def derivative(fn, x, step=1.0e-5):
    a, b = fn(x + step), fn(x - step)
    return tuple((u - v) / (2.0 * step) for u, v in zip(a, b))


def determinant(a, b, c):
    return dot(a, (b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]))


class HelixRibbonPairTests(unittest.TestCase):
    def test_saved_source_values_and_initial_conditions(self):
        pair = certify_helix_ribbon_pair()
        self.assertAlmostEqual(pair.speed, math.sqrt(5.0) / 2.0, places=12)
        self.assertAlmostEqual(pair.curvature, 0.8, places=12)
        self.assertAlmostEqual(pair.torsion, 0.4, places=12)
        self.assertAlmostEqual(pair.focal_distance, 2.4011330043795467, places=11)
        frame = pair.frame(0.0)
        self.assertEqual(frame["flat_base"], (0.0, 0.0))
        self.assertEqual(frame["flat_tangent"], (1.0, 0.0))
        self.assertEqual(frame["space_base"], (1.0, 0.0, 0.0))
        for actual, expected in zip(
            frame["space_director"],
            (-0.3959129742450123, -0.0902153862014623, -0.913845775236166),
        ):
            self.assertAlmostEqual(actual, expected, places=12)
        self.assertAlmostEqual(dot(frame["flat_director"], frame["flat_director"]), 1.0, places=12)
        self.assertAlmostEqual(dot(frame["space_director"], frame["space_director"]), 1.0, places=12)

    def test_independent_finite_difference_metric_and_developability(self):
        for pair in (
            certify_helix_ribbon_pair(),
            certify_helix_ribbon_pair(radius=1.4, pitch=0.3, eta=0.3 * math.pi, orientation=-1),
        ):
            for s in (pair.start + 0.2, pair.start + 1.3, pair.end - 0.2):
                frame = pair.frame(s)
                curve_prime = derivative(lambda x: pair.frame(x)["space_base"], s)
                director_prime = derivative(lambda x: pair.frame(x)["space_director"], s)
                self.assertLess(abs(determinant(curve_prime, frame["space_director"], director_prime)), 2.0e-9)
                for v in (-pair.half_width * 0.8, 0.0, pair.half_width * 0.8):
                    e, f, g, area = pair.first_form(v)
                    self.assertGreater(area, 0.0)
                    for space in ("flat", "space"):
                        ds = derivative(lambda x: pair.surface(space, x, v), s)
                        dv = derivative(lambda x: pair.surface(space, s, x), v)
                        self.assertAlmostEqual(dot(ds, ds), e, delta=2.0e-9)
                        self.assertAlmostEqual(dot(ds, dv), f, delta=2.0e-9)
                        self.assertAlmostEqual(dot(dv, dv), g, delta=2.0e-9)

    def test_focal_limit_and_invalid_inputs(self):
        pair = certify_helix_ribbon_pair()
        with self.assertRaisesRegex(ValueError, "focal distance"):
            certify_helix_ribbon_pair(half_width=pair.focal_distance)
        for kwargs in (
            {"radius": 0.0},
            {"pitch": 0.0},
            {"eta": 0.0},
            {"eta": math.pi / 2.0},
            {"orientation": 0},
            {"end": 2.0 * math.pi},
            {"half_width": float("nan")},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                certify_helix_ribbon_pair(**kwargs)
        with self.assertRaises(ValueError):
            pair.surface("space", pair.start, pair.half_width + 0.1)

    def test_paired_samples_do_not_claim_exact_straight_edge_isometry(self):
        pair = certify_helix_ribbon_pair()
        sample = pair.sample(curve_segments=1, ruling_segments=2)
        self.assertEqual(sample["base_indices"], [1, 4])
        for index in sample["base_indices"]:
            s, v = sample["parameters"][index]
            self.assertEqual(v, 0.0)
            self.assertEqual(sample["flat"][index], pair.surface("flat", s, 0.0))
            self.assertEqual(sample["space"][index], pair.surface("space", s, 0.0))
        a, b = sample["base_indices"]
        flat_chord = math.dist(sample["flat"][a], sample["flat"][b])
        space_chord = math.dist(sample["space"][a], sample["space"][b])
        self.assertGreater(abs(flat_chord - space_chord), 0.2)
        self.assertFalse(sample["sampled_mesh_exact_isometry"])
        self.assertFalse(sample["self_collision_checked"])
        self.assertNotIn("faces", sample)


if __name__ == "__main__":
    unittest.main()
