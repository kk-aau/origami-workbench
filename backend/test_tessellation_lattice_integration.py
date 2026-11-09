import unittest
from collections import Counter

from tessellate import generate


class LatticeIntegrationTests(unittest.TestCase):
    def test_signed_patch_reaches_standard_generation_with_source_identity(self):
        params = {
            'family': 'custom',
            'vertices': [[0, 0], [1, 0], [1, 1], [0, 1], [2, 0], [2, 1]],
            'faces': [[0, 1, 2, 3], [1, 4, 5, 2]],
            'repeatX': 1, 'repeatY': 1,
            'lattice': [[2, 0], [1, 1]],
            'range1': [-1, 1], 'range2': [-1, 1],
            'customOutput': 'tiling', 'angle': 36, 'scale': .3,
        }
        result = generate(params)
        mother = result['mother']
        self.assertEqual(result['source']['output'], 'tiling')
        self.assertEqual(result['stats']['tiles'], 18)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual((len(mother['vertices_coords']), len(mother['edges_vertices']),
                          len(mother['faces_vertices'])), (30, 47, 18))
        self.assertEqual(Counter(mother['zhezhi_custom_face_index']), {0: 9, 1: 9})
        self.assertEqual(mother['zhezhi_lattice_cells'][0], [-1, -1])
        self.assertEqual(mother['zhezhi_lattice_cells'][-1], [1, 1])
        self.assertEqual(set(result['fold']['edges_assignment']), {'B', 'F'})

    def test_signed_range_validation_is_consistent_at_request_boundary(self):
        base = {
            'family': 'custom', 'vertices': [[0, 0], [1, 0], [1, 1], [0, 1]],
            'faces': [[0, 1, 2, 3]], 'repeatX': 1, 'repeatY': 1,
            'lattice': [[1, 0], [0, 1]], 'range1': [-1, 1],
            'range2': [-1, 1], 'customOutput': 'tiling', 'angle': 36, 'scale': .3,
        }
        for patch in ({'range1': [1, -1]}, {'range2': [-65, 0]},
                      {'range2': None}, {'repeatX': 2}, {'lattice': [[1, 0], [2, 0]]}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                generate({**base, **patch})
        with self.assertRaises(ValueError):
            generate({**base, 'range1': [-8, 8], 'range2': [-8, 8]})

    def test_negative_cells_feed_per_tile_twists_through_generation(self):
        vertices = [[0, 0], [.5, 0], [1, 0], [0, .5], [.5, .5],
                    [1, .5], [0, 1], [.5, 1], [1, 1]]
        faces = [[0, 1, 4, 3], [1, 2, 5, 4],
                 [3, 4, 7, 6], [4, 5, 8, 7]]
        twists = [dict(width=.2, offset=0, tilt=tilt,
                       centralTypes=[assignment] * 4)
                  for tilt, assignment in zip((70, 110, 110, 70),
                                              ('M', 'V', 'V', 'M'))]
        result = generate({
            'family': 'custom', 'vertices': vertices, 'faces': faces,
            'repeatX': 1, 'repeatY': 1, 'lattice': [[1, 0], [0, 1]],
            'range1': [-1, 0], 'range2': [0, 0],
            'customOutput': 'tile-twists', 'tileTwists': twists,
            'angle': 36, 'scale': .3,
        })
        self.assertEqual(result['stats']['tiles'], 8)
        self.assertEqual(result['source']['output'], 'tile-twists')
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(set(result['fold']['zhezhi_face_tile_source']), set(range(4)))
        self.assertEqual(len(result['fold']['zhezhi_face_tile_instance']),
                         len(result['fold']['faces_vertices']))


if __name__ == '__main__':
    unittest.main()
