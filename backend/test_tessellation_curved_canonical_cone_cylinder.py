"""Independent invariant checks for canonical saved In[3826]/In[3830]."""

import math
import unittest

from tessellation_curved_canonical_cone_cylinder import (
    CASES, THETA, canonical_director, canonical_directrix, canonical_point,
    cross_curve_point, derived_flat_point, first_form, raw_director,
    raw_directrix, raw_point, saved_input,
)


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _partial(fn, u, v, du, dv):
    h = 1e-5
    a, b = fn(u + du * h, v + dv * h), fn(u - du * h, v - dv * h)
    return tuple((x - y) / (2 * h) for x, y in zip(a, b))


class CanonicalSavedSystemTests(unittest.TestCase):
    def test_fixed_source_inputs_and_boundary(self):
        cylinder = saved_input('cylinder-in3826')
        cone = saved_input('cone-in3830')
        self.assertEqual(cylinder['sourceFunction'], 'CanonicalCylinderDevelopableSystem')
        self.assertEqual(cone['sourceFunction'], 'CanonicalConeDevelopableSystem')
        self.assertEqual(cylinder['uRange'], [-math.pi / 4, 3 * math.pi / 4])
        self.assertEqual(cone['uRange'], [0, math.pi])
        self.assertEqual(cone['sourceConeAngleDeg'], 30)
        for case in CASES:
            data = saved_input(case)
            self.assertEqual(data['displayedRulingRange'], [0, 1])
            self.assertEqual(data['sourceDirectorLength'], 2)
            self.assertTrue(data['crossCurveAliasesSurface'])
            self.assertTrue(data['flatDevelopmentDerivedLocally'])
            for key in ('numericWolframOutAvailable', 'exactStraightCreaseFOLD',
                        'adoptableCreasePattern', 'motionVerified',
                        'selfCollisionVerified'):
                self.assertFalse(data[key])
        self.assertFalse(cone['regularAtFirstRuling'])
        self.assertTrue(cylinder['regularAtFirstRuling'])

    def test_original_director_is_normalized_and_cylinder_base_is_projected(self):
        for case in CASES:
            lo, hi = saved_input(case)['uRange']
            for i in range(17):
                u = lo + (hi - lo) * i / 16
                self.assertAlmostEqual(math.dist(raw_director(case, u), (0, 0, 0)), 2)
                self.assertAlmostEqual(math.dist(canonical_director(case, u), (0, 0, 0)), 1)
                self.assertLess(math.dist(cross_curve_point(case, u, .37),
                                          canonical_point(case, u, .37)), 1e-14)
                if case == 'cylinder-in3826':
                    self.assertEqual(canonical_directrix(case, u),
                                     (math.cos(u), math.sin(u), 0.))
                    self.assertAlmostEqual(_dot(canonical_directrix(case, u),
                                                 canonical_director(case, u)), 0)
                else:
                    self.assertEqual(canonical_directrix(case, u), (0., 0., .5))
        self.assertEqual(raw_directrix('cylinder-in3826', 0), (1, 0, 0))
        self.assertEqual(canonical_director('cylinder-in3826', 0), (0, 0, 1))

    def test_canonical_ruling_is_the_same_infinite_line_not_the_same_finite_patch(self):
        for u in (-math.pi / 4, .4, 3 * math.pi / 4):
            for lam in (0, .25, 1):
                self.assertLess(math.dist(raw_point('cylinder-in3826', u, lam),
                    canonical_point('cylinder-in3826', u, 2 * u + 2 * lam)), 1e-12)
        for u in (0, .4, math.pi):
            for lam in (0, .25, 1):
                self.assertLess(math.dist(raw_point('cone-in3830', u, lam),
                    canonical_point('cone-in3830', u, 2 * lam)), 1e-12)
        self.assertNotEqual(raw_point('cylinder-in3826', 1, 0),
                            canonical_point('cylinder-in3826', 1, 0))
        self.assertNotEqual(raw_point('cone-in3830', 1, 1),
                            canonical_point('cone-in3830', 1, 1))

    def test_canonical_surface_and_derived_flat_map_have_equal_local_metric(self):
        for case in CASES:
            lo, hi = saved_input(case)['uRange']
            for u in (lo + .2 * (hi - lo), (lo + hi) / 2,
                      lo + .8 * (hi - lo)):
                for v in (.2, .5, .8):
                    expected = first_form(case, v)
                    for fn in ((lambda uu, vv: canonical_point(case, uu, vv)),
                               (lambda uu, vv: derived_flat_point(case, uu, vv))):
                        pu = _partial(fn, u, v, 1, 0)
                        pv = _partial(fn, u, v, 0, 1)
                        self.assertAlmostEqual(_dot(pu, pu), expected['E'], delta=2e-9)
                        self.assertAlmostEqual(_dot(pu, pv), expected['F'], delta=2e-9)
                        self.assertAlmostEqual(_dot(pv, pv), expected['G'], delta=2e-9)
                    self.assertTrue(expected['regular'])
        self.assertFalse(first_form('cone-in3830', 0)['regular'])
        self.assertAlmostEqual(first_form('cone-in3830', 1)['area'], math.sin(THETA))
        self.assertTrue(first_form('cylinder-in3826', 0)['regular'])

    def test_developability_and_invalid_source_ranges(self):
        # Canonical cylinder d'=0; canonical cone b'=0, so the ruled
        # developability determinant det(b',d,d') vanishes identically.
        for case in CASES:
            lo, hi = saved_input(case)['uRange']
            u = (lo + hi) / 2
            bu = _partial(lambda uu, vv: canonical_directrix(case, uu),
                          u, .5, 1, 0)
            du = _partial(lambda uu, vv: canonical_director(case, uu),
                          u, .5, 1, 0)
            d = canonical_director(case, u)
            triple = _dot(bu, (d[1]*du[2]-d[2]*du[1],
                               d[2]*du[0]-d[0]*du[2],
                               d[0]*du[1]-d[1]*du[0]))
            self.assertAlmostEqual(triple, 0, delta=1e-12)
        with self.assertRaises(ValueError):
            saved_input('other')
        with self.assertRaises(ValueError):
            canonical_point('cone-in3830', math.pi + .1, .3)
        with self.assertRaises(ValueError):
            derived_flat_point('cylinder-in3826', 0, float('nan'))


if __name__ == '__main__':
    unittest.main()
