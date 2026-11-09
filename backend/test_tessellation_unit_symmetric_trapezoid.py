import itertools
import math
import unittest

from tessellation_tile_patch import construct_tile_patch
from tessellation_unit_symmetric_trapezoid import (
    TILE_TYPE, original_symmetric_trapezoid_pair,
    unit_symmetric_trapezoid_info, unit_symmetric_trapezoid_offset_tile,
)


class UnitSymmetricTrapezoidTests(unittest.TestCase):
    def test_original_analytic_unit_shape_and_brocard_values(self):
        # Origamica UnitBrocardTrapezoidInfo: s=-cos(delta)+sqrt(2-sin²(delta)).
        # The 60° case reduces to a golden-ratio diagonal side.
        info = unit_symmetric_trapezoid_info(60)
        self.assertEqual(info['tileType'], TILE_TYPE)
        self.assertAlmostEqual(info['diagonalSideLength'], (math.sqrt(5)-1)/2, places=12)
        self.assertEqual(info['vertices'][:2], [[0., 0.], [1., 0.]])
        self.assertAlmostEqual(info['vertices'][2][0], (5-math.sqrt(5))/4, places=12)
        self.assertAlmostEqual(info['vertices'][3][0], (math.sqrt(5)-1)/4, places=12)
        self.assertAlmostEqual(info['brocardCenter'][0], (3+math.sqrt(5))/8, places=12)
        self.assertAlmostEqual(info['brocardAngle'],
                               math.degrees(math.asin(math.sqrt(3/8))), places=12)
        for delta in (30, 60, 80, 120, 150):
            with self.subTest(delta=delta):
                p = unit_symmetric_trapezoid_info(delta)['vertices']
                self.assertAlmostEqual(math.dist(p[0], p[1]), 1, places=12)
                self.assertAlmostEqual(math.dist(p[1], p[2]), math.dist(p[3], p[0]), places=12)
                self.assertAlmostEqual(p[2][1], p[3][1], places=12)
                self.assertGreater(p[2][1], 0)

    def test_saved_positive_and_negative_offset_tiles_keep_order_and_assignments(self):
        # Origamica In[3063]: delta=80°, w=.2, d=±.15, types={M,M,M,M}.
        # The following central coordinates follow its perpendicular-pleat
        # delegation; they are analytic reconstructions, not stored Wolfram
        # numerical output anchors.
        expected = {
            .15: [[.55, .1165940004992622], [.75, .42578070257850353],
                  [.4646093110658842, .5463176959875765],
                  [.3230465553294211, .3274710880705455]],
            -.15: [[.25, .4257807025785035], [.45, .11659400049926229],
                   [.6769534446705787, .3274710880705455],
                   [.5353906889341158, .5463176959875765]],
        }
        for offset in (.15, -.15):
            with self.subTest(offset=offset):
                fold, mother, detail = unit_symmetric_trapezoid_offset_tile(
                    80, .2, offset, ['M']*4)
                self.assertEqual(detail['centralTypes'], ['M']*4)
                self.assertEqual(detail['twistDirection'], 'CCW' if offset > 0 else 'CW')
                self.assertEqual(detail['offset'], offset)
                self.assertEqual(detail['layerOrder'], 'not_checked')
                self.assertTrue(detail['deprecatedSource'])
                self.assertFalse(detail['adoptable'])
                self.assertEqual(len(mother['faces_vertices']), 1)
                self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                                  len(fold['faces_vertices'])), (16, 24, 9))
                for got, wanted in zip(detail['centralVertices'], expected[offset]):
                    self.assertLess(math.dist(got, wanted), 1e-11)

    def test_saved_side_two_pair_has_joined_cp_and_isometric_ff(self):
        result = original_symmetric_trapezoid_pair()
        first, second = result['sourceTiles']
        self.assertEqual([t['sourceIndex'] for t in result['sourceTiles']], [0, 1])
        self.assertEqual([t['offset'] for t in result['sourceTiles']], [.15, -.15])
        self.assertEqual([t['tileType'] for t in result['sourceTiles']], [TILE_TYPE]*2)
        self.assertTrue(result['deprecatedSource'])
        self.assertLess(math.dist(first['vertices'][1], second['vertices'][2]), 1e-12)
        self.assertLess(math.dist(first['vertices'][2], second['vertices'][1]), 1e-12)
        fold = result['fold']
        self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (24, 38, 15))
        self.assertNotIn('U', fold['edges_assignment'])
        self.assertIn(0, fold['zhezhi_face_tile_instance'])
        self.assertIn(1, fold['zhezhi_face_tile_instance'])
        self.assertEqual(fold['zhezhi_face_tile_instance'],
                         fold['zhezhi_face_tile_source'])
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertEqual(result['checks']['flatFoldedForm']['status'], 'passed')
        self.assertLess(result['closureError'], 1e-8)
        flat = result['foldedForm']
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],
                                                 fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=7)
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
        self.assertIn('face reflections', result['foldedFormMeaning'])
        self.assertFalse(result['adoptable'])

    def test_invalid_angles_offset_and_incompatible_seam_reject(self):
        for angle in (-5, 0, 180, 185, True, float('nan'), '80'):
            with self.subTest(angle=angle), self.assertRaises(ValueError):
                unit_symmetric_trapezoid_info(angle)
        for width, offset, types in ((.2, float('nan'), ['M']*4),
                                     (.2, True, ['M']*4),
                                     (.8, .15, ['M']*4),
                                     (.2, .15, ['M']*3),
                                     (.2, .15, ['M', 'M', 'M', 'U'])):
            with self.subTest(width=width, offset=offset, types=types), self.assertRaises(ValueError):
                unit_symmetric_trapezoid_offset_tile(80, width, offset, types)
        pair = original_symmetric_trapezoid_pair()
        vertices = pair['mother']['vertices_coords']
        first = dict(width=.2, offset=.15, tilt=90, centralTypes=['M']*4)
        second = dict(width=.25, offset=-.15, tilt=90, centralTypes=['M']*4)
        with self.assertRaises(ValueError):
            construct_tile_patch(pair['mother'], [first, second], vertices,
                                 [[0, 1, 2, 3], [4, 2, 1, 5]])


if __name__ == '__main__':
    unittest.main()
