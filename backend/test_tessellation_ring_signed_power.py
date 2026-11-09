"""Origamica In[2677]/In[2681] vector-valued superellipse functions."""
import itertools
import math
import unittest

from tessellate import check_geometry, check_local_conditions, generate, validate_request
from tessellation_ring_original import (
    _polar_ray, circular_ring_pattern, ring_function_graphics_query,
    squaring_circle_radius_expressions,
)
from tessellation_ring_signed_power import SignedPowerSuperellipse


class SignedPowerOrigamicaTests(unittest.TestCase):
    def test_exact_notebook_f_definition_at_parameter_angles(self):
        for index in range(4):
            curve=SignedPowerSuperellipse(index+1)
            radius=.75+index
            for phi in (0,math.pi/6,math.pi/4,math.pi/2,2*math.pi/3,math.pi,3*math.pi/2):
                point=curve.point(radius,phi)
                quadrant=round(phi/(math.pi/2))
                if abs(phi-quadrant*(math.pi/2))<1e-15:
                    components=((1.,0.),(0.,1.),(-1.,0.),(0.,-1.))[quadrant%4]
                else:
                    components=(math.cos(phi),math.sin(phi))
                expected=[radius*math.copysign(abs(value)**(1/(index+1)),value)
                          for value in components]
                self.assertLess(math.dist(point,expected),1e-14)
                if phi==math.pi/2:
                    self.assertEqual(point[0],0.)
                    self.assertAlmostEqual(point[1],radius)
                if phi==math.pi/4:
                    self.assertAlmostEqual(point[0],radius*2**(-1/(2*(index+1))),places=13)
                    self.assertAlmostEqual(point[1],point[0],places=13)

    def test_original_circle_ray_example_and_superellipse_bounds(self):
        # In[2675] uses rfn(phi)=2{Cos phi,Sin phi}, p={1,0}, d={1,1}.
        point=_polar_ray((2.,None),[1.,0.],[1.,1.])
        t=(math.sqrt(7)-1)/2
        self.assertAlmostEqual(point[0],1+t,places=13)
        self.assertAlmostEqual(point[1],t,places=13)
        curve=SignedPowerSuperellipse(4)
        for lo,hi in [(-1.,.8),(.6,1.4),(2.8,4.1),(5.8,6.7)]:
            lower,upper=curve.radial_bounds(2.,lo,hi)
            for index in range(100):
                value=curve.radial_radius(2.,lo+(hi-lo)*index/99)
                self.assertLessEqual(lower,value)
                self.assertLessEqual(value,upper)

    def test_original_saved_example_matches_old_polar_locus_pointwise(self):
        p=[.75,1.75,2.75,3.75]
        r=[1.,2.,3.]
        direct,flat,closure=circular_ring_pattern(20,p,r,45,6,
            outer_signed_powers=[1,2,3,4],crease_signed_powers=[1,2,3])
        expressions=squaring_circle_radius_expressions(3)
        older,older_flat,_=circular_ring_pattern(20,p,r,45,6,
            outer_expressions=expressions[0],crease_expressions=expressions[1])
        self.assertEqual((len(direct['vertices_coords']),len(direct['edges_vertices']),len(direct['faces_vertices'])),
                         (260,500,241))
        self.assertEqual(direct['edges_vertices'],older['edges_vertices'])
        self.assertEqual(direct['edges_assignment'],older['edges_assignment'])
        self.assertLess(max(math.dist(a,b) for a,b in zip(direct['vertices_coords'],older['vertices_coords'])),1e-10)
        self.assertLess(max(math.dist(a,b) for a,b in zip(flat,older_flat)),1e-10)
        self.assertLess(closure,1e-10)
        self.assertEqual(check_geometry(direct)['status'],'passed')
        self.assertEqual(check_local_conditions(direct)['status'],'passed')
        for face in direct['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(direct['vertices_coords'][a],direct['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=8)

    def test_saved_example_request_roundtrip_and_invalid_power_rejection(self):
        params=dict(family='ring',ringMode='origamica',sides=20,rings=3,
                    outerRadii=[.75,1.75,2.75,3.75],creaseRadii=[1,2,3],
                    angle=45,offsetAngle=6,
                    outerSignedPowers=[1,2,3,4],creaseSignedPowers=[1,2,3])
        validated=validate_request(params)
        self.assertEqual(validated['outerSignedPowers'],[1,2,3,4])
        result=generate(params)
        self.assertEqual(result['source']['curveFamily'],'signed-power-superellipse')
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        for powers in ([0,2,3,4],[1,2,3,9],[1,2,3], [1,2,3,2.5]):
            with self.subTest(powers=powers),self.assertRaises(ValueError):
                validate_request({**params,'outerSignedPowers':powers})
        with self.assertRaisesRegex(ValueError,'不能同时'):
            validate_request({**params,'outerExpressions':['r']*4,'creaseExpressions':['r']*3})

    def test_original_ring_function_graphics_samples_input_curves_not_cp(self):
        params=dict(family='ring',ringMode='origamica',sides=20,rings=3,
                    outerRadii=[.75,1.75,2.75,3.75],creaseRadii=[1,2,3],
                    angle=45,offsetAngle=6,
                    outerSignedPowers=[1,2,3,4],creaseSignedPowers=[1,2,3])
        graphics=ring_function_graphics_query(params)
        self.assertEqual(graphics['sourceFunction'],'RingFunctionGraphics')
        self.assertEqual((len(graphics['outerCurves']),len(graphics['creaseCurves'])),(4,3))
        self.assertTrue(all(len(line)==101 for line in graphics['outerCurves']+graphics['creaseCurves']))
        self.assertAlmostEqual(graphics['stepRadians'],.02*math.pi)
        self.assertEqual(graphics['outerCurves'][0][0],[.75,0.])
        self.assertEqual(graphics['outerCurves'][3][25],[0.,3.75])
        self.assertEqual(graphics['creaseCurves'][2][50],[-3.,0.])
        self.assertFalse(graphics['creasePattern'])
        self.assertFalse(graphics['flatFoldedForm'])
        # The original preview only depends on pfn/rfn and n, not on the CP
        # sector count, twist angle, or initial p-point phase.
        variant=ring_function_graphics_query({**params,'sides':8,'angle':25,'offsetAngle':18})
        self.assertEqual(variant['outerCurves'],graphics['outerCurves'])
        self.assertEqual(variant['creaseCurves'],graphics['creaseCurves'])
        with self.assertRaises(ValueError):
            ring_function_graphics_query({**params,'ringMode':'mesh','sides':8})


if __name__=='__main__':
    unittest.main()
