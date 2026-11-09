import itertools
import math
import unittest

from tessellation_flat_embedding import flat_face_embedding
from tessellation_unit_cyclic_centered import (
    ALT_TYPE, CENTERED_TYPE, SAVED_ANGLES,
    original_cyclic_centered_pair, unit_cyclic_quadrilateral_info,
    unit_cyclic_centered_twist_alt_tile, unit_cyclic_centered_twist_tile,
)
from tessellate import check_geometry, check_local_conditions


def edge_assignment(fold, a, b):
    coords = fold['vertices_coords']
    indices = [min(range(len(coords)), key=lambda index: math.dist(point, coords[index]))
               for point in (a, b)]
    for edge, kind in zip(fold['edges_vertices'], fold['edges_assignment']):
        if set(edge) == set(indices):
            return kind
    raise AssertionError(f'central edge missing: {a}, {b}')


class UnitCyclicCenteredTests(unittest.TestCase):
    def test_even_angle_semantics_and_saved_circumcircle(self):
        info = unit_cyclic_quadrilateral_info(SAVED_ANGLES, 1.2, 2)
        self.assertEqual(info['inputAngles'], SAVED_ANGLES)
        self.assertEqual(info['effectiveAngles'], [75., 85., 105., 95.])
        self.assertEqual(info['vertices'],
                         unit_cyclic_quadrilateral_info([75,85,0,0],1.2,2)['vertices'])
        p = info['vertices']
        self.assertEqual(p[:2], [[0.,0.],[1.,0.]])
        self.assertAlmostEqual(math.dist(p[1],p[2]),1.2)
        self.assertAlmostEqual(p[2][0],.8954131087028104)
        self.assertAlmostEqual(p[3][0],.34626108348930373)
        self.assertAlmostEqual(p[3][1],1.2922639562659313)
        self.assertAlmostEqual(info['circumcenter'][0],.5)
        self.assertAlmostEqual(info['circumcenter'][1],.5585475707630466)
        self.assertAlmostEqual(info['circumradius'],.7496501776197352)
        for point in p:
            self.assertAlmostEqual(math.dist(point,info['circumcenter']),
                                   info['circumradius'],places=10)

    def test_named_centered_and_alt_cp(self):
        cases=((unit_cyclic_centered_twist_tile,80.,CENTERED_TYPE),
               (unit_cyclic_centered_twist_alt_tile,30.,ALT_TYPE))
        centers=[]
        for build,angle,tile_type in cases:
            with self.subTest(tile_type=tile_type):
                kinds=['M','V','M','V']
                fold,mother,info=build(SAVED_ANGLES,1.2,2,.1,angle,kinds)
                self.assertEqual(info['tileType'],tile_type)
                self.assertEqual(info['inputAngles'],SAVED_ANGLES)
                self.assertEqual(info['effectiveAngles'],[75.,85.,105.,95.])
                self.assertEqual(info['centralTypes'],kinds)
                self.assertEqual(info['layerOrder'],'not_checked')
                self.assertFalse(info['adoptable'])
                self.assertEqual(len(mother['faces_vertices']),1)
                self.assertEqual(check_geometry(fold)['status'],'passed')
                self.assertEqual(check_local_conditions(fold)['status'],'passed')
                center=info['centralVertices']
                centers.append(center)
                self.assertEqual([edge_assignment(fold,a,b)
                                  for a,b in zip(center,center[1:]+center[:1])],kinds)
                if tile_type==ALT_TYPE:
                    self.assertEqual(info['twistAngle'],30.)
                    self.assertAlmostEqual(info['pleatAngle'],80.17357018416773)
                    tau,alpha=map(math.radians,(info['pleatAngle'],30.))
                    self.assertAlmostEqual(math.sin(alpha)*math.cos(tau)
                                           -.1*math.cos(alpha)*math.sin(tau),0,places=12)
                else:
                    self.assertEqual(info['pleatAngle'],80.)
        self.assertGreater(math.dist(centers[0][0],centers[1][0]),1e-4)

    def test_saved_pairs_cp_and_per_face_isometry(self):
        for alternate,tile_type in ((False,CENTERED_TYPE),(True,ALT_TYPE)):
            with self.subTest(tile_type=tile_type):
                result=original_cyclic_centered_pair(alternate)
                fold=result['fold']
                self.assertEqual((len(fold['vertices_coords']),len(fold['edges_vertices']),
                                  len(fold['faces_vertices'])),(26,40,15))
                self.assertEqual(fold['zhezhi_merged_edge_mode'],'delete')
                self.assertEqual(result['checks']['geometry']['status'],'passed')
                self.assertEqual(result['checks']['local']['status'],'passed')
                self.assertLess(result['closureError'],1e-8)
                self.assertEqual(result['checks']['layerOrder']['status'],'not_checked')
                self.assertFalse(result['adoptable'])
                sources=result['sourceTiles']
                self.assertEqual([s['sourceIndex'] for s in sources],[0,1])
                self.assertEqual([s['tileType'] for s in sources],[tile_type]*2)
                self.assertEqual([s['centralTypes'] for s in sources],[['M']*4,['V']*4])
                self.assertEqual([s['inputAngles'] for s in sources],[SAVED_ANGLES]*2)
                self.assertEqual([s['effectiveAngles'] for s in sources],
                                 [[75.,85.,105.,95.]]*2)
                for source in sources:
                    for vertex in source['vertices']:
                        self.assertAlmostEqual(
                            math.dist(vertex,source['circumcenter']),
                            source['circumradius'],places=10)
                self.assertLess(math.dist(sources[0]['vertices'][1],
                                          sources[1]['vertices'][2]),1e-12)
                self.assertLess(math.dist(sources[0]['vertices'][2],
                                          sources[1]['vertices'][1]),1e-12)
                for source,assignment in zip(sources,('M','V')):
                    build=(unit_cyclic_centered_twist_alt_tile if alternate
                           else unit_cyclic_centered_twist_tile)
                    _,_,local=build(SAVED_ANGLES,1.2,2,.1,30. if alternate else 80.,
                                    [assignment]*4)
                    center=local['centralVertices']
                    if source['sourceIndex']==1:
                        first=sources[0]['vertices']
                        center=[[first[1][axis]+first[2][axis]-point[axis]
                                 for axis in (0,1)] for point in center]
                    for a,b in zip(center,center[1:]+center[:1]):
                        self.assertEqual(edge_assignment(fold,a,b),assignment)
                flat,closure=flat_face_embedding(fold)
                self.assertEqual(flat,result['foldedForm'])
                self.assertLess(closure,1e-8)
                for face in fold['faces_vertices']:
                    for a,b in itertools.combinations(face,2):
                        self.assertAlmostEqual(
                            math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                            math.dist(flat[a],flat[b]),places=7)

    def test_unsupported_inputs_rejected(self):
        for values in (([75,85,95],1.2,2),([75,85,95,105,0],1.2,2),
                       ([75,85,95,105],1.2,1),([75,85,95,105],math.nan,2),
                       ([0,85,95,105],1.2,2),([75,True,95,105],1.2,2)):
            with self.subTest(values=values),self.assertRaises(ValueError):
                unit_cyclic_quadrilateral_info(*values)
        with self.assertRaises(ValueError):
            unit_cyclic_centered_twist_tile(SAVED_ANGLES,1.2,2,.1,90.,['M']*4)
        with self.assertRaises(ValueError):
            unit_cyclic_centered_twist_alt_tile(SAVED_ANGLES,1.2,2,.9,30.,['M']*4)


if __name__=='__main__':
    unittest.main()
