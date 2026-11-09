import copy
import math
import unittest

import numpy as np

from tessellation_equilateral_ellipse import (read_ellipse_source, solve_equilateral_ellipse,
                                            validate_closed_ellipse_source,
                                            validate_joined_ellipse_source)


def source(count=16, axes=None, phase=0, rotation=0):
    return {'kind': 'equilateral-ellipse', 'count': count,
            'semiAxes': axes or [(1+math.sqrt(5))/2, 1], 'phaseDeg': phase, 'rotationDeg': rotation}


class EquilateralEllipseTests(unittest.TestCase):
    def test_independent_literal_equations(self):
        for item in [source(16, phase=45, rotation=45), source(3, [4, 1], 31, 12),
                     source(48, [4, 1], 17, -31), source(16, [.0015, .001], 23, 19),
                     source(12, [1, (1+math.sqrt(5))/2], 23, 19)]:
            with self.subTest(source=item):
                points = solve_equilateral_ellipse(item)
                a, b = item['semiAxes']
                theta = math.radians(item['rotationDeg'])
                unrotated = points@np.array([[math.cos(theta), -math.sin(theta)],
                                            [math.sin(theta), math.cos(theta)]])
                self.assertLess(float(np.max(np.abs(unrotated[:, 0]**2/a**2+unrotated[:, 1]**2/b**2-1))), 2e-12)
                lengths = np.linalg.norm(points-np.roll(points, -1, axis=0), axis=1)
                self.assertLess(float(np.ptp(lengths)), 2e-10*a)

    def test_source_requires_all_fields_and_numeric_budget(self):
        for patch in [{'count': True}, {'count': 49}, {'count': 3.5}, {'phaseDeg': 361},
                      {'semiAxes': [4.1, 1]}, {'semiAxes': [1, .0001]}, {'extra': 0}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                read_ellipse_source({**source(), **patch})
        missing = source()
        del missing['rotationDeg']
        with self.assertRaises(ValueError):
            read_ellipse_source(missing)

    def test_small_scale_and_unit_scale_share_the_same_relative_tolerance(self):
        for scale in [.001, 1]:
            item = source(16, [1.5*scale, scale], 23, 19)
            points = solve_equilateral_ellipse(item)
            self.assertEqual(validate_closed_ellipse_source(item, points), item)
            altered = points.copy()
            altered[0, 0] += 1e-7*scale
            with self.assertRaises(ValueError):
                validate_closed_ellipse_source(item, altered)

    def test_changed_phase_or_reordered_points_cannot_keep_the_source(self):
        item = source()
        points = solve_equilateral_ellipse(item)
        with self.assertRaises(ValueError):
            validate_closed_ellipse_source({**item, 'phaseDeg': 1}, points)
        with self.assertRaises(ValueError):
            validate_closed_ellipse_source(item, np.roll(points, -1, axis=0))

    def test_joined_rotation_left_shift_and_wrong_transform(self):
        item = {'ellipse': source(24), 'topRotationDeg': 90, 'topShift': 3}
        bottom = solve_equilateral_ellipse(item['ellipse'])
        top = np.roll(np.c_[-bottom[:, 1], bottom[:, 0]], -3, axis=0)
        self.assertEqual(validate_joined_ellipse_source(item, bottom, top), item)
        with self.assertRaises(ValueError):
            validate_joined_ellipse_source({**item, 'topShift': 2}, bottom, top)
        with self.assertRaises(ValueError):
            validate_joined_ellipse_source({**item, 'pleatReduction': .5}, bottom, top)


if __name__ == '__main__':
    unittest.main()
