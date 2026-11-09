import math
import unittest

from tessellation_split_exact import unit_quadrilateral_vertices
from tessellation_unit_cyclic_polygon import (
    complete_cyclic_angles, cyclic_center_gaps, unit_cyclic_polygon_info,
    unit_cyclic_polygon_vertices,
)


class UnitCyclicPolygonTests(unittest.TestCase):
    def assert_polygon_properties(self, result):
        vertices, center, radius = (result[key] for key in
                                    ('vertices', 'circumcenter', 'circumradius'))
        n = len(vertices)
        self.assertEqual(vertices[:2], [[0., 0.], [1., 0.]])
        self.assertAlmostEqual(math.dist(vertices[0], vertices[1]), 1., places=12)
        self.assertAlmostEqual(sum(result['effectiveAngles']), (n-2)*180., places=9)
        self.assertAlmostEqual(sum(result['centerAngles']), 360., places=9)
        self.assertLess(max(abs(math.dist(point, center)-radius)
                            for point in vertices), 1e-9)
        for index, point in enumerate(vertices):
            before, after = vertices[(index-1)%n], vertices[(index+1)%n]
            incoming = [before[k]-point[k] for k in (0, 1)]
            outgoing = [after[k]-point[k] for k in (0, 1)]
            cosine = sum(incoming[k]*outgoing[k] for k in (0, 1)) / (
                math.hypot(*incoming)*math.hypot(*outgoing))
            angle = math.degrees(math.acos(max(-1., min(1., cosine))))
            self.assertAlmostEqual(angle, result['effectiveAngles'][index], places=7)
            a = [point[k]-before[k] for k in (0, 1)]
            b = [after[k]-point[k] for k in (0, 1)]
            self.assertGreater(a[0]*b[1]-a[1]*b[0], 1e-8)
            ray = [point[k]-center[k] for k in (0, 1)]
            next_ray = [after[k]-center[k] for k in (0, 1)]
            central = math.degrees(math.atan2(ray[0]*next_ray[1]-ray[1]*next_ray[0],
                                                   sum(ray[k]*next_ray[k] for k in (0, 1)))) % 360
            self.assertAlmostEqual(central, result['centerAngles'][index], places=7)

    def test_source_parity_completion_and_saved_center_angle_outputs(self):
        # In[354]/Out[355,356]: odd last corner ignored.
        # In[357]/Out[358,359]: even last two corners and zero-mode gaps.
        cases = (([40, 60, 0], [40, 60, 80], [160, 80, 120]),
                 ([98, 108, 118, 128, 0], [98, 108, 118, 128, 88],
                  [52, 92, 32, 72, 112]),
                 ([80, 90, 0, 0], [80, 90, 100, 90], [100, 80, 80, 100]),
                 ([128, 119, 118, 115, 0, 0],
                  [128, 119, 118, 115, 114, 126],
                  [58, 64, 60, 70, 62, 46]))
        for supplied, expected_angles, expected_gaps in cases:
            with self.subTest(supplied=supplied):
                self.assertEqual(complete_cyclic_angles(supplied), expected_angles)
                _, gaps = cyclic_center_gaps(supplied)
                for got, wanted in zip(gaps, expected_gaps):
                    self.assertAlmostEqual(got, wanted, places=9)

    def test_non_saved_odd_triangle_and_pentagon_ignore_side_index(self):
        triangle = unit_cyclic_polygon_info([50, 60, 999], -10, 99)
        self.assertEqual(triangle['effectiveAngles'], [50., 60., 70.])
        self.assertEqual(triangle['centerAngles'], [140., 100., 120.])
        self.assertIsNone(triangle['sideConstraint'])
        self.assertAlmostEqual(triangle['vertices'][2][0], .5923962654520477)
        self.assertAlmostEqual(triangle['vertices'][2][1], .7059903775918711)
        self.assert_polygon_properties(triangle)
        pentagon = unit_cyclic_polygon_info(
            [110, 125, 112.5, 102.5, 999], None, 'ignored')
        self.assertEqual(pentagon['effectiveAngles'],
                         [110., 125., 112.5, 102.5, 90.])
        self.assertEqual(pentagon['centerAngles'], [45., 65., 70., 85., 95.])
        self.assertIsNone(pentagon['sideConstraint'])
        self.assert_polygon_properties(pentagon)
        self.assertEqual(unit_cyclic_polygon_vertices(
            [110, 125, 112.5, 102.5, 999]), pentagon['vertices'])

    def test_non_saved_even_hexagon_side_length_selects_alternating_mode(self):
        supplied = [130, 120, 112.5, 117.5, 0, 0]
        result = unit_cyclic_polygon_info(supplied, 1., 2)
        self.assertEqual(result['effectiveAngles'],
                         [130., 120., 112.5, 117.5, 117.5, 122.5])
        self.assertAlmostEqual(result['alternatingAdjustment'], 10., places=9)
        for got, wanted in zip(result['centerAngles'], [60, 60, 75, 50, 75, 40]):
            self.assertAlmostEqual(got, wanted, places=9)
        self.assertAlmostEqual(math.dist(result['vertices'][1], result['vertices'][2]),
                               1., places=10)
        self.assert_polygon_properties(result)
        base = cyclic_center_gaps(supplied)[1]
        adjustment = 5.
        side3 = math.sin(math.radians((base[2]+adjustment)/2)) / (
            math.sin(math.radians((base[0]+adjustment)/2)))
        other = unit_cyclic_polygon_info(supplied, side3, 3)
        self.assertAlmostEqual(other['alternatingAdjustment'], adjustment, places=9)
        self.assertAlmostEqual(math.dist(other['vertices'][2], other['vertices'][3]),
                               side3, places=10)
        self.assert_polygon_properties(other)
        self.assertGreater(math.dist(result['vertices'][2], other['vertices'][2]), .01)

    def test_existing_n4_named_subdomain_agrees_without_modifying_it(self):
        supplied, side, selected = [75, 85, 95, 105], 1.2, 2
        result = unit_cyclic_polygon_info(supplied, side, selected)
        original_n4 = unit_quadrilateral_vertices(
            result['effectiveAngles'], side, selected)
        self.assertLess(max(math.dist(a, b) for a, b in zip(
            result['vertices'], original_n4)), 1e-10)
        self.assertEqual(result['effectiveAngles'], [75., 85., 105., 95.])
        self.assert_polygon_properties(result)

    def test_degenerate_invalid_and_unselected_even_family_reject(self):
        for angles in ([50, 60], [170, 170, 0], [150, 150, 150, 150, 0],
                       [130, 120, 112.5, 117.5, 0, math.nan],
                       [True, 60, 0], [179, 179, 179, 179, 0, 0]):
            with self.subTest(angles=angles), self.assertRaises(ValueError):
                unit_cyclic_polygon_info(angles)
        for side, index, angles in ((1., 1, [90, 90, 0, 0]),
                                    (1., 3, [90, 90, 0, 0]),
                                    (1.2, 3, [90, 90, 0, 0]),
                                    (0., 2, [75, 85, 0, 0]),
                                    (1., 7, [130, 120, 112.5, 117.5, 0, 0])):
            with self.subTest(side=side, index=index), self.assertRaises(ValueError):
                unit_cyclic_polygon_info(angles, side, index)


if __name__ == '__main__':
    unittest.main()
