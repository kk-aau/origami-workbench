"""Source-anchored tests for the general Origamica curved-fold equations."""

import math
import unittest

import sympy as sp

from tessellation_curved_space_curve import (
    flatten_fold_2d, fold_space_curve_3d, nflatten_fold_2d,
    nspace_curve_fold_3d,
)
from tessellation_curved_uniform_helix import uniform_helix_curved_fold_frame


U = sp.symbols('u', real=True)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def surface_point(frame, prefix, side, distance):
    crease = frame[f'{prefix}Crease']
    ruling = frame[f'{prefix}{side}Ruling']
    return tuple(x + distance * r for x, r in zip(crease, ruling))


class SpaceCurveFoldTests(unittest.TestCase):
    def assert_close(self, actual, expected, tolerance=2e-8):
        self.assertLessEqual(abs(actual - expected), tolerance,
                             f'{actual} != {expected}')

    def assert_smooth_metric(self, flat, parameters, distances):
        """Independent finite differences of the two smooth parameter maps."""
        step = 2e-5
        for u in parameters:
            before, now, after = (flat.frame(value) for value in
                                  (u - step, u, u + step))
            tangent3 = tuple((a - b) / (2 * step) for a, b in zip(
                after['foldedCrease'], before['foldedCrease']))
            for side in ('Left', 'Right'):
                r3 = now[f'folded{side}Ruling']
                r2 = now[f'flat{side}Ruling']
                rprime = tuple((a - b) / (2 * step) for a, b in zip(
                    after[f'folded{side}Ruling'], before[f'folded{side}Ruling']))
                self.assert_close(dot(tangent3, cross(r3, rprime)), 0, 2e-8)
                self.assert_close(dot(r3, r3), 1)
                self.assert_close(dot(r2, r2), 1)
                for distance in distances:
                    metrics = []
                    for prefix, ruling in (('flat', r2), ('folded', r3)):
                        plus = surface_point(after, prefix, side, distance)
                        minus = surface_point(before, prefix, side, distance)
                        du = tuple((a - b) / (2 * step)
                                   for a, b in zip(plus, minus))
                        metrics.append((dot(du, du), dot(du, ruling),
                                        dot(ruling, ruling)))
                    for planar, spatial in zip(*metrics):
                        self.assert_close(planar, spatial, 2e-7)
            left = cross(tangent3, now['foldedLeftRuling'])
            right = cross(tangent3, now['foldedRightRuling'])
            cosine = -dot(left, right) / math.sqrt(dot(left, left)
                                                   * dot(right, right))
            self.assert_close(cosine, math.cos(now['foldAngleRad']), 2e-8)

    def test_in_3933_and_3936_planar_circle_exact_and_numeric_unfolding(self):
        fold = fold_space_curve_3d((sp.cos(U), sp.sin(U), 0), 2 * sp.pi / 3,
                                   parameter=U, interval=(0, sp.pi))
        at_zero = fold.frame(0)
        self.assertEqual(at_zero['foldedCrease'], (1, 0, 0))
        for actual, expected in zip(at_zero['foldedLeftRuling'],
                                    (-.5, 0, math.sqrt(3) / 2)):
            self.assert_close(actual, expected)
        for actual, expected in zip(at_zero['foldedRightRuling'],
                                    (.5, 0, math.sqrt(3) / 2)):
            self.assert_close(actual, expected)
        flat = flatten_fold_2d(fold, initial_parameter=0,
                               initial_point=(1, 0), initial_tangent=(0, 1))
        exact = flat.exact_flat_expressions()
        expected = (2 * sp.cos(U / 2) - 1, 2 * sp.sin(U / 2))
        for expression, anchor in zip(exact['flatCrease'], expected):
            self.assertEqual(sp.simplify(expression.doit() - anchor), 0)
        final = flat.frame(math.pi)
        self.assert_close(final['flatCrease'][0], -1, 1e-9)
        self.assert_close(final['flatCrease'][1], 2, 1e-9)
        self.assert_smooth_metric(flat, (.2, 1.1, 2.7), (.2, .8))
        sample = nflatten_fold_2d(flat, ruling_width=1,
                                  curve_segments=48, ruling_segments=3)
        self.assertEqual(len(sample['foldedVertices']), 49 * 7)
        self.assertEqual(len(sample['flatVertices']), 49 * 7)
        self.assertEqual(len(sample['faces']), 48 * 3 * 4)
        self.assertFalse(sample['sampledMeshExactIsometry'])
        self.assertFalse(sample['deploymentPathChecked'])
        interior_initial = flatten_fold_2d(
            fold, initial_parameter=sp.pi / 2,
            initial_point=(1, 0), initial_tangent=(0, 1))
        self.assert_smooth_metric(interior_initial, (.5, 2.5), (.2,))

    def test_in_3940_and_3943_helix_agrees_with_specialized_source_family(self):
        fold = fold_space_curve_3d((sp.cos(U), sp.sin(U), U / 2), sp.pi / 2,
                                   parameter=U, interval=(0, sp.pi))
        flat = flatten_fold_2d(fold)
        theta = math.atan(.5)
        for u in (.2, 1.2, 2.6):
            general = flat.frame(u)
            special = uniform_helix_curved_fold_frame(1, theta, math.pi / 2, u)
            for name in ('flatCrease', 'foldedCrease', 'flatLeftRuling',
                         'flatRightRuling', 'foldedLeftRuling',
                         'foldedRightRuling'):
                for actual, expected in zip(general[name], special[name]):
                    self.assert_close(actual, expected, 1e-9)
        self.assert_smooth_metric(flat, (.2, 1.2, 2.6), (.2, .7))
        spatial = nspace_curve_fold_3d(fold, ruling_width=1,
                                       curve_segments=24, ruling_segments=2)
        self.assertNotIn('flatVertices', spatial)
        self.assertEqual(spatial['creaseVertexIndices'], list(range(25)))

    def test_nonhelical_curves_and_varying_fold_angle_stay_developable(self):
        ellipse = fold_space_curve_3d((2 * sp.cos(U), sp.sin(U), 0),
                                      2 * sp.pi / 3, parameter=U,
                                      interval=(0, sp.pi), orientation=-1)
        flat_ellipse = flatten_fold_2d(ellipse)
        self.assert_smooth_metric(flat_ellipse, (.3, 1.2, 2.5), (.1, .4))
        self.assertEqual(len(nflatten_fold_2d(flat_ellipse, ruling_width=.5,
                                              curve_segments=16)['faces']), 256)

        space_curve = fold_space_curve_3d((U, U * U / 2, U**3 / 6), sp.pi / 2,
                                          parameter=U, interval=(0, sp.pi))
        flat_space = flatten_fold_2d(space_curve)
        self.assert_smooth_metric(flat_space, (.2, 1.1, 2.5), (.03, .08))
        space_curve.certify_ruling_width(.1)

        varying = fold_space_curve_3d((sp.cos(U), sp.sin(U), 0),
                                      sp.pi / 2 + U / 10,
                                      parameter=U, interval=(0, 1))
        flat_varying = flatten_fold_2d(varying)
        self.assert_smooth_metric(flat_varying, (.2, .5, .8), (.02, .08))
        varying.certify_ruling_width(.1)

    def test_sampled_boundary_chords_converge_but_are_not_exactly_isometric(self):
        fold = fold_space_curve_3d((sp.cos(U), sp.sin(U), 0), 2 * sp.pi / 3,
                                   parameter=U, interval=(0, sp.pi))
        flat = flatten_fold_2d(fold)
        def maximum_error(segments):
            mesh = nflatten_fold_2d(flat, ruling_width=1,
                                    curve_segments=segments,
                                    ruling_segments=1)
            indices = mesh['boundaryVertexIndices']['left']
            flat_points = [mesh['flatVertices'][i] for i in indices]
            folded_points = [mesh['foldedVertices'][i] for i in indices]
            return max(abs(math.dist(a, b) - math.dist(c, d))
                       for a, b, c, d in zip(flat_points[:-1], flat_points[1:],
                                             folded_points[:-1], folded_points[1:]))
        coarse, fine = maximum_error(24), maximum_error(48)
        self.assertGreater(coarse, 1e-8)
        self.assertLess(fine, coarse / 6)

    def test_rejects_unproved_regular_domain_and_unsafe_width(self):
        invalid = [
            ((U, 0, 0), sp.pi / 2, (0, 1)),
            ((U * U, 0, 0), sp.pi / 2, (0, 1)),
            ((1 / U, U, 0), sp.pi / 2, (0, 1)),
            ((sp.cos(U), sp.sin(U), 0), 0, (0, sp.pi)),
            ((sp.cos(U), sp.sin(U), 0), sp.pi / 2 + U, (0, 2)),
            ((sp.cos(U), sp.sin(U), 0), sp.Symbol('unknown'), (0, 1)),
        ]
        for curve, angle, interval in invalid:
            with self.subTest(curve=curve, angle=angle):
                with self.assertRaises(ValueError):
                    fold_space_curve_3d(curve, angle, parameter=U,
                                        interval=interval)
        with self.assertRaises(ValueError):
            fold_space_curve_3d((sp.cos(U), sp.sin(U), 0), sp.pi / 2,
                                parameter=U, interval=(0, 1), orientation=0)
        with self.assertRaises(ValueError):
            fold_space_curve_3d((sp.cos(U), sp.sin(U), 0), 'pi/2',
                                parameter=U, interval=(0, 1))
        with self.assertRaises(ValueError):
            fold_space_curve_3d((sp.cos(U), sp.sin(U), 0), sp.pi / 2,
                                parameter=U, interval=('0', 1))
        circle = fold_space_curve_3d((sp.cos(U), sp.sin(U), 0),
                                     2 * sp.pi / 3, parameter=U,
                                     interval=(0, sp.pi))
        for width in (0, 2, 3):
            with self.assertRaises(ValueError):
                circle.certify_ruling_width(width)
        with self.assertRaises(ValueError):
            flatten_fold_2d(circle, initial_tangent=(1, 1))
        with self.assertRaises(ValueError):
            flatten_fold_2d(circle, initial_parameter=-.1)


if __name__ == '__main__':
    unittest.main()
