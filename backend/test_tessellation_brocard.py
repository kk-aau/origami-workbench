import math
import unittest
import numpy as np
from tessellation_brocard import brocard_polygon, cyclic_brocard_polygon, brocard_triangle
from tessellate import generate,validate_request
import test_tessellation as basic


class BrocardGeometryTests(unittest.TestCase):
    def assert_brocard(self, info, cyclic=False):
        points=np.array(info['vertices']);center=np.array(info['center']);n=len(points)
        for i,p in enumerate(points):
            incoming,outgoing=points[(i-1)%n]-p,points[(i+1)%n]-p
            theta=math.degrees(math.acos(float(np.clip(np.dot(incoming,outgoing)/np.linalg.norm(incoming)/np.linalg.norm(outgoing),-1,1))))
            self.assertAlmostEqual(theta,info['angles'][i],places=6)
            edge=incoming if info['clockwise'] else outgoing
            omega=math.degrees(math.acos(float(np.clip(np.dot(edge,center-p)/np.linalg.norm(edge)/np.linalg.norm(center-p),-1,1))))
            self.assertAlmostEqual(omega,info['omega'],places=6)
        if cyclic:
            radii=np.linalg.norm(points-np.array(info['circumcenter']),axis=1)
            self.assertLess(float(np.ptp(radii)),1e-7)

    def test_equal_rays_close_for_general_polygons_both_directions(self):
        for angles in ([40,65,0],[60,120,120,0],[65,120,100,0],[100,110,120,95,0],[150]*12):
            for clockwise in (False,True):
                with self.subTest(angles=angles,clockwise=clockwise):
                    info=brocard_polygon(list(angles),clockwise)
                    self.assert_brocard(info)
                    self.assertAlmostEqual(math.dist(*info['vertices'][:2]),1,places=10)
                    self.assertAlmostEqual(sum(info['angles']),(len(angles)-2)*180,places=10)

    def test_triangle_angle_agrees_with_independent_cotangent_identity(self):
        for angles in ([40,65,75],[90,60,30],[60,60,60]):
            info=brocard_polygon(angles)
            omega=math.atan(1/sum(1/math.tan(math.radians(a)) for a in angles))
            self.assertAlmostEqual(info['omega'],math.degrees(omega),places=10)
        for vertices in ([[[0,0],[3,0],[1,2]]],):
            for triangle in vertices:
                for clockwise in (False,True):
                    info=brocard_triangle(triangle,clockwise)
                    self.assertEqual(info['vertices'],triangle)
                    self.assert_brocard(info)

    def test_cyclic_brocard_preserves_two_specified_corners_and_circle(self):
        for args in ((3,45,65,0,1),(4,70,110,0,1),(5,100,110,0,1),(6,120,120,1,4),(8,135,135,2,5)):
            for clockwise in (False,True):
                with self.subTest(args=args,clockwise=clockwise):
                    info=cyclic_brocard_polygon(*args,clockwise=clockwise)
                    self.assert_brocard(info,cyclic=True)
                    self.assertAlmostEqual(info['angles'][args[3]],args[1],places=6)
                    self.assertAlmostEqual(info['angles'][args[4]],args[2],places=6)

    def test_invalid_angles_indices_and_degenerate_triangles_reject(self):
        for angles in ([0,60,0],[179,179,0],[60,float('nan'),0],[True,60,0],[60,60]):
            with self.assertRaises(ValueError):brocard_polygon(angles)
        for args in ((4,70,100,0,0),(4,70,100,-1,2),(3,150,100,0,1)):
            with self.assertRaises(ValueError):cyclic_brocard_polygon(*args)
        with self.assertRaises(ValueError):brocard_triangle([[0,0],[1,1],[2,2]])

    def test_public_variants_close_the_back_at_the_computed_point(self):
        cases=[{'kind':'triangle'}, {'kind':'trapezoid'}, {'kind':'parallelogram'},
               {'kind':'angles','angles':[65,120,100,0]},
               {'kind':'cyclic','sides':5,'angle1':100,'angle2':110},
               {'kind':'triangle-vertices','vertices':[[0,0],[3,0],[1,2]]},
               {'kind':'triangle-vertices','vertices':[[0,0],[1,2],[3,0]]}]
        for case in cases:
            for cw in (False,True):
                for scale in (.2,.5,.85):
                    with self.subTest(case=case,cw=cw,scale=scale):
                        result=generate({'family':'brocard',**case,'clockwise':cw,'scale':scale})
                        basic.TessellationTests.assert_candidate(self,result)
                        self.assertEqual(result['stats']['parameters'],validate_request(result['stats']['parameters']))
                        fold=result['fold'];ps=np.array(fold['vertices_coords'])
                        info=result['source']['brocard'];inner=np.array(info['vertices']);center=np.array(info['center'])
                        if sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(inner,np.roll(inner,-1,axis=0)))<0:
                            inner=inner[[0,*range(len(inner)-1,0,-1)]]
                        for i,p in enumerate(inner):
                            vertex=int(np.argmin(np.linalg.norm(ps-p,axis=1)))
                            self.assertLess(math.dist(ps[vertex],p),1e-8)
                            valley=[ps[b if a==vertex else a]-p for (a,b),assignment in zip(fold['edges_vertices'],fold['edges_assignment']) if assignment=='V' and vertex in (a,b)]
                            self.assertEqual(len(valley),1)
                            edge=inner[(i-1 if cw else i+1)%len(inner)]-p;edge/=np.linalg.norm(edge)
                            reflected=2*np.dot(valley[0],edge)*edge-valley[0]
                            ray=center-p
                            self.assertLess(abs(reflected[0]*ray[1]-reflected[1]*ray[0]),1e-8)
                            self.assertGreater(float(np.dot(reflected,ray)),0)

    def test_public_parameters_reject_cross_kind_and_invalid_inputs(self):
        for patch in ({'kind':'invalid'},{'clockwise':1},{'scale':.99},{'kind':'triangle','angle1':170,'angle2':50},
                      {'kind':'trapezoid','angle1':40},{'kind':'angles','angles':[179,179,0]},
                      {'kind':'cyclic','index1':1,'index2':1},{'vertices':[[0,0],[1,0],[0,1]]}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({'family':'brocard',**patch})


if __name__=='__main__':unittest.main()
