"""Independent paper grows the Cairo pattern before trimming its new edge."""

import math
import unittest

from tessellate import generate


CAIRO = {'family': 'archimedean', 'tiling': 'double-cairo',
         'cairoAngle': 105, 'repeatX': 2, 'repeatY': 2,
         'cairoOutput': 'tiling', 'angle': 45, 'scale': .3}


def _edge_keys(fold, assignment):
    coordinates = fold['vertices_coords']
    return {tuple(sorted((tuple(round(v, 7) for v in coordinates[a]),
                          tuple(round(v, 7) for v in coordinates[b]))))
            for (a, b), kind in zip(fold['edges_vertices'], fold['edges_assignment'])
            if kind == assignment}


def _face_keys(fold):
    coordinates = fold['vertices_coords']
    return {frozenset(tuple(round(v, 7) for v in coordinates[index])
                      for index in face)
            for face in fold['faces_vertices']}


def _signed_area(points):
    return sum(a[0] * b[1] - b[0] * a[1]
               for a, b in zip(points, points[1:] + points[:1])) / 2


class CairoPaperExtensionTests(unittest.TestCase):
    def test_double_cairo_fills_independent_sheet_and_keeps_original_tiles(self):
        core = generate(CAIRO)
        result = generate({**CAIRO, 'paper': {'shape': 'square', 'margin': .1}})
        fold = result['fold']
        self.assertEqual(result['source']['paperMethod'], 'extended-pattern-clip-v1')
        self.assertEqual(result['source']['paperExpansion'], 2)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(len(core['fold']['faces_vertices']), 32)
        self.assertGreater(len(fold['faces_vertices']), 32)
        self.assertTrue(_face_keys(core['fold']) <= _face_keys(fold))
        old_flat = _edge_keys(core['fold'], 'F')
        new_flat = _edge_keys(fold, 'F')
        self.assertTrue(old_flat <= new_flat)
        self.assertGreater(len(new_flat), len(old_flat))
        paper = result['source']['paperPolygon']
        total_face_area = sum(abs(_signed_area([fold['vertices_coords'][v]
                                                 for v in face]))
                              for face in fold['faces_vertices'])
        self.assertTrue(math.isclose(total_face_area, abs(_signed_area(paper)),
                                     rel_tol=1e-8, abs_tol=1e-8))
        self.assertEqual(len(result['source']['paperClipPreview']['polygon']), 4)

    def test_long_rectangle_needs_a_larger_real_cairo_source(self):
        core = generate(CAIRO)['fold']
        result = generate({**CAIRO, 'paper': {'shape': 'rectangle',
                                             'aspect': 1.5, 'margin': .1}})
        self.assertEqual(result['source']['paperExpansion'], 3)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertTrue(_face_keys(core) <= _face_keys(result['fold']))
        self.assertTrue(_edge_keys(core, 'F') <= _edge_keys(result['fold'], 'F'))


if __name__ == '__main__':
    unittest.main()
