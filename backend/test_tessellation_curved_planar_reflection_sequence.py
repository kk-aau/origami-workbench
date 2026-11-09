"""Analytic saved planar-mirror sequence checks for In[4039]/[4040]/[4043]."""

import math
import unittest

from tessellation_curved_planar_reflection_sequence import (
    CASES, THETA, TILT, cut_distances, flat_point, metric, saved_curve,
    saved_sequence_input, stage_surface,
)


def _dist(a, b):
    return math.dist(a, b)


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _partial(fn, u, v, du, dv):
    step = 1e-5
    a, b = fn(u + du * step, v + dv * step), fn(u - du * step, v - dv * step)
    return tuple((x - y) / (2 * step) for x, y in zip(a, b))


class SavedPlanarReflectionSequenceTests(unittest.TestCase):
    def test_exact_saved_inputs_and_capability_boundary(self):
        for case, cells, planes, compose in (
                ('cone-symbolic', ['In[4038]', 'In[4039]'], 4, True),
                ('cylinder-symbolic', ['In[4038]', 'In[4040]'], 2, False),
                ('cone-numeric-input', ['In[4042]', 'In[4043]'], 4, True)):
            result = saved_sequence_input(case)
            self.assertEqual(result['sourceCells'], cells)
            self.assertEqual(result['composeReflections'], compose)
            self.assertEqual(len(result['planes']), planes)
            self.assertEqual(result['patchCount'], planes if compose else planes + 1)
            self.assertEqual(result['curveCount'], planes + 1 if compose else planes + 2)
            self.assertTrue(result['continuousLocalIsometryVerified'])
            for key in ('numericInterpolationReproduced', 'exactStraightCreaseFOLD',
                        'adoptableCreasePattern', 'mountainValleyVerified',
                        'layerOrderVerified', 'motionVerified', 'selfCollisionVerified'):
                self.assertFalse(result[key], key)
        cone = saved_sequence_input('cone-symbolic')
        self.assertEqual(cone['uRange'], [0, math.pi])
        self.assertAlmostEqual(cone['outerRuling'], 4 / math.cos(THETA))
        self.assertEqual(cone['planes'][1]['point'], [0, 0, 2])
        self.assertAlmostEqual(cone['planes'][1]['normal'][1], -math.sin(TILT))
        self.assertAlmostEqual(cone['planes'][2]['normal'][0], math.sin(TILT))
        cylinder = saved_sequence_input('cylinder-symbolic')
        self.assertEqual(cylinder['uRange'], [-math.pi / 4, math.pi / 4])
        self.assertEqual(cylinder['outerRuling'], 3)

    def test_saved_cut_functions_are_strictly_ordered(self):
        s, c = math.sin(THETA), math.cos(THETA)
        st, ct = math.sin(TILT), math.cos(TILT)
        for index in range(65):
            u = math.pi * index / 64
            actual = cut_distances('cone-symbolic', u)
            expected = [0, 1 / c, 2 * ct / (c * ct - s * st * math.sin(u)),
                        3 * ct / (c * ct + s * st * math.cos(u)), 4 / c]
            self.assertLess(max(abs(a - b) for a, b in zip(actual, expected)), 1e-12)
            self.assertTrue(all(a < b for a, b in zip(actual, actual[1:])))
            self.assertEqual(actual, cut_distances('cone-numeric-input', u))
        for index in range(65):
            u = -math.pi / 4 + index * math.pi / 128
            actual = cut_distances('cylinder-symbolic', u)
            self.assertLess(max(abs(a - b) for a, b in zip(
                actual, [0, math.cos(u), 1 + math.cos(u), 3])), 1e-12)
            self.assertTrue(all(a < b for a, b in zip(actual, actual[1:])))

    def test_consecutive_reflections_share_every_exact_crease(self):
        for case in CASES:
            lo, hi = saved_sequence_input(case)['uRange']
            n = len(saved_sequence_input(case)['planes'])
            for index in range(33):
                u = lo + (hi - lo) * index / 32
                distances = cut_distances(case, u)
                for fold in range(1, n + 1):
                    before = stage_surface(case, u, distances[fold], fold - 1)
                    after = stage_surface(case, u, distances[fold], fold)
                    self.assertLess(_dist(before, after), 1e-12)
                    self.assertLess(_dist(saved_curve(case, u, fold), before), 1e-12)
                self.assertLess(_dist(saved_curve(case, u, 0),
                                      stage_surface(case, u, 0, 0)), 1e-12)
                if case == 'cylinder-symbolic':
                    self.assertLess(_dist(saved_curve(case, u, 3),
                                          stage_surface(case, u, 3, 2)), 1e-12)

    def test_second_mirror_tracks_the_saved_compose_option(self):
        cone_u = math.pi / 2
        cone = saved_sequence_input('cone-symbolic')
        cone_curve = saved_curve('cone-symbolic', cone_u, 2)
        p = cone['planes'][1]['point']
        n = cone['planes'][1]['normal']
        reflected_p = (p[0], p[1], 2 - p[2])
        reflected_n = (n[0], n[1], -n[2])
        self.assertLess(abs(_dot(tuple(a - b for a, b in zip(cone_curve, reflected_p)),
                                 reflected_n)), 1e-12)
        self.assertGreater(abs(_dot(tuple(a - b for a, b in zip(cone_curve, p)), n)), .1)

        cylinder_u = 0
        cylinder = saved_sequence_input('cylinder-symbolic')
        cylinder_curve = saved_curve('cylinder-symbolic', cylinder_u, 2)
        p = cylinder['planes'][1]['point']
        n = cylinder['planes'][1]['normal']
        self.assertLess(abs(_dot(tuple(a - b for a, b in zip(cylinder_curve, p)), n)), 1e-12)

    def test_each_continuous_patch_matches_its_2d_first_fundamental_form(self):
        for case in CASES:
            lo, hi = saved_sequence_input(case)['uRange']
            for u in (lo + .2 * (hi - lo), (lo + hi) / 2,
                      lo + .8 * (hi - lo)):
                cuts = cut_distances(case, u)
                for stage, (a, b) in enumerate(zip(cuts, cuts[1:])):
                    v = (a + b) / 2
                    expected = metric(case, v)
                    for fn in ((lambda uu, vv: stage_surface(case, uu, vv, stage)),
                               (lambda uu, vv: flat_point(case, uu, vv))):
                        pu = _partial(fn, u, v, 1, 0)
                        pv = _partial(fn, u, v, 0, 1)
                        self.assertAlmostEqual(_dot(pu, pu), expected['E'], delta=2e-8)
                        self.assertAlmostEqual(_dot(pu, pv), 0, delta=2e-8)
                        self.assertAlmostEqual(_dot(pv, pv), 1, delta=2e-8)
                    self.assertTrue(expected['regular'])
        self.assertFalse(metric('cone-symbolic', 0)['regular'])
        self.assertTrue(metric('cylinder-symbolic', 0)['regular'])

    def test_numeric_input_is_exact_formula_replay_not_wolfram_interpolation(self):
        for u in (0, math.pi / 7, math.pi / 2, math.pi):
            cuts = cut_distances('cone-symbolic', u)
            for stage in range(5):
                for v in (cuts[stage], cuts[-1]):
                    self.assertEqual(stage_surface('cone-symbolic', u, v, stage),
                                     stage_surface('cone-numeric-input', u, v, stage))
        with self.assertRaises(ValueError):
            saved_sequence_input('other')
        with self.assertRaises(ValueError):
            cut_distances('cone-symbolic', math.pi + .1)


if __name__ == '__main__':
    unittest.main()
