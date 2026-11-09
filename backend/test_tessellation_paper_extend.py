"""A selected paper must contain *new pattern*, not an empty outer ring."""
import math
import unittest

from tessellate import generate


BASE = {'family': 'periodic', 'tiling': 'square', 'rows': 3,
        'columns': 3, 'angle': 36, 'scale': .3}


class ExtendedPaperTests(unittest.TestCase):
    def test_original_core_is_preserved_and_new_creases_fill_the_margin(self):
        core = generate(BASE)
        result = generate({**BASE, 'paper': {'shape': 'square', 'margin': .1}})
        fold = result['fold']
        self.assertEqual(result['source']['paperMethod'], 'extended-pattern-clip-v1')
        self.assertEqual(result['source']['paperExpansion'], 1)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertGreater(result['stats']['faces'], core['stats']['faces'])
        self.assertEqual(result['stats']['tiles'], core['stats']['tiles'])
        self.assertTrue(result['source']['paperClipPreview']['sourcePreview'])
        boundary = [fold['vertices_coords'][v] for edge, kind in
                    zip(fold['edges_vertices'], fold['edges_assignment'])
                    if kind == 'B' for v in edge]
        self.assertAlmostEqual(min(p[0] for p in boundary), -.3, places=8)
        self.assertAlmostEqual(max(p[0] for p in boundary), 3.3, places=8)
        # The former x=0/3 or y=0/3 perimeter must not remain a B cycle
        # inside the independent sheet.
        for point in boundary:
            self.assertTrue(any(abs(point[axis]-edge)<1e-8
                                for axis in (0, 1) for edge in (-.3, 3.3)))
        old_max = max(p[0] for p in core['fold']['vertices_coords'])
        self.assertTrue(any(
            max(fold['vertices_coords'][a][0], fold['vertices_coords'][b][0]) > old_max + .01
            for (a, b), kind in zip(fold['edges_vertices'], fold['edges_assignment'])
            if kind in ('M', 'V')))

    def test_paper_shapes_reach_selected_edges_without_losing_core(self):
        for paper in ({'shape': 'rectangle', 'aspect': 1.5, 'margin': .1},
                      {'shape': 'regular', 'sides': 6, 'margin': .1},
                      {'shape': 'regular', 'sides': 3, 'margin': .1}):
            with self.subTest(paper=paper):
                result = generate({**BASE, 'paper': paper})
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
                self.assertTrue(result['source']['paperExpansion'] >= 1)
                fold = result['fold']
                boundary = {v for edge, kind in zip(
                    fold['edges_vertices'], fold['edges_assignment'])
                    if kind == 'B' for v in edge}
                self.assertTrue(boundary)
                self.assertTrue(all(math.isfinite(c) for v in boundary
                                    for c in fold['vertices_coords'][v]))


if __name__ == '__main__':
    unittest.main()
