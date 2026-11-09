"""Saved In[3106] mother lattice with In[3180]'s centered two-tile recipe.

The notebook saves these inputs separately. This tests their explicit 2x2
composition, not an unrecorded Mathematica output for that composition.
"""
import itertools
import math
import unittest
from collections import Counter

from tessellation_archimedean_patch_catalog import archimedean_patch, archimedean_lattice_mesh
from tessellation_flat_embedding import flat_face_embedding
from tessellation_lattice_patch import make_lattice_tiling, twist_patch_options
from tessellation_meshes import polygon_mesh
from tessellation_tile_patch import construct_tile_patch
from tessellate import check_geometry, check_local_conditions, generate


H = math.sqrt(3) / 2


class ArchimedeanPatch1LatticeTwistTests(unittest.TestCase):
    def test_saved_source_geometry_and_four_cell_provenance(self):
        source = archimedean_patch(1)
        for actual, expected in zip(source['lattice'], ([1., 0.], [.5, H])):
            self.assertLess(math.dist(actual, expected), 1e-12)
        expected_polygons = (
            ([0., 0.], [1., 0.], [.5, H]),
            ([1., 0.], [1.5, H], [.5, H]),
        )
        for actual, expected in zip(source['sourceTiles'], expected_polygons):
            for point, target in zip(actual, expected):
                self.assertLess(math.dist(point, target), 1e-12)
        instances = make_lattice_tiling(source['sourceTiles'], source['lattice'], [0, 1], [0, 1])
        mother = archimedean_lattice_mesh(1, [0, 1], [0, 1])
        expected = [([x, y], tile) for y in (0, 1) for x in (0, 1) for tile in (0, 1)]
        self.assertEqual([(item['cell'], item['sourceFace']) for item in instances], expected)
        self.assertEqual(list(zip(mother['zhezhi_lattice_cells'],
                                  mother['zhezhi_custom_face_index'])), expected)
        self.assertEqual(len(mother['faces_vertices']), 8)
        self.assertEqual(Counter(mother['zhezhi_custom_face_index']), {0: 4, 1: 4})

    def test_centered_recipe_glues_real_cp_and_face_isometric_ff(self):
        source = archimedean_patch(1)
        unit = polygon_mesh(source['sourceTiles'])
        types = [['M'] * 3, ['V'] * 3]
        options = twist_patch_options(source['sourceTiles'], types, .2,
                                      variant='centered', tilt=70)
        mother = archimedean_lattice_mesh(1, [0, 1], [0, 1])
        direct = construct_tile_patch(mother, options,
                                      unit['vertices_coords'], unit['faces_vertices'])
        request = dict(family='custom', vertices=unit['vertices_coords'],
                       faces=unit['faces_vertices'], repeatX=1, repeatY=1,
                       lattice=source['lattice'], range1=[0, 1], range2=[0, 1],
                       customOutput='tile-twists', tileTwists=[
                           dict(width=.2, offset=0, tilt=70, centralTypes=t)
                           for t in types], angle=36, scale=.3)
        result = generate(request)
        fold = result['fold']
        self.assertEqual(result['stats']['tiles'], 8)
        self.assertEqual(tuple(result['stats'][key] for key in ('vertices', 'edges', 'faces')),
                         (64, 96, 33))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertEqual(check_local_conditions(fold)['status'], 'passed')
        self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
        self.assertEqual(fold['edges_vertices'], direct['edges_vertices'])
        self.assertEqual(fold['edges_assignment'], direct['edges_assignment'])
        self.assertEqual(fold['edges_foldAngle'], direct['edges_foldAngle'])
        self.assertEqual(fold['faces_vertices'], direct['faces_vertices'])
        self.assertEqual(fold['zhezhi_face_tile_source'], direct['zhezhi_face_tile_source'])
        self.assertLess(max(math.dist(a, b) for a, b in zip(
            fold['vertices_coords'], direct['vertices_coords'])), 1e-9)
        self.assertEqual(Counter(fold['edges_assignment']), {'M': 36, 'V': 36, 'B': 24})
        self.assertEqual({tuple(cell) for cell in fold['zhezhi_face_tile_cell']
                          if cell is not None}, {(0, 0), (1, 0), (0, 1), (1, 1)})
        flattened, closure = flat_face_embedding(fold)
        self.assertLess(closure, 1e-8)
        maximum = max(abs(math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b])-
                          math.dist(flattened[a], flattened[b]))
                      for face in fold['faces_vertices']
                      for a, b in itertools.combinations(face, 2))
        self.assertLess(maximum, 1e-8)


if __name__ == '__main__':
    unittest.main()
