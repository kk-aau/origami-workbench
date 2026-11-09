"""In[3072] source-fixed assignments fail the strict minimum-sector gate."""

import math
import unittest
from unittest.mock import patch

from tessellation_patterns import make_fold
from tessellation_split_exact import exact_split, unit_quadrilateral_vertices
from tessellation_tile_patch import construct_tile_patch


ANGLES = [70., 85., 95., 110.]
WIDTH = .15
OFFSETS = (.09, -.09)


class UnitQuadrilateralOffsetSplitIn3072Tests(unittest.TestCase):
    def test_source_fixed_seam_and_independent_minimum_sector_witness(self):
        first = unit_quadrilateral_vertices(ANGLES, 1., 2)
        self.assertLess(math.dist(first[2], [0.912844257252342,
                                              0.9961946980917455]), 1e-12)
        # First tile's side 2 has tap at (1-w)/2+d = .515.  The second
        # tile's side 2 is reversed on attachment, so its .485 tap lands
        # at the same world location.  Both boundary edges are deleted.
        seam = [first[1][axis]+.515*(first[2][axis]-first[1][axis])
                for axis in (0, 1)]
        self.assertLess(math.dist(seam, [0.9551147924849561,
                                          0.513040269517249]), 1e-12)
        incidents = []
        witnesses=[]
        for tile_index, offset in enumerate(OFFSETS):
            # Extract the raw source-fixed CP for this diagnostic test only.
            # The production entry below still runs its full local gate.
            with patch('tessellation_advanced.assign_local_mv',
                       side_effect=lambda fold,**kwargs:fold):
                fold, _, _ = exact_split(first, WIDTH, offset, 90., 1,
                                         'M', ['M']*4, offset > 0)
            def world(point):
                return point if tile_index == 0 else [
                    first[1][axis]+first[2][axis]-point[axis]
                    for axis in (0, 1)]
            local = []
            for (a, b), kind in zip(fold['edges_vertices'],
                                    fold['edges_assignment']):
                if kind == 'B':
                    continue
                if (math.dist(world(fold['vertices_coords'][a]), seam) < 1e-8 or
                        math.dist(world(fold['vertices_coords'][b]), seam) < 1e-8):
                    local.append(kind)
            incidents.append(local)
            boundary={v for edge,kind in zip(fold['edges_vertices'],fold['edges_assignment'])
                      if kind=='B' for v in edge}
            for vertex,origin in enumerate(fold['vertices_coords']):
                if vertex in boundary:continue
                rays=[]
                for (a,b),kind in zip(fold['edges_vertices'],fold['edges_assignment']):
                    if vertex not in (a,b):continue
                    point=fold['vertices_coords'][b if vertex==a else a]
                    rays.append((math.atan2(point[1]-origin[1],point[0]-origin[0]),kind))
                rays.sort();n=len(rays)
                sectors=[(rays[(i+1)%n][0]-rays[i][0])%math.tau for i in range(n)]
                for i,sector in enumerate(sectors):
                    if sector+1e-7<min(sectors[i-1],sectors[(i+1)%n]) and rays[i][1]==rays[(i+1)%n][1]:
                        witnesses.append((tile_index,origin,math.degrees(sector),rays[i][1]))
        self.assertEqual(incidents, [['M'], ['M']])
        # The source-fixed seam itself meets Maekawa. The old V/M seam
        # witness depended on freely repaired pleat assignments.
        self.assertEqual(sum(kind == 'M' for row in incidents for kind in row)-
                         sum(kind == 'V' for row in incidents for kind in row), 2)
        self.assertEqual(len(witnesses),2)
        self.assertEqual([(row[0],row[3]) for row in witnesses],[(0,'M'),(0,'M')])
        self.assertLess(math.dist(witnesses[0][1],[.5469219959,.622712994]),1e-9)
        self.assertAlmostEqual(witnesses[0][2],57.3868704891,places=7)
        self.assertLess(math.dist(witnesses[1][1],[.665,.4876585141]),1e-9)
        self.assertAlmostEqual(witnesses[1][2],27.6131295354,places=7)

    def test_whole_saved_pair_rejects_the_same_local_counterexample(self):
        first = unit_quadrilateral_vertices(ANGLES, 1., 2)
        second = [[first[1][axis]+first[2][axis]-point[axis]
                   for axis in (0, 1)] for point in first]
        vertices = first+[second[0], second[3]]
        faces = [[0, 1, 2, 3], [4, 2, 1, 5]]
        mother = make_fold(vertices,
                           [[0,1],[1,2],[2,3],[3,0],[4,2],[1,5],[5,4]],
                           ['B']*7, [face[::-1] for face in faces])
        mother['zhezhi_custom_face_index'] = [0, 1]
        choices = [
            {'construction': 'split', 'width': WIDTH, 'offset': offset,
             'tilt': 90., 'ccw': offset > 0, 'baseVertex': 1,
             'connection': 'M', 'centralTypes': ['M']*4}
            for offset in OFFSETS
        ]
        with self.assertRaisesRegex(ValueError, '局部山谷赋型无解'):
            construct_tile_patch(mother, choices, vertices, faces,
                                 {'mergedEdges': 'delete',
                                  'samePtTolerance': 1e-8,
                                  'collinearCleanup': True,
                                  'collinearTolerance': 1e-8})


if __name__ == '__main__':
    unittest.main()
