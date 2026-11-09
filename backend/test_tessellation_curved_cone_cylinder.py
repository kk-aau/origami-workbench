"""Origamica In[4047]/[4050]/[4054]/[4057] ruled-fold examples."""

import math
import unittest

from tessellation_curved_cone_cylinder import (
    fold_surface_to_cone_example,
    fold_surface_to_cylinder_example,
)


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _differential(fold, side, u, t, folded, step=1e-5):
    up = fold.surface(side, u + step, t, folded=folded)
    down = fold.surface(side, u - step, t, folded=folded)
    vp = fold.surface(side, u, t + step, folded=folded)
    vn = fold.surface(side, u, t - step, folded=folded)
    du = tuple((x - y) / (2 * step) for x, y in zip(up, down))
    dt = tuple((x - y) / (2 * step) for x, y in zip(vp, vn))
    return du, dt


def _first_form(fold, side, u, t, folded):
    du, dt = _differential(fold, side, u, t, folded)
    return (_dot(du, du), _dot(du, dt), _dot(dt, dt))


def _planar_jacobian(fold, side, u, t):
    du, dt = _differential(fold, side, u, t, False)
    return du[0] * dt[1] - du[1] * dt[0]


class CurvedConeCylinderTests(unittest.TestCase):
    def assertVectorAlmostEqual(self, actual, expected, places=12):
        self.assertEqual(len(actual), len(expected))
        for got, wanted in zip(actual, expected):
            self.assertAlmostEqual(got, wanted, places)

    def test_saved_cylinder_to_cone_anchors_match_notebook_input(self):
        fold = fold_surface_to_cone_example()
        self.assertEqual(fold.singular_boundary, ('second', 1.0))
        self.assertFalse(fold.collision_checked)
        zero = fold.frame(0)
        self.assertEqual(zero['b1'], (-1, 0))
        self.assertEqual(zero['bb1'], (1, 0, -1))
        self.assertEqual(zero['b2'], (2, 0))
        self.assertEqual(zero['bb2'], (2, 0, 1))
        self.assertEqual(zero['sourceRulingParameter'], 2)
        self.assertEqual(zero['f'], (1, 0))
        self.assertEqual(zero['ff'], (1, 0, 1))
        self.assertEqual(zero['orientationSign'], 1)
        end = fold.frame(math.pi)
        v = math.pi ** 2 / 2 - 2
        self.assertAlmostEqual(end['sourceRulingParameter'], v, 12)
        self.assertVectorAlmostEqual(end['f'], (v - 1, math.pi))
        self.assertVectorAlmostEqual(end['ff'], (-1, 0, v - 1))
        for u in (-math.pi / 3, -.4, 0, 1.2, math.pi):
            frame = fold.frame(u)
            self.assertAlmostEqual(frame['sourceRulingParameter'],
                                   u * u / 2 + 2 * math.cos(u), 12)
            self.assertAlmostEqual(math.dist(frame['b2'], frame['f']),
                                   math.dist(frame['bb2'], frame['ff']), 12)
            self.assertAlmostEqual(_dot(frame['d2'], frame['d2']), 1, 12)
            self.assertAlmostEqual(_dot(frame['dd2'], frame['dd2']), 1, 12)

    def test_saved_cone_to_cylinder_anchors_match_notebook_input(self):
        fold = fold_surface_to_cylinder_example()
        self.assertEqual(fold.singular_boundary, ('first', 0.0))
        self.assertFalse(fold.collision_checked)
        c = math.sqrt(3) / 2
        start = fold.frame(0)
        self.assertAlmostEqual(start['sourceRulingParameter'], 1, 12)
        self.assertVectorAlmostEqual(start['f'], (1, 0))
        self.assertVectorAlmostEqual(start['ff'], (c, -.5, 0))
        self.assertVectorAlmostEqual(start['b2'], (1.25, 0))
        self.assertVectorAlmostEqual(start['bb2'], (.75 * c, -.625, 0))
        self.assertVectorAlmostEqual(start['d2'], (-1, 0))
        self.assertVectorAlmostEqual(start['dd2'], (c, .5, 0))
        end = fold.frame(math.pi)
        self.assertAlmostEqual(end['sourceRulingParameter'], 1.5, 12)
        self.assertVectorAlmostEqual(end['f'], (0, 1.5))
        self.assertVectorAlmostEqual(end['ff'], (1.5 * c, .75, 0))
        for u in (0, .6, 1.5, math.pi):
            frame = fold.frame(u)
            # The cylinder axes are fixed and parallel to their directors.
            self.assertAlmostEqual(frame['b2'][0], 1.25, 12)
            delta = tuple(x - y for x, y in zip(frame['bb2'],
                                                 frame['foldedAxisPoint']))
            self.assertAlmostEqual(_dot(delta, frame['dd2']), 0, 12)
            self.assertAlmostEqual(math.dist(frame['b2'], frame['f']),
                                   math.dist(frame['bb2'], frame['ff']), 12)

    def test_both_sides_have_matching_first_fundamental_forms(self):
        folds = (fold_surface_to_cone_example(),
                 fold_surface_to_cylinder_example(),
                 fold_surface_to_cylinder_example(20, .6))
        for fold in folds:
            span = fold.parameter_end - fold.parameter_start
            for u in (fold.parameter_start + .18 * span,
                      fold.parameter_start + .5 * span,
                      fold.parameter_start + .83 * span):
                for side in ('first', 'second'):
                    for t in (.12, .48, .87):
                        with self.subTest(kind=fold.kind, u=u, side=side, t=t):
                            flat = _first_form(fold, side, u, t, False)
                            spatial = _first_form(fold, side, u, t, True)
                            for flat_value, spatial_value in zip(flat, spatial):
                                self.assertAlmostEqual(flat_value, spatial_value,
                                                       delta=3e-8)

    def test_common_crease_boundary_and_non_singular_interior(self):
        for fold in (fold_surface_to_cone_example(),
                     fold_surface_to_cylinder_example(),
                     fold_surface_to_cylinder_example(5, .01)):
            span = fold.parameter_end - fold.parameter_start
            for u in (fold.parameter_start, fold.parameter_start + .2 * span,
                      fold.parameter_start + .7 * span, fold.parameter_end):
                frame = fold.frame(u)
                self.assertVectorAlmostEqual(
                    fold.surface('first', u, 1), frame['f'])
                self.assertVectorAlmostEqual(
                    fold.surface('second', u, 0), frame['f'])
                self.assertVectorAlmostEqual(
                    fold.surface('first', u, 1, folded=True), frame['ff'])
                self.assertVectorAlmostEqual(
                    fold.surface('second', u, 0, folded=True), frame['ff'])
                if fold.kind == 'cylinder-to-cone':
                    self.assertVectorAlmostEqual(
                        fold.surface('second', u, 1), (2, 0))
                    self.assertVectorAlmostEqual(
                        fold.surface('second', u, 1, folded=True), (2, 0, 1))
                else:
                    self.assertVectorAlmostEqual(
                        fold.surface('first', u, 0), (0, 0))
                    self.assertVectorAlmostEqual(
                        fold.surface('first', u, 0, folded=True), (0, 0, 0))
            for u in (fold.parameter_start + .18 * span,
                      fold.parameter_start + .5 * span,
                      fold.parameter_start + .82 * span):
                for side in ('first', 'second'):
                    for t in (.1, .5, .9):
                        self.assertGreater(abs(_planar_jacobian(fold, side, u, t)),
                                           1e-4)
                singular_side, singular_t = fold.singular_boundary
                # Along an apex boundary every u names the same point;
                # the u-tangent vanishes and the surface Jacobian is zero.
                self.assertVectorAlmostEqual(
                    fold.surface(singular_side, u - 1e-5, singular_t),
                    fold.surface(singular_side, u + 1e-5, singular_t))

    def test_rejects_outside_validated_subdomain(self):
        invalid_cone_intervals = ((-math.pi / 3 - .001, math.pi),
                                  (-math.pi / 3, math.pi + .001),
                                  (0, 0), (math.nan, 1), (0, math.inf))
        for interval in invalid_cone_intervals:
            with self.subTest(interval=interval), self.assertRaises(ValueError):
                fold_surface_to_cone_example(*interval)
        for bad in (4.99, 30.01, math.nan, True):
            with self.subTest(angle=bad), self.assertRaises(ValueError):
                fold_surface_to_cylinder_example(cone_angle_deg=bad)
        for bad in (0, -1, 2.01, math.inf, False):
            with self.subTest(offset=bad), self.assertRaises(ValueError):
                fold_surface_to_cylinder_example(cylinder_axis_offset=bad)
        for interval in ((-.001, math.pi), (0, math.pi + .001),
                         (1, .5)):
            with self.subTest(interval=interval), self.assertRaises(ValueError):
                fold_surface_to_cylinder_example(parameter_start=interval[0],
                                                 parameter_end=interval[1])
        fold = fold_surface_to_cone_example()
        for arguments in (('first', math.pi + .01, .5),
                          ('third', 0, .5), ('first', 0, 1.01),
                          ('second', 0, math.nan)):
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                fold.surface(*arguments)


if __name__ == '__main__':
    unittest.main()
