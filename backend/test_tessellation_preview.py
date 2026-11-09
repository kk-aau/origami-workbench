import math
import unittest
from tessellate import generate


class PreviewTests(unittest.TestCase):
    def test_browser_recipe_matches_independently_recomputed_geometry(self):
        cases = [
            {'family': 'periodic', 'tiling': t, 'rows': 6, 'columns': 6} for t in ('square', 'triangle', 'hexagon')
        ] + [
            {'family': 'primal-dual', 'tiling': t, 'rings': 2} for t in ('square', 'triangle', 'hexagon')
        ] + [
            {'family': 'archimedean', 'tiling': '3.6.3.6', 'rings': 1},
            {'family': 'archimedean', 'tiling': 'resch-4', 'rings': 1, 'starAngle': 40},
            {'family': 'nonperiodic', 'kind': 'voronoi', 'count': 9, 'seed': 1, 'depth': 2},
            {'family': 'nonperiodic', 'kind': 'penrose', 'depth': 2},
            {'family': 'ring', 'sides': 8, 'rings': 2, 'growth': 1.8},
        ]
        def edges(fold, coords):
            return sorted(tuple(sorted(tuple(round(x, 7) for x in coords[i]) for i in edge)) for edge in fold['edges_vertices'])
        for params in cases:
            for sign in (-1, 1):
                with self.subTest(params=params, sign=sign):
                    base = generate({**params, 'angle': sign*36, 'scale': .3})
                    recipe = base['preview']
                    self.assertIsNotNone(recipe)
                    angle, scale = sign*51, .42
                    c, s = math.cos(math.radians(angle))*scale, math.sin(math.radians(angle))*scale
                    coords = [[cx+x*c-y*s, cy+x*s+y*c] for cx, cy, x, y in recipe['vertices']]
                    expected = generate({**params, 'angle': angle, 'scale': scale})['fold']
                    self.assertEqual(edges(base['fold'], coords), edges(expected, expected['vertices_coords']))


if __name__ == '__main__':
    unittest.main()
