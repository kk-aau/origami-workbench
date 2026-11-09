import math
import unittest
import numpy as np
from tessellate import generate,validate_request,check_geometry
from tessellation_brocard import cyclic_brocard_polygon
from tessellation_tile_twist import polygon_pleat_tile
from tessellation_unit_regular_centered import unit_regular_polygon_vertices
import test_tessellation as basic


class TileTwistTests(unittest.TestCase):
    def test_small_similarity_copies_keep_the_complete_crease_topology(self):
        from tessellation_flat_embedding import flat_face_embedding

        polygon=[[0.,0.],[1.,0.],[1.,1.],[0.,1.]]
        baseline,mother,details=polygon_pleat_tile(polygon,.2,tilt=70)
        baseline_flat,_=flat_face_embedding(baseline)
        for scale,origin in ((1e-3,[0.,0.]),(1e-6,[0.,0.]),
                             (1e-8,[0.,0.]),(1e-14,[0.,0.]),(1e-6,[.125,-.375])):
            with self.subTest(scale=scale,origin=origin):
                transformed=(np.asarray(polygon)*scale+origin).tolist()
                request={'family':'polygon-tile','variant':'centered',
                         'polygon':transformed,'width':.2,'tilt':70}
                self.assertEqual(validate_request(request)['polygon'],transformed)
                result=generate(request)
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                self.assertEqual(result['stats']['checks']['lff']['status'],'passed')
                fold=result['fold']
                for field in ('edges_vertices','edges_assignment','faces_vertices'):
                    self.assertEqual(fold[field],baseline[field])
                np.testing.assert_allclose((np.asarray(fold['vertices_coords'])-origin)/scale,
                                           baseline['vertices_coords'],atol=1e-9,rtol=0)
                np.testing.assert_allclose((np.asarray(result['source']['centralVertices'])-origin)/scale,
                                           details['centralVertices'],atol=1e-9,rtol=0)
                folded,closure=flat_face_embedding(fold)
                np.testing.assert_allclose((np.asarray(folded)-origin)/scale,
                                           baseline_flat,atol=1e-8,rtol=0)
                self.assertLess(closure/scale,1e-8)

    def test_scale_changes_do_not_make_invalid_geometry_adoptable(self):
        for scale in (1.,1e-6,1e-8):
            with self.subTest(scale=scale):
                cross={'vertices_coords':(np.asarray([[0,0],[1,1],[0,1],[1,0]])*scale).tolist(),
                       'edges_vertices':[[0,1],[2,3]]}
                self.assertEqual(check_geometry(cross)['crossingCount'],1)
                coincident={'vertices_coords':[[0.,0.],[0.,0.]],'edges_vertices':[[0,1]]}
                self.assertEqual(check_geometry(coincident)['zeroLengthEdges'],[0])
                invalid=(np.asarray([[0,0],[1,0],[.2,.2],[0,1]])*scale).tolist()
                with self.assertRaises(ValueError):polygon_pleat_tile(invalid,.2,tilt=70)
                almost_duplicate=(np.asarray([[0,0],[1e-8,0],[1,1],[0,1]])*scale).tolist()
                with self.assertRaises(ValueError):
                    validate_request({'family':'polygon-tile','polygon':almost_duplicate})

    def test_all_four_source_variants_are_scale_invariant(self):
        polygon=[[0.,0.],[1.,0.],[1.,1.],[0.,1.]]
        for variant,options in (('general',{'offset':.08,'tilt':70.,'ccw':True}),
                                ('centered',{'tilt':70.}),
                                ('centered-angle',{'twistAngle':35.}),
                                ('offset',{'offset':.08})):
            request={'family':'polygon-tile','variant':variant,'polygon':polygon,
                     'width':.2,'centralTypes':['M']*4,**options}
            baseline=generate(request)
            for scale in (1e-3,1e-6,1e-8):
                with self.subTest(variant=variant,scale=scale):
                    result=generate({**request,'polygon':(np.asarray(polygon)*scale).tolist()})
                    self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                    self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                    for field in ('edges_vertices','edges_assignment','faces_vertices'):
                        self.assertEqual(result['fold'][field],baseline['fold'][field])
                    np.testing.assert_allclose(np.asarray(result['fold']['vertices_coords'])/scale,
                                               baseline['fold']['vertices_coords'],atol=1e-9,rtol=0)

    def test_general_polygon_twist_accepts_high_sided_exact_input(self):
        from tessellation_flat_embedding import flat_face_embedding

        for sides in (13, 16, 24):
            with self.subTest(sides=sides):
                polygon = unit_regular_polygon_vertices(sides)
                request = {'family': 'polygon-tile', 'variant': 'centered',
                           'polygon': polygon, 'width': .2, 'tilt': 70,
                           'centralTypes': ['M']*sides}
                self.assertEqual(len(validate_request(request)['polygon']), sides)
                result = generate(request)
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
                self.assertEqual([result['stats'][key] for key in ('vertices', 'edges', 'faces')],
                                 [4*sides, 6*sides, 2*sides+1])
                _, closure = flat_face_embedding(result['fold'])
                self.assertLess(closure, 1e-8)
        polygon = [[math.cos(2*math.pi*i/25), math.sin(2*math.pi*i/25)]
                   for i in range(25)]
        request = {'family': 'polygon-tile', 'polygon': polygon,
                   'centralTypes': ['M']*25}
        with self.assertRaises(ValueError):
            validate_request(request)
        with self.assertRaises(ValueError):
            polygon_pleat_tile(polygon, .2, 0, 70, ['M']*25)

    def test_offset_border_distances_and_perpendicular_pleats_are_exact(self):
        for n,a,b,w,d in ((3,45,65,.15,.06),(4,70,110,.25,.08),(5,100,110,.5,.08),(6,120,120,.5,.08),(12,150,150,.25,.08)):
            for sign in (-1,1):
                for cw in (False,True):
                    with self.subTest(n=n,sign=sign,cw=cw):
                        params={'family':'brocard','kind':'cyclic-offset','sides':n,'angle1':a,'angle2':b,'width':w,'offset':d*sign,'clockwise':cw}
                        r=generate(params);basic.TessellationTests.assert_candidate(self,r)
                        info=r['source']['brocard'];p=np.array(info['vertices']);q=np.array(info['centralVertices']);coords=np.array(r['fold']['vertices_coords'])
                        for i in range(n):
                            e=p[(i+1)%n]-p[i]
                            border1=p[i]+e*((1-w)/2+d*sign);border2=p[i]+e*((1+w)/2+d*sign)
                            for border in (border1,border2):self.assertLess(float(np.linalg.norm(coords-border,axis=1).min()),1e-8)
                            self.assertLess(abs(float(np.dot(q[i]-border1,e))),1e-8)
                            self.assertLess(abs(float(np.dot(q[(i+1)%n]-border2,e))),1e-8)
                            self.assertAlmostEqual(math.dist(border1,border2)/math.hypot(*e),w,places=9)

    def test_centered_pleat_angle_is_measured_against_each_outer_edge(self):
        p=cyclic_brocard_polygon(6,120,120)['vertices']
        for angle in (80,100):
            f,m,info=polygon_pleat_tile(p,.4,tilt=angle)
            for i,a in enumerate(p):
                b=p[(i+1)%6];e=np.array(b)-a;foot=np.array(a)+.3*e;ray=np.array(info['centralVertices'][i])-foot
                actual=math.degrees(math.acos(float(np.dot(e,ray)/np.linalg.norm(e)/np.linalg.norm(ray))))
                self.assertAlmostEqual(actual,angle,places=8)

    def test_requested_center_assignment_is_preserved(self):
        for types in (['M']*4,['V']*4,['M','V','M','V']):
            r=generate({'family':'brocard','kind':'cyclic-offset','centralTypes':types})
            basic.TessellationTests.assert_candidate(self,r)
            ps=r['fold']['vertices_coords'];ids=[min(range(len(ps)),key=lambda j:math.dist(p,ps[j])) for p in r['source']['brocard']['centralVertices']]
            assignments={tuple(sorted(e)):a for e,a in zip(r['fold']['edges_vertices'],r['fold']['edges_assignment'])}
            self.assertEqual([assignments[tuple(sorted((a,ids[(i+1)%4])))] for i,a in enumerate(ids)],types)

    def test_invalid_offset_and_incompatible_parameters_are_rejected(self):
        for patch in ({'scale':.5},{'width':.8,'offset':.2},{'centralTypes':['M','M']},{'centralTypes':['M','V','B','M']},{'offset':float('nan')}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({'family':'brocard','kind':'cyclic-offset',**patch})
        with self.assertRaises(ValueError):generate({'family':'brocard','kind':'cyclic-offset','sides':3,'angle1':45,'angle2':65,'width':.25,'offset':.15})


if __name__=='__main__':unittest.main()
