"""Application contract for the cut, isometric paraboloidal Flasher."""

from collections import Counter
import math
import unittest

from tessellate import check_geometry, generate, validate_request
from tessellation_paraboloidal_flasher_candidate import _check_face_overlap
from tessellation_paraboloidal_flasher import solve_paraboloidal_flasher


def _original_x_quads_and_diagonals(r, h, m, k=0):
    """Literal In[4116]/In[4122] row oracle, independent of production helpers.

    X's Graphics lists minor before major; the original isometry equations
    consume the same diagonal geometry. Compare labels, never seed proximity.
    """
    n = r * h
    def wrap(point):
        i, j, sector = point
        return (j, 0, (sector - 1) % m) if i == -1 else (i, j, sector % m)
    major, minor = [], []
    for group in range(r):
        j = h * group
        major.extend(tuple(wrap(point) for point in
                     ((i,j,k),(i-1,j,k),(i-1,min(j+h,i),k),(i,min(j+h,i+1),k)))
                     for i in range(j,n+1) if min(j+h,i)>j)
    for group in range(r):
        i = h * group - 1
        minor.extend(tuple(wrap(point) for point in
                     ((i,j,k),(i,j-1,k),(min(i+h,j-2),j-1,k),(min(i+h,j-1),j,k)))
                     for j in range(h*group+1,n+1) if min(i+h,j-2)>i)
    result, source_order = [], []
    for quads, width in ((minor,n-1),(major,n)):
        cursor, row = 0, 1
        while width>0:
            for column in range(1,width+1):
                quad=quads[cursor]
                indices=(0,2) if (column+(h-1)*(row-1)+1)%2==0 else (1,3)
                result.append((quad[indices[0]],quad[indices[1]]))
                source_order.append((quad,(quad[indices[0]],quad[indices[1]])))
                cursor+=1
            row+=1; width-=h
        assert cursor==len(quads)
    mapping=dict(source_order)
    return major+minor, [mapping[quad] for quad in major+minor], result


class ParaboloidalFlasherCandidateTests(unittest.TestCase):
    def test_original_x_option_uses_literal_row_and_wrap_topology_and_all_gates(self):
        # Original MakeParaboloidalFlasher forwards opts to the isometry and
        # FlasherSectorFoldLines; X is a real function choice, not a preset Out.
        for r,h,m,counts in ((1,1,4,(20,36,17)),(2,2,4,(100,196,97)),
                             (2,3,6,(222,438,217))):
            with self.subTest(r=r,h=h,m=m):
                params={'family':'paraboloidal-flasher','rings':r,'heightOrder':h,
                        'rotationalOrder':m,'focalLength':6,'radialIncrement':.05,
                        'diagonal':'X','minimumAngleDeg':10,'cutMinimumAngleDeg':10}
                self.assertEqual(validate_request(params)['diagonal'],'X')
                raw=solve_paraboloidal_flasher(r,h,m,6,.05,'X',minimum_angle_deg=10)
                labels=raw['vertex_ijk']
                for k in range(m):
                    original_quads,diagonals,drawing_order=_original_x_quads_and_diagonals(r,h,m,k)
                    actual_quads=[tuple(tuple(labels[v]) for v in q)
                                  for q in raw['quads_vertices'][k*len(original_quads):(k+1)*len(original_quads)]]
                    self.assertEqual(actual_quads,original_quads)
                    source_edges={tuple(sorted((tuple(labels[a]),tuple(labels[b]))))
                                  for a,b in raw['edges_vertices']}
                    self.assertTrue({tuple(sorted(pair)) for pair in drawing_order}<=source_edges)
                    if k==0:self.assertEqual([tuple(tuple(x) for x in e) for e in raw['edge_references'][-len(diagonals):]],diagonals)
                self.assertLess(raw['isometryResidualSum'],1e-6)
                for x,y,z in raw['deployed_vertices_coords']:
                    self.assertAlmostEqual(z,(x*x+y*y)/24,places=11)
                for a,b in raw['edges_vertices']:
                    self.assertAlmostEqual(math.dist(raw['deployed_vertices_coords'][a],raw['deployed_vertices_coords'][b]),
                                           math.dist(raw['folded_vertices_coords'][a],raw['folded_vertices_coords'][b]),places=10)
                result=generate(params)
                self.assertEqual(tuple(result['stats'][key] for key in ('vertices','edges','faces')),counts)
                self.assertEqual(result['stats']['parameters']['diagonal'],'X')
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['layerOrder']['status'],'not_checked')
                self.assertTrue(result['source']['staticGlobalIsometryChecked'])
                self.assertTrue(result['source']['planarFaceOverlapChecked'])
                self.assertFalse(result['source']['continuousRigidPathChecked'])
                for face in result['fold']['faces_vertices']:
                    for i,a in enumerate(face):
                        for b in face[i+1:]:
                            cp=math.dist(result['fold']['vertices_coords'][a],result['fold']['vertices_coords'][b])
                            for field in ('deployedForm3D','foldedForm3D'):
                                self.assertAlmostEqual(cp,math.dist(result['source'][field][a],result['source'][field][b]),places=9)

    def test_x_parameters_change_actual_geometry_and_unknown_or_failed_input_stays_rejected(self):
        base={'family':'paraboloidal-flasher','diagonal':'X'}
        first=generate(base)
        next_result=generate({**base,'focalLength':7,'radialIncrement':.075})
        self.assertNotEqual(first['fold']['vertices_coords'],next_result['fold']['vertices_coords'])
        self.assertNotEqual(first['source']['foldedForm3D'],next_result['source']['foldedForm3D'])
        for diagonal in ('Y','Z'):
            self.assertNotEqual(first['fold']['vertices_coords'],generate({'family':'paraboloidal-flasher','diagonal':diagonal})['fold']['vertices_coords'])
        with self.assertRaisesRegex(ValueError,'交叉检查'):
            generate({**base,'focalLength':1e6})
        with self.assertRaises(ValueError):validate_request({**base,'diagonal':'Q'})

    def test_in4208_raw_dp_ff_and_local_cut_candidate_remain_distinct(self):
        raw = solve_paraboloidal_flasher(2, 3, 6, 5, .2, 'Y',
                                         minimum_angle_deg=20)
        self.assertEqual((len(raw['deployed_vertices_coords']),
                          len(raw['edges_vertices']), len(raw['faces_vertices'])),
                         (126, 342, 217))
        self.assertFalse(raw['hasTruePlanarDevelopment'])
        projected = raw['projected_vertices_coords']
        deployed = raw['deployed_vertices_coords']
        self.assertGreater(max(abs(math.dist(projected[a], projected[b]) -
                                   math.dist(deployed[a], deployed[b]))
                               for a, b in raw['edges_vertices']), .2)
        self.assertGreater(raw['minimumDPFaceArea'], 0)
        self.assertGreater(raw['minimumFFFaceArea'], 0)
        self.assertLess(raw['maxDPFFFaceEdgeError'], 1e-10)
        params = {'family': 'paraboloidal-flasher', 'rings': 2,
                  'heightOrder': 3, 'rotationalOrder': 6,
                  'focalLength': 5, 'radialIncrement': .2,
                  'diagonal': 'Y', 'minimumAngleDeg': 20,
                  'cutMinimumAngleDeg': 10}  # local, absent from In[4208]
        result = generate(params)
        self.assertEqual(result['stats']['parameters'],
                         validate_request(params))
        self.assertEqual(tuple(result['stats'][key] for key in
                               ('vertices', 'edges', 'faces')), (222, 438, 217))
        self.assertEqual(len(result['source']['originalProjectedVertices2D']),
                         126)
        self.assertEqual(len(result['source']['cutSourceEdges']), 96)
        self.assertEqual(result['stats']['checks']['geometry']['status'],
                         'passed')
        self.assertEqual(result['stats']['checks']['layerOrder']['status'],
                         'not_checked')
        self.assertTrue(result['source']['staticGlobalIsometryChecked'])
        self.assertLess(result['source']['maximumFaceDistanceError'], 1e-10)

    def test_main_route_uses_cut_development_with_same_index_dp_and_ff(self):
        cases = (
            ({'family': 'paraboloidal-flasher'}, (100, 196, 97)),
            ({'family': 'paraboloidal-flasher', 'rotationalOrder': 5,
              'focalLength': 3, 'radialIncrement': .1, 'diagonal': 'Z',
              'minimumAngleDeg': 20, 'cutMinimumAngleDeg': 180},
             (125, 245, 121)),
        )
        for params, expected in cases:
            with self.subTest(params=params):
                result = generate(params)
                fold, source = result['fold'], result['source']
                flat = fold['vertices_coords']
                dp = source['deployedForm3D']
                ff = source['foldedForm3D']
                self.assertEqual(tuple(result['stats'][key] for key in
                                       ('vertices', 'edges', 'faces')), expected)
                self.assertEqual((len(flat), len(dp), len(ff)),
                                 (expected[0], expected[0], expected[0]))
                self.assertEqual(len(fold['edges_vertices']),
                                 len(fold['edges_assignment']))
                self.assertEqual(len(fold['edges_vertices']),
                                 len(fold['edges_foldAngle']))
                self.assertEqual(source['spatialKind'],
                                 'origamica-paraboloidal-flasher-cut')
                self.assertTrue(source['staticGlobalIsometryChecked'])
                self.assertTrue(source['planarFaceOverlapChecked'])
                self.assertTrue(source['deployedPatternChecked'])
                self.assertEqual(result['stats']['checks']['geometry']['status'],
                                 'passed')
                self.assertEqual(check_geometry(fold)['status'], 'passed')
                self.assertEqual(Counter(fold['edges_assignment'])['B'],
                                 len(flat))
                self.assertEqual(source['boundaryCycleVertices'], len(flat))
                self.assertLess(source['maximumFaceDistanceError'], 1e-10)
                self.assertLess(source['maximumDeployedFaceDistanceError'], 1e-10)

                for face in fold['faces_vertices']:
                    for position, u in enumerate(face):
                        for v in face[position + 1:]:
                            self.assertAlmostEqual(math.dist(flat[u], flat[v]),
                                                   math.dist(dp[u], dp[v]), places=9)
                            self.assertAlmostEqual(math.dist(flat[u], flat[v]),
                                                   math.dist(ff[u], ff[v]), places=9)
                self.assertEqual(len(source['originalProjectedVertices2D']),
                                 expected[0] - len(source['cutSourceEdges']))
                self.assertNotEqual(len(source['originalProjectedVertices2D']),
                                    len(flat))
                if params.get('cutMinimumAngleDeg') == 180:
                    self.assertEqual(Counter(fold['edges_assignment']),
                                     Counter({'B': 125, 'U': 120}))

    def test_face_overlap_gate_detects_containment_without_edge_crossing(self):
        coordinates = [[0, 0], [4, 0], [0, 4],
                       [.3, .3], [.5, .3], [.3, .5]]
        faces = [[0, 1, 2], [3, 4, 5]]
        edges = [[0, 1], [1, 2], [0, 2],
                 [3, 4], [4, 5], [3, 5]]
        self.assertEqual(check_geometry({'vertices_coords': coordinates,
                                         'edges_vertices': edges})['status'], 'passed')
        with self.assertRaisesRegex(ValueError, '面积重叠'):
            _check_face_overlap(coordinates, faces)

    def test_flat_limit_sample_is_not_misreported_as_cuttable_single_sheet(self):
        # In[4206] is a useful DP/FF numerical limit. Its cut edges nearly
        # coincide in 2D, so the current sheet validator correctly rejects it.
        with self.assertRaisesRegex(ValueError, '交叉检查'):
            generate({'family': 'paraboloidal-flasher', 'focalLength': 1e6})

    def test_invalid_request_is_rejected_before_solve(self):
        bad = (
            {'family': 'paraboloidal-flasher', 'rings': True},
            {'family': 'paraboloidal-flasher', 'rings': 3, 'heightOrder': 3},
            {'family': 'paraboloidal-flasher', 'focalLength': 0},
            {'family': 'paraboloidal-flasher', 'radialIncrement': float('nan')},
            {'family': 'paraboloidal-flasher', 'cutMinimumAngleDeg': 181},
            {'family': 'paraboloidal-flasher', 'diagonal': 'Q'},
            {'family': 'paraboloidal-flasher', 'paper': {'shape': 'square',
                                                       'margin': .1}},
        )
        for params in bad:
            with self.subTest(params=params), self.assertRaises(ValueError):
                validate_request(params)


if __name__ == '__main__':
    unittest.main()
