"""Saved 120-to-21 source crop and complete CP for Origamica In[3186]."""

import json
import math
import unittest

from tessellation_archimedean_patch8_in3186 import build_archimedean_patch8_in3186
from tessellation_lattice_patch import twist_patch_options
from tessellate import generate
from test_tessellation_archimedean_patch8_lattice import (
    SOURCE_TYPES, custom_request, lattice8, source_patch8,
)


class ArchimedeanPatch8SavedCropTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = build_archimedean_patch8_in3186()

    def test_saved_extent_crop_and_original_provenance(self):
        result = self.saved
        self.assertEqual(result['source']['cell'], 'In[3186]')
        self.assertFalse(result['source']['machineReadableWolframOut'])
        self.assertEqual(result['source']['sourceRanges'], [[-2, 2], [-1, 2]])
        self.assertEqual(result['counts'], {
            'sourceTiles': 120, 'retainedTiles': 21,
            'vertices': 152, 'edges': 260, 'faces': 109,
        })
        mother, fold = result['mother'], result['fold']
        self.assertEqual(list(zip(mother['zhezhi_original_tile_index'],
                                  mother['zhezhi_lattice_cells'],
                                  mother['zhezhi_custom_face_index'])), [
            (42, [0, 0], 0), (47, [0, 0], 5),
            (48, [1, 0], 0), (53, [1, 0], 5),
            (68, [-1, 1], 2), (69, [-1, 1], 3),
            (70, [-1, 1], 4), (71, [-1, 1], 5),
            (72, [0, 1], 0), (73, [0, 1], 1),
            (74, [0, 1], 2), (75, [0, 1], 3),
            (76, [0, 1], 4), (77, [0, 1], 5),
            (94, [-2, 2], 4),
            (97, [-1, 2], 1), (98, [-1, 2], 2),
            (99, [-1, 2], 3), (100, [-1, 2], 4),
            (103, [0, 2], 1), (104, [0, 2], 2),
        ])
        self.assertEqual(len(fold['zhezhi_face_tile_instance']), 109)
        self.assertEqual(len(fold['zhezhi_face_tile_cell']), 109)
        for face, instance in enumerate(fold['zhezhi_face_tile_instance']):
            self.assertEqual(fold['zhezhi_face_tile_source'][face],
                             mother['zhezhi_custom_face_index'][instance])
            self.assertEqual(fold['zhezhi_face_tile_cell'][face],
                             mother['zhezhi_lattice_cells'][instance])
            self.assertEqual(fold['zhezhi_face_original_tile_index'][face],
                             mother['zhezhi_original_tile_index'][instance])
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertNotIn('layerOrder', result['checks'])
        self.assertNotIn('foldedVertices', result)
        json.dumps(result, allow_nan=False)

    def test_prune_first_cp_equals_existing_checked_full_mesh_route(self):
        patch = source_patch8()  # Independent JoinTiling reconstruction.
        request = custom_request(
            patch, lattice=lattice8(patch), range1=[-2, 2],
            range2=[-1, 2], output='tile-twists',
            twists=twist_patch_options(patch, SOURCE_TYPES, .12,
                                        variant='centered-angle', angle=29),
        )
        request['pruneBoundary'] = [[.1, .1], [3.9, .1],
                                    [3.9, 3.9], [.1, 3.9]]
        generic = generate(request)
        self.assertEqual(generic['stats']['tiles'], 21)
        for field in ('vertices_coords', 'edges_vertices', 'edges_assignment',
                      'edges_foldAngle', 'faces_vertices',
                      'zhezhi_face_tile_instance', 'zhezhi_face_tile_source'):
            self.assertEqual(self.saved['fold'][field], generic['fold'][field], field)
        self.assertEqual(self.saved['mother']['zhezhi_custom_face_index'],
                         generic['mother']['zhezhi_custom_face_index'])
        for key in ('zhezhi_lattice_cells', 'zhezhi_original_tile_index'):
            self.assertEqual(self.saved['mother'][key], generic['mother'][key])
        for key in ('zhezhi_face_tile_cell', 'zhezhi_face_original_tile_index'):
            self.assertEqual(self.saved['fold'][key], generic['fold'][key])
        for actual, expected in zip(self.saved['mother']['zhezhi_custom_polygons'],
                                    generic['mother']['zhezhi_custom_polygons']):
            self.assertEqual(len(actual), len(expected))
            for point, target in zip(actual, expected):
                self.assertLess(math.dist(point, target), 1e-12)


if __name__ == '__main__':
    unittest.main()
