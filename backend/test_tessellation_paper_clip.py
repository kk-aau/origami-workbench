import math
import unittest
from collections import Counter

from tessellate import check_geometry, check_local_conditions, generate
from tessellation_flat_embedding import flat_face_embedding
from tessellation_paper_clip import (
    _area, _on_segment, clip_fold_to_convex_paper,
    inscribed_paper_polygon, map_vertex_values,
)


class PaperClipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = generate({'family': 'periodic', 'tiling': 'square',
                             'rows': 3, 'columns': 3})

    def assert_real_sheet(self, fold, paper):
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertEqual(check_local_conditions(fold)['status'], 'passed')
        self.assertEqual(len(fold['vertices_coords']) - len(fold['edges_vertices']) +
                         len(fold['faces_vertices']), 1)
        owners = Counter(tuple(sorted((a, b)))
                         for face in fold['faces_vertices']
                         for a, b in zip(face, face[1:] + face[:1]))
        self.assertEqual(len(owners), len(fold['edges_vertices']))
        for edge, assignment in zip(fold['edges_vertices'], fold['edges_assignment']):
            self.assertEqual(owners[tuple(sorted(edge))],
                             1 if assignment == 'B' else 2)
            if assignment == 'B':
                a, b = (fold['vertices_coords'][i] for i in edge)
                self.assertTrue(any(_on_segment(a, u, v, 1e-8) and
                                    _on_segment(b, u, v, 1e-8)
                                    for u, v in zip(paper, paper[1:] + paper[:1])))
        area = sum(abs(_area([fold['vertices_coords'][i] for i in face]))
                   for face in fold['faces_vertices'])
        self.assertAlmostEqual(area, abs(_area(paper)), places=7)
        _, closure = flat_face_embedding(fold)
        self.assertLess(closure, 1e-7)

    def test_square_crop_keeps_real_connected_crease_pattern(self):
        source = self.base['fold']
        paper = inscribed_paper_polygon(source, {'shape': 'square'})
        cropped = clip_fold_to_convex_paper(source, paper)
        fold = cropped['fold']
        self.assert_real_sheet(fold, paper)
        self.assertIn('M', fold['edges_assignment'])
        self.assertIn('V', fold['edges_assignment'])
        self.assertEqual(len(fold['faces_vertices']), 25)
        self.assertEqual(sum(item['kind'] == 'face'
                             for item in cropped['vertexMap']), 4)
        recreated = map_vertex_values(cropped['vertexMap'], source['vertices_coords'])
        for a, b in zip(recreated, fold['vertices_coords']):
            self.assertLess(math.dist(a, b), 1e-8)

    def test_direct_folded_coordinates_and_preview_map_survive_crop(self):
        source = generate({'family': 'periodic', 'tiling': 'square',
                           'rows': 3, 'columns': 3,
                           'parameterization': 'gamma-alpha',
                           'gamma': .8, 'pleatAngle': 20})
        fold = source['fold']
        paper = inscribed_paper_polygon(fold, {'shape': 'square'})
        cropped = clip_fold_to_convex_paper(fold, paper,
                                            source['source']['foldedForm'])
        self.assert_real_sheet(cropped['fold'], paper)
        self.assertEqual(len(cropped['foldedForm']),
                         len(cropped['fold']['vertices_coords']))
        recipe = map_vertex_values(cropped['vertexMap'],
                                   source['preview']['vertices'])
        rho = source['stats']['parameters']['scale']
        beta = math.radians(source['stats']['parameters']['angle'])
        for (cx, cy, dx, dy), actual in zip(recipe,
                                            cropped['fold']['vertices_coords']):
            expected = [cx + rho * (math.cos(beta) * dx - math.sin(beta) * dy),
                        cy + rho * (math.sin(beta) * dx + math.cos(beta) * dy)]
            self.assertLess(math.dist(expected, actual), 1e-8)

    def test_other_inscribed_shapes_remain_real_sheets(self):
        source = self.base['fold']
        for option in ({'shape': 'rectangle', 'aspect': 1.5},
                       {'shape': 'regular', 'sides': 3},
                       {'shape': 'regular', 'sides': 6},
                       {'shape': 'regular', 'sides': 8}):
            with self.subTest(option=option):
                paper = inscribed_paper_polygon(source, option)
                self.assertGreater(abs(_area(paper)), 0.2 * sum(
                    abs(_area([source['vertices_coords'][i] for i in face]))
                    for face in source['faces_vertices']))
                self.assert_real_sheet(clip_fold_to_convex_paper(source, paper)['fold'], paper)

    def test_paper_follows_live_boundary(self):
        source = generate({'family': 'periodic', 'tiling': 'square',
                           'rows': 3, 'columns': 3, 'angle': 20, 'scale': .4})['fold']
        current = inscribed_paper_polygon(source, {'shape': 'square', 'margin': .08})
        default = inscribed_paper_polygon(self.base['fold'], {'shape': 'square',
                                                              'margin': .08})
        self.assertNotAlmostEqual(current[0][0], default[0][0], places=4)
        self.assert_real_sheet(clip_fold_to_convex_paper(source, current)['fold'], current)

    def test_rejects_outside_paper_and_invalid_settings(self):
        source = self.base['fold']
        with self.assertRaisesRegex(ValueError, '超出原边界'):
            clip_fold_to_convex_paper(source, [[-10, -10], [10, -10],
                                               [10, 10], [-10, 10]])
        with self.assertRaisesRegex(ValueError, '严格凸'):
            clip_fold_to_convex_paper(source, [[1, 1], [2, 1],
                                               [1.5, 1.5], [2, 2], [1, 2]])
        for bad in ({'shape': 'rectangle', 'aspect': 0},
                    {'shape': 'regular', 'sides': 2},
                    {'shape': 'square', 'margin': 0},
                    {'shape': 'unknown'}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                inscribed_paper_polygon(source, bad)


if __name__ == '__main__':
    unittest.main()
