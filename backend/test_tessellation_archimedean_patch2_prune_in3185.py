"""Independent source and CP checks for Origamica's saved In[3185]."""
import itertools
import math
import unittest
from collections import Counter

from tessellation_archimedean_patch_catalog import (
    archimedean_lattice_mesh, archimedean_patch,
)
from tessellation_flat_embedding import flat_face_embedding
from tessellation_lattice_patch import make_lattice_tiling, twist_patch_options
from tessellation_prune import prune_mesh
from tessellation_tile_patch import construct_tile_patch
from tessellate import check_geometry, check_local_conditions, generate


BOUNDARY = [[0, 0], [2.9, 0], [2.9, 2.9], [0, 2.9]]
MERGE = {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
         'collinearCleanup': True, 'collinearTolerance': 1e-8}
EXPECTED_CELLS = [[i, j] for j in range(3) for i in range(3)]


def request(pruned=False):
    value = {'family': 'custom',
             'vertices': [[0, 0], [1, 0], [1, 1], [0, 1]],
             'faces': [[0, 1, 2, 3]], 'repeatX': 1, 'repeatY': 1,
             'lattice': [[1, 0], [0, 1]],
             'range1': [0, 3], 'range2': [0, 3],
             'customOutput': 'tile-twists',
             'tileTwists': [{'width': .2, 'offset': 0,
                             'angleMode': 'twist', 'twistAngle': 30,
                             'centralTypes': ['V', 'V', 'M', 'M']}],
             'monolithicOptions': MERGE, 'angle': 36, 'scale': .3}
    if pruned:
        value['pruneBoundary'] = BOUNDARY
    return value


def named(pruned=False):
    source = archimedean_patch(2)
    twists = twist_patch_options(source['sourceTiles'],
                                 [['V', 'V', 'M', 'M']], .2,
                                 variant='centered-angle', angle=30)
    mother = archimedean_lattice_mesh(2, [0, 3], [0, 3])
    if pruned:
        mother = prune_mesh(mother, BOUNDARY)
    fold = construct_tile_patch(mother, twists, source['sourceTiles'][0],
                                [[0, 1, 2, 3]], MERGE)
    return mother, fold


class ArchimedeanPatch2PruneIn3185Tests(unittest.TestCase):
    def test_original_vertex_predicate_and_whole_tile_prune(self):
        source = archimedean_patch(2)
        self.assertEqual(source['vertexType'], [4, 4, 4, 4])
        self.assertEqual(len(source['sourceTiles']), 1)
        self.assertAlmostEqual(source['lattice'][0][0], 1)
        self.assertAlmostEqual(source['lattice'][1][1], 1)
        instances = make_lattice_tiling(source['sourceTiles'], source['lattice'],
                                        [0, 3], [0, 3])
        self.assertEqual(len(instances), 16)
        self.assertEqual([item['cell'] for item in instances],
                         [[i, j] for j in range(4) for i in range(4)])
        # In[2821]/In[2824]: OR over original tile vertices in the convex
        # window and window vertices in the tile. For these axis-aligned
        # squares, the first arm alone selects exactly these nine cells.
        saved_kept = [item for item in instances if
                      any(0 <= p[0] <= 2.9 and 0 <= p[1] <= 2.9
                          for p in item['polygon']) or
                      any(item['cell'][0] <= p[0] <= item['cell'][0] + 1 and
                          item['cell'][1] <= p[1] <= item['cell'][1] + 1
                          for p in BOUNDARY)]
        self.assertEqual([item['cell'] for item in saved_kept], EXPECTED_CELLS)
        full, _ = named()
        pruned, _ = named(True)
        self.assertEqual((len(full['vertices_coords']),
                          len(full['edges_vertices']),
                          len(full['faces_vertices'])), (25, 40, 16))
        self.assertEqual((len(pruned['vertices_coords']),
                          len(pruned['edges_vertices']),
                          len(pruned['faces_vertices'])), (16, 24, 9))
        for actual, expected in zip(pruned['zhezhi_custom_polygons'],
                                    [item['polygon'] for item in saved_kept]):
            for p, q in zip(actual, expected):
                self.assertLess(math.dist(p, q), 1e-12)
        # The red 2.9 square is only a selection window. The retained paper
        # reaches x=3 and y=3, with no artificial 2.9 cut edge.
        self.assertEqual(max(p[0] for p in pruned['vertices_coords']), 3)
        self.assertAlmostEqual(max(p[1] for p in pruned['vertices_coords']), 3)
        self.assertFalse(any(abs(v - 2.9) < 1e-9
                             for p in pruned['vertices_coords'] for v in p))

    def test_named_cp_matches_public_request_before_and_after_prune(self):
        for pruned, counts, assignments in (
                (False, (16, 100, 180, 81), {'B': 36, 'M': 72, 'V': 72}),
                (True, (9, 64, 112, 49), {'B': 28, 'M': 42, 'V': 42})):
            with self.subTest(pruned=pruned):
                mother, named_fold = named(pruned)
                result = generate(request(pruned))
                fold = result['fold']
                self.assertEqual((result['stats']['tiles'],
                                  result['stats']['vertices'],
                                  result['stats']['edges'],
                                  result['stats']['faces']), counts)
                self.assertEqual(result['mother']['faces_vertices'],
                                 mother['faces_vertices'])
                for field in ('edges_vertices', 'edges_assignment',
                              'edges_foldAngle', 'faces_vertices',
                              'zhezhi_face_tile_instance',
                              'zhezhi_face_tile_source'):
                    self.assertEqual(fold[field], named_fold[field])
                for p, q in zip(fold['vertices_coords'],
                                named_fold['vertices_coords']):
                    self.assertLess(math.dist(p, q), 1e-8)
                self.assertEqual(Counter(fold['edges_assignment']), assignments)
                self.assertEqual(check_geometry(fold)['status'], 'passed')
                self.assertEqual(check_local_conditions(fold)['status'], 'passed')
                self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
                self.assertEqual(result['stats']['checks']['layerOrder']['status'],
                                 'not_checked')
                flat, closure = flat_face_embedding(fold)
                self.assertLess(closure, 1e-8)
                for face in fold['faces_vertices']:
                    for a, b in itertools.combinations(face, 2):
                        self.assertAlmostEqual(
                            math.dist(fold['vertices_coords'][a],
                                      fold['vertices_coords'][b]),
                            math.dist(flat[a], flat[b]), places=7)
                self.assertEqual(len(result['source']['foldedForm']), counts[1])
                self.assertLess(result['source']['closureError'], 1e-8)


if __name__ == '__main__':
    unittest.main()
