import itertools
import math
import unittest

from tessellate import check_geometry
from tessellation_circular_twist import circular_polygon_twist


TRIANGLE = [[0, 0], [1, 0], [.5, .4]]


class CircularTwistTests(unittest.TestCase):
    def test_notebook_triangle_example_has_clipped_faces_and_exact_rays(self):
        # Origamica 15.0, CircularPolygonTwistGraph2D example at 202144–202169.
        fold, flat, info = circular_polygon_twist(TRIANGLE, 30, 2,
                                                  ['M', 'M', 'V'], 16)
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (24, 30, 7))
        self.assertEqual([len(face) for face in fold['faces_vertices']],
                         [3, 5, 5, 5, 8, 8, 5])
        self.assertEqual(fold['edges_assignment'][:9],
                         ['M', 'M', 'V', 'M', 'V', 'M', 'V', 'V', 'M'])
        self.assertAlmostEqual(fold['vertices_coords'][3][0], -1.295392940041014)
        self.assertAlmostEqual(fold['vertices_coords'][3][1], -.7478954626390201)
        self.assertAlmostEqual(fold['vertices_coords'][4][0], -1.0201518541776)
        self.assertAlmostEqual(fold['vertices_coords'][4][1], -1.1663352168133587)
        self.assertEqual(info['stationaryFace'], 7)
        self.assertLess(info['closureError'], 1e-9)
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertEqual(len(flat), len(fold['vertices_coords']))

    def test_exact_circle_and_face_isometry_are_distinct_from_display_boundary(self):
        fold, flat, info = circular_polygon_twist(TRIANGLE, 30, 2,
                                                  ['M', 'M', 'V'], 16)
        center = info['center']
        boundary = {v for edge, assignment in zip(fold['edges_vertices'],
                                                   fold['edges_assignment'])
                    if assignment == 'B' for v in edge}
        for v in boundary:
            self.assertAlmostEqual(math.dist(fold['vertices_coords'][v], center), 2)
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],
                                                 fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=8)
        display = info['circularizedFoldedForm']
        display_center = [sum(p[k] for p in display[:3]) / 3 for k in (0, 1)]
        self.assertTrue(any(abs(math.dist(flat[v], display_center) - 2) > .1
                            for v in boundary))
        for v in boundary:
            self.assertAlmostEqual(math.dist(display[v], display_center), 2)

    def test_stationary_face_matches_original_orientation(self):
        for selected in (1, 2, 4, 7):
            with self.subTest(selected=selected):
                fold, flat, info = circular_polygon_twist(TRIANGLE, 30, 2,
                                                          ['M', 'M', 'V'], 16,
                                                          selected)
                for v in fold['faces_vertices'][selected - 1]:
                    self.assertLess(math.dist(fold['vertices_coords'][v],
                                              flat[v]), 1e-8)
                self.assertEqual(info['stationaryFace'], selected)

    def test_circle_divisions_change_only_boundary_arc_sampling(self):
        coarse, _, _ = circular_polygon_twist(TRIANGLE, 30, 2,
                                              ['M', 'M', 'V'], 8)
        fine, _, _ = circular_polygon_twist(TRIANGLE, 30, 2,
                                            ['M', 'M', 'V'], 64)
        self.assertEqual(coarse['vertices_coords'][:9], fine['vertices_coords'][:9])
        self.assertEqual(coarse['edges_assignment'][:9], fine['edges_assignment'][:9])
        self.assertLess(len(coarse['vertices_coords']), len(fine['vertices_coords']))
        self.assertEqual(len(coarse['faces_vertices']), len(fine['faces_vertices']))

    def test_unassigned_and_reverse_winding_cases(self):
        unassigned, _, _ = circular_polygon_twist(TRIANGLE, 30, 2, circle_divisions=16)
        self.assertEqual(unassigned['edges_assignment'][:9], ['U'] * 9)
        reversed_polygon = TRIANGLE[::-1]
        reverse, _, _ = circular_polygon_twist(reversed_polygon, -30, 2,
                                                ['V', 'M', 'M'], 16)
        self.assertEqual(len(reverse['faces_vertices']), 7)
        self.assertEqual(check_geometry(reverse)['status'], 'passed')

    def test_generic_convex_regular_polygons_beyond_saved_examples(self):
        # The notebook's verts_List/nv construction has no twelve-side branch.
        # Keep a practical input bound, and check its upper edge as well as an
        # intermediate case through the complete CP/strict-FF pipeline.
        from tessellate import generate
        for sides, expected in ((16, (96, 128, 33)), (64, (320, 448, 129))):
            with self.subTest(sides=sides):
                center_y = .5 / math.tan(math.pi / sides)
                vertices = [[.5 - .5 * math.cos(2 * math.pi * i / sides) +
                             center_y * math.sin(2 * math.pi * i / sides),
                             center_y - .5 * math.sin(2 * math.pi * i / sides) -
                             center_y * math.cos(2 * math.pi * i / sides)]
                            for i in range(sides)]
                result = generate({
                    'family': 'circular-twist', 'polygon': vertices,
                    'angle': 30, 'radius': 3 / (2 * math.sin(math.pi / sides)),
                    'circleDivisions': 64, 'centralTypes': ['M'] * sides,
                    'stationaryFace': 'auto',
                })
                fold = result['fold']
                self.assertEqual((len(fold['vertices_coords']),
                                  len(fold['edges_vertices']),
                                  len(fold['faces_vertices'])), expected)
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
                self.assertLess(result['source']['closureError'], 1e-9)
                self.assertEqual(result['source']['foldedFormStationaryFace'], 2 * sides + 1)

    def test_generic_irregular_convex_polygon_beyond_twelve_sides(self):
        sides = 24
        angles = [2 * math.pi * (i / sides +
                  .1 * math.sin(2 * math.pi * i / sides) / sides)
                  for i in range(sides)]
        vertices = [[1.2 * math.cos(angle), .7 * math.sin(angle)]
                    for angle in angles]
        from tessellate import generate
        result = generate({
            'family': 'circular-twist', 'polygon': vertices,
            'angle': 45, 'radius': 4, 'circleDivisions': 64,
            'centralTypes': ['M'] * sides, 'stationaryFace': 1,
        })
        self.assertEqual(len(result['fold']['faces_vertices']), 2 * sides + 1)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertLess(result['source']['closureError'], 1e-9)
        self.assertEqual(result['source']['foldedFormStationaryFace'], 1)

    def test_rejects_unsupported_or_invalid_topology(self):
        cases = [
            (TRIANGLE, -30, 2, ['M', 'M', 'V'], 16, 'auto'),
            (TRIANGLE, 30, .3, ['M', 'M', 'V'], 16, 'auto'),
            (TRIANGLE, 30, 2, ['M', 'V'], 16, 'auto'),
            (TRIANGLE, 30, 2, ['M', 'M', 'V'], 7, 'auto'),
            (TRIANGLE, 30, 2, ['M', 'M', 'V'], 16, 8),
            ([[0, 0], [1, 0], [.2, .2], [1, 1], [0, 1]],
             30, 2, ['M'] * 5, 16, 'auto'),
        ]
        for args in cases:
            with self.subTest(args=args), self.assertRaises(ValueError):
                circular_polygon_twist(*args)


if __name__ == '__main__':
    unittest.main()
