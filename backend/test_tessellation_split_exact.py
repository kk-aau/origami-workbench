import math
import unittest
import numpy as np
from tessellate import generate,validate_request
from tessellation_split_exact import exact_split,centered_tilt,unit_quadrilateral_vertices,DEFAULT_POLYGON
import test_tessellation as basic


class ExactSplitTests(unittest.TestCase):
    def test_matches_coordinates_and_assignments_saved_in_original_notebook(self):
        # User-supplied Origamica 15.0.nb, In[2937], lines 217875–218105.
        # These are saved example measurements, not a reimplementation of its code.
        # The notebook was NOT executed in this test.
        r=generate({'family':'split','variant':'general','polygon':DEFAULT_POLYGON,'width':.15,'offset':0,'tilt':70,'ccw':True,'baseVertex':1,'connection':'M','centralTypes':['M','M','V','V']})
        basic.TessellationTests.assert_candidate(self,r)
        expected=[[.8266771271306932,.6914772237847899],[.5377494199370402,1.0373391045553066],[.3264428058213553,.6551380809327898],[.5446589793151859,.3287603437034611],[.12553846967075538,.5382351155027026]]
        np.testing.assert_allclose(r['source']['centralVertices'],expected,rtol=0,atol=1e-12)
        f=r['fold'];coords=np.array(f['vertices_coords'])
        ids=[int(np.argmin(np.linalg.norm(coords-p,axis=1))) for p in expected]
        edges={tuple(sorted(e)):a for e,a in zip(f['edges_vertices'],f['edges_assignment'])}
        for a,b,assignment in ((0,1,'M'),(1,2,'V'),(2,4,'M'),(4,3,'V'),(3,0,'M'),(0,2,'M'),(0,4,'V')):
            self.assertEqual(edges[tuple(sorted((ids[a],ids[b])))],assignment)
        self.assertEqual(len(coords),17);self.assertEqual(len(edges),27)
        self.assertEqual(r['source']['splitDiagonalTypes'],['M','V'])
        self.assertEqual(r['source']['splitAssignmentMethod'],'directed-twist-angle-v1')
        np.testing.assert_allclose(r['source']['splitTwistAnglesDeg'],
                                   [17.86563413773857,26.03951895000024],rtol=0,atol=1e-10)
        # Original PolygonTwistTile In[2872] fixes both rays of each
        # pleat from the corresponding central edge and ccw; the split
        # keeps those choices instead of finding an alternative assignment.
        polygon=np.array(r['mother']['vertices_coords'])
        boundary_edges=np.roll(polygon,-1,axis=0)-polygon
        for i,kind in enumerate(['M','V','V','M']):
            for center,fraction,assignment in (
                    (4 if i==2 else i,.425,kind),
                    ((i+1)%4,.575,'V' if kind=='M' else 'M')):
                point=polygon[i]+fraction*boundary_edges[i]
                endpoint=int(np.argmin(np.linalg.norm(coords-point,axis=1)))
                self.assertEqual(edges[tuple(sorted((ids[center],endpoint)))],assignment)

    def test_locally_solvable_alternative_must_not_override_source_diagonals(self):
        # At the preserved vertex these twist angles straddle 90 degrees.
        # A free-diagonal local solve used to return V/M, although the
        # directed-angle construction requires M/M. That original choice
        # is incompatible with these centralTypes, so reject the input.
        with self.assertRaisesRegex(ValueError,'局部山谷赋型无解'):
            exact_split([[0,0],[1,0],[1.39,.72],[.08,.89]],
                        .29,-.06,80.5,3,'V',['M','V','V','M'],False)

    def test_every_variant_and_edge_pleat_contract(self):
        for variant in ('general','centered','centered-angle','offset'):
            with self.subTest(variant=variant):
                r=generate({'family':'split','variant':variant});basic.TessellationTests.assert_candidate(self,r)
                p=np.array(r['mother']['vertices_coords']);q=np.array(r['source']['centralVertices']);tau=r['source']['pleatAngle'];width=r['source']['width'];offset=r['source']['offset']
                for i in range(4):
                    e=p[(i+1)%4]-p[i]
                    for point,t in ((q[4 if i==2 else i],(1-width)/2+offset),(q[(i+1)%4],(1+width)/2+offset)):
                        ray=point-(p[i]+t*e)
                        angle=math.degrees(math.atan2(e[0]*ray[1]-e[1]*ray[0],float(np.dot(e,ray))))%180
                        self.assertAlmostEqual(angle,tau,places=7)

    def test_centered_angle_conversion_and_cyclic_no_split_case(self):
        for width in (.1,.3,.6):
            for alpha in (10,45,90,135,170):
                tilt=math.radians(centered_tilt(width,alpha))
                actual=math.degrees(math.atan2(width*math.sin(tilt),math.cos(tilt)))
                self.assertAlmostEqual(actual,alpha,places=9)
        fold,mother,source=exact_split([[0,0],[1,0],[1,1],[0,1]],.5,.08,90)
        self.assertFalse(source['split'])
        self.assertEqual(len(fold['vertices_coords']),16)

    def test_no_split_fallback_must_preserve_the_requested_pleat_direction(self):
        square=[[0,0],[1,0],[1,1],[0,1]]
        for tilt,ccw in ((70,True),(110,False)):
            with self.subTest(tilt=tilt,ccw=ccw):
                _,_,source=exact_split(square,.3,0,tilt,ccw=ccw)
                self.assertFalse(source['split'])
                self.assertEqual(source['splitAssignmentMethod'],'source-fixed-polygon-pleats-v1')
                with self.assertRaisesRegex(ValueError,'局部山谷赋型无解'):
                    exact_split(square,.3,0,tilt,ccw=not ccw)

    def test_original_unit_quadrilateral_offset_split_matches_explicit_polygon(self):
        # User notebook In[444] and In[3071]: side 1 is fixed at 1, the
        # first three angles determine directions, and side is edge 2/3/4.
        angles=[70,85,95]
        polygon=unit_quadrilateral_vertices(angles,1,2)
        np.testing.assert_allclose(polygon,[[0,0],[1,0],[.912844257252342,.9961946980917455],[.3625852176392016,.9961946980917457]],rtol=0,atol=1e-12)
        lengths=np.linalg.norm(np.roll(np.array(polygon),-1,axis=0)-polygon,axis=1)
        for index in (2,3,4):
            np.testing.assert_allclose(unit_quadrilateral_vertices(angles,float(lengths[index-1]),index),polygon,rtol=0,atol=1e-12)
        np.testing.assert_allclose(unit_quadrilateral_vertices([*angles,0],1,2),polygon,rtol=0,atol=1e-12)
        unit=generate({'family':'split','variant':'unit-offset'})
        explicit=generate({'family':'split','variant':'offset','polygon':polygon,'width':.15,'offset':.09,'baseVertex':1,'connection':'M','centralTypes':['M','V','V','M']})
        basic.TessellationTests.assert_candidate(self,unit)
        self.assertEqual(unit['fold'],explicit['fold'])
        self.assertEqual(unit['mother'],explicit['mother'])
        for index in (3,4):
            alternate=generate({'family':'split','variant':'unit-offset','angles':angles,'side':float(lengths[index-1]),'sideIndex':index,'width':.15,'offset':.09,'baseVertex':1,'connection':'M','centralTypes':['M','V','V','M']})
            self.assertEqual(alternate['fold'],unit['fold'])
        self.assertTrue(unit['source']['split'])
        self.assertEqual(unit['source']['unitQuadrilateral'],{'angles':angles,'side':1.,'sideIndex':2})

    def test_unit_quadrilateral_rejects_invalid_inputs_before_construction(self):
        for patch in ({'angles':[10,10,10]},{'angles':[70,85]},{'angles':[70,85,95,float('nan')]},
                      {'side':0},{'sideIndex':1},{'sideIndex':3.5},{'polygon':DEFAULT_POLYGON},{'tilt':90}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({'family':'split','variant':'unit-offset',**patch})

    def test_invalid_base_assignment_and_incompatible_fields_reject(self):
        for patch in ({'baseVertex':4},{'centralTypes':['M','M']},{'tilt':0},{'variant':'centered','offset':.1},{'variant':'offset','tilt':70},{'width':.8,'variant':'offset','offset':.2}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({'family':'split',**patch})
        with self.assertRaises(ValueError):generate({'family':'split','baseVertex':0})


if __name__=='__main__':unittest.main()
