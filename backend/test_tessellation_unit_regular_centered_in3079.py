"""Source-parameter, seam and flat-face checks for saved Origamica In[3079]."""

import itertools
import math
import unittest

from tessellation_unit_regular_centered import (
    ALT_TILE_TYPE, original_regular_centered_alt_pair_in3079,
)


class UnitRegularCenteredAltIn3079Tests(unittest.TestCase):
    def test_saved_join_and_flat_faces(self):
        result = original_regular_centered_alt_pair_in3079()
        self.assertEqual(result['sourceInput'], 'Origamica In[3079]')
        self.assertEqual(result['sourceJoin'], [1, 2, 1])
        first, second = result['sourceTiles']
        self.assertEqual([tile['tileType'] for tile in (first, second)],
                         [ALT_TILE_TYPE]*2)
        self.assertEqual([tile['centralTypes'] for tile in (first, second)],
                         [['M']*4, ['V']*4])
        self.assertEqual([tile['twistAngle'] for tile in (first, second)],
                         [25., 25.])
        self.assertEqual([tile['width'] for tile in (first, second)], [.2, .2])
        self.assertEqual(first['vertices'],
                         [[0., 0.], [1., 0.], [1., 1.], [0., 1.]])
        self.assertEqual(second['vertices'],
                         [[1., 0.], [2., 0.], [2., 1.], [1., 1.]])
        # JoinTiling's third index 1 is the new edge's endpoint: edge 4.
        self.assertEqual(first['vertices'][1], second['vertices'][0])
        self.assertEqual(first['vertices'][2], second['vertices'][3])
        self.assertEqual(result['mother']['zhezhi_custom_face_index'], [0, 1])
        self.assertEqual(len(result['mother']['edges_vertices']), 7)
        fold = result['fold']
        self.assertEqual((len(fold['vertices_coords']),
                          len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (24, 38, 15))
        self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
        self.assertEqual((fold['edges_assignment'].count('M'),
                          fold['edges_assignment'].count('V'),
                          fold['edges_assignment'].count('B')),
                         (11, 11, 16))
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertLess(result['closureError'], 1e-8)
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                original = math.dist(fold['vertices_coords'][a],
                                     fold['vertices_coords'][b])
                folded = math.dist(result['foldedForm'][a],
                                   result['foldedForm'][b])
                self.assertAlmostEqual(original, folded, places=7)
        # This Python source adapter has no global layer solver of its own.
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
        self.assertFalse(result['adoptable'])


if __name__ == '__main__':
    unittest.main()
