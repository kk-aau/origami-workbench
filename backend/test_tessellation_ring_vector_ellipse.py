"""Numerical and geometric checks for certified vector-valued ring ellipses."""
import itertools
import math
import unittest

from tessellate import check_geometry, check_local_conditions
from tessellation_ring_original import circular_ring_pattern
from tessellation_ring_vector_ellipse import (
    LinearEllipse, certify_nested_ellipses, ellipse_first_ray_exit,
    ellipse_point, ellipse_radial_radius, singular_extrema,
    validate_linear_map,
)


IDENTITY = [[1, 0], [0, 1]]


class LinearVectorRingTests(unittest.TestCase):
    def test_parameter_curve_is_closed_ccw_simple_and_not_confused_with_polar_angle(self):
        matrix = validate_linear_map([[1.1, .17], [.04, .9]])
        start, end = ellipse_point(matrix, 1.3, 0), ellipse_point(matrix, 1.3, math.tau)
        self.assertLess(math.dist(start, end), 1e-14)
        self.assertGreater(matrix[0][0]*matrix[1][1]-matrix[0][1]*matrix[1][0], 0)
        # At t=0 the point is the first matrix column; its geometric polar
        # angle is not t when the ellipse is rotated/sheared.
        self.assertAlmostEqual(start[0], 1.43)
        self.assertAlmostEqual(start[1], .052)
        self.assertGreater(math.atan2(start[1], start[0]), 0)
        self.assertNotAlmostEqual(ellipse_radial_radius(matrix, 1.3, 0), math.hypot(*start), places=4)
        for invalid in ([[1, 0], [0, -1]], [[1, 1], [1, 1]], [[.001, 0], [0, 1]],
                        [[1, float('nan')], [0, 1]], [[3, 0], [0, 1]]):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                LinearEllipse(invalid)

    def test_first_positive_ray_exit_is_the_unique_exact_quadratic_root(self):
        matrix = [[2, 0], [0, 1]]
        point = [.2, 0.]
        crossing = ellipse_first_ray_exit(matrix, 1., point, [0., 1.])
        self.assertAlmostEqual(crossing[0], .2)
        self.assertAlmostEqual(crossing[1], math.sqrt(.99), places=13)
        self.assertLess((point[0]/2)**2+(.5*crossing[1])**2, 1,
                        'a point before the crossing remains strictly inside')
        with self.assertRaisesRegex(ValueError, '起点不在'):
            ellipse_first_ray_exit(matrix, 1., [2., 0.], [-1., 0.])

    def test_sheared_ray_exit_is_stable_near_boundary_and_refuses_ambiguous_start(self):
        matrix = [[1.1, .25], [.1, .9]]
        radius = 2.
        edge = ellipse_point(matrix, radius, .6)
        inside = [(1-1e-8)*value for value in edge]
        # Outward and inward rays have different first positive crossings.
        outward = ellipse_first_ray_exit(matrix, radius, inside, edge)
        inward = ellipse_first_ray_exit(matrix, radius, inside, [-value for value in edge])
        self.assertLess(math.dist(outward, edge), 1e-12)
        self.assertLess(math.dist(inward, [-value for value in edge]), 1e-12)
        with self.assertRaisesRegex(ValueError, '起点不在'):
            ellipse_first_ray_exit(matrix, radius, [(1-1e-12)*value for value in edge], edge)

    def test_linear_ellipse_input_limits_are_finite_and_conditioned(self):
        minimum, maximum = singular_extrema([[1, .2], [-.2, 1]])
        self.assertAlmostEqual(minimum, math.sqrt(1.04), places=14)
        self.assertAlmostEqual(maximum, math.sqrt(1.04), places=14)
        for radius in (-1, 0, float('inf'), 10001):
            with self.subTest(radius=radius), self.assertRaises(ValueError):
                ellipse_point(IDENTITY, radius, 0)
        for invalid in ([[1, 0], [0, 0]], [[1, 0], [0, -.9]],
                        [[1, 0], [0, .079]], [[2, 2], [0, 2]],
                        [[True, 0], [0, 1]]):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_linear_map(invalid)

    def test_spectral_nesting_rejects_tangency_and_hidden_crossing(self):
        same = [[1.1, .1], [0, .9]]
        self.assertAlmostEqual(certify_nested_ellipses(same, 1., same, 1.35), 1/1.35)
        with self.assertRaisesRegex(ValueError, '嵌套|间距'):
            certify_nested_ellipses(IDENTITY, 1., IDENTITY, 1.000001)
        # Rotated, elongated inner ellipse breaches the outer circle between
        # cardinal axes. The analytic norm catches it without angular samples.
        angle = math.pi/7
        rotated = [[1.05*math.cos(angle), -.8*math.sin(angle)],
                   [1.05*math.sin(angle), .8*math.cos(angle)]]
        with self.assertRaisesRegex(ValueError, '嵌套'):
            certify_nested_ellipses(rotated, 1., IDENTITY, 1.)

    def test_identity_vector_functions_equal_existing_circular_ring(self):
        radii, middle = [1, 1.8, 2.6], [1.35, 2.15]
        old, old_flat, _ = circular_ring_pattern(8, radii, middle, 36, 13)
        new, new_flat, _ = circular_ring_pattern(8, radii, middle, 36, 13,
            outer_linear_maps=[IDENTITY]*3, crease_linear_maps=[IDENTITY]*2)
        self.assertEqual(new['edges_vertices'], old['edges_vertices'])
        self.assertEqual(new['edges_assignment'], old['edges_assignment'])
        self.assertLess(max(math.dist(a, b) for a, b in zip(new['vertices_coords'], old['vertices_coords'])), 1e-10)
        self.assertLess(max(math.dist(a, b) for a, b in zip(new_flat, old_flat)), 1e-10)

    def test_rotated_sheared_non_circle_has_valid_cp_and_rigid_flat_faces(self):
        p, r = [1, 1.8, 2.6], [1.35, 2.15]
        p_maps = [[[1.04, .055], [.012, .96]], [[1.02, .06], [.015, .98]], [[1.03, .05], [.01, .97]]]
        r_maps = [[[1.025, .057], [.013, .975]], [[1.025, .052], [.012, .972]]]
        fold, flat, closure = circular_ring_pattern(8, p, r, 36, 13,
            outer_linear_maps=p_maps, crease_linear_maps=r_maps)
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']), len(fold['faces_vertices'])),
                         (72, 136, 65))
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertEqual(check_local_conditions(fold)['status'], 'passed')
        self.assertLess(closure, 1e-10)
        first = fold['vertices_coords'][0]
        self.assertAlmostEqual(first[0], ellipse_point(p_maps[0], p[0], math.radians(13))[0], places=11)
        self.assertAlmostEqual(first[1], ellipse_point(p_maps[0], p[0], math.radians(13))[1], places=11)
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=8)

    def test_mixed_curve_modes_and_bad_counts_are_rejected(self):
        args = (8, [1, 1.8], [1.35], 36)
        with self.assertRaisesRegex(ValueError, '组数'):
            circular_ring_pattern(*args, outer_linear_maps=[IDENTITY], crease_linear_maps=[IDENTITY])
        with self.assertRaisesRegex(ValueError, '不能同时'):
            circular_ring_pattern(*args, outer_linear_maps=[IDENTITY]*2, crease_linear_maps=[IDENTITY],
                                  outer_expressions=['r']*2, crease_expressions=['r'])
        nearly_touching = [[1.000001/1.35, 0], [0, 1.000001/1.35]]
        with self.assertRaisesRegex(ValueError, '嵌套|间距'):
            circular_ring_pattern(*args, outer_linear_maps=[IDENTITY]*2,
                                  crease_linear_maps=[nearly_touching])


if __name__ == '__main__':
    unittest.main()
