"""Geometric regression for smooth vector-valued Origamica ring curves."""
import itertools
import math
import random
import unittest

from tessellate import check_geometry, check_local_conditions, generate, validate_request
from tessellation_ring_original import _check_nested_curves, circular_ring_pattern, ring_function_graphics_query
from tessellation_ring_vector_fourier import FourierCurve, validate_fourier_curve
from tessellation_ring_vector_ellipse import ellipse_first_ray_exit, ellipse_point


CURVE = {'offset': [0, 0], 'harmonics': [
    [[1, 0], [0, 1]], [[.04, .01], [0, .03]],
]}


class SmoothVectorRingTests(unittest.TestCase):
    def test_one_harmonic_reduces_to_existing_ellipse_without_phase_shift(self):
        matrix=[[1.1,.17],[.04,.9]]
        curve=FourierCurve({'harmonics':[matrix]})
        for index in range(36):
            phi=math.tau*index/36
            self.assertLess(math.dist(curve.point(1.3,phi),ellipse_point(matrix,1.3,phi)),1e-14)
            direction=[math.cos(phi),math.sin(phi)]
            first=curve.first_ray_exit(1.3,[.05,.02],direction)
            exact=ellipse_first_ray_exit(matrix,1.3,[.05,.02],direction)
            self.assertLess(math.dist(first,exact),1e-10)

    def test_nonellipse_curve_keeps_parameter_phase_and_has_certified_radial_bounds(self):
        curve = FourierCurve(CURVE)
        self.assertEqual(curve.point(1., 0.), [1.04, 0.])
        self.assertLess(math.dist(curve.point(1., 0.), curve.point(1., math.tau)), 1e-14)
        self.assertNotAlmostEqual(curve.point(1., .4)[0]**2+curve.point(1., .4)[1]**2,
                                  curve.point(1., .8)[0]**2+curve.point(1., .8)[1]**2)
        # A shifted/deformed vector point at a parameter angle is distinct
        # from the polar-radius point at the same geometric angle.
        shifted=FourierCurve({'offset':[.03,.02], 'harmonics':CURVE['harmonics']})
        point=shifted.point(1., .4)
        self.assertGreater(abs(math.atan2(point[1],point[0])-.4), .005)
        self.assertNotAlmostEqual(math.hypot(*point), shifted.radius_at_angle(1., .4), places=4)
        rng=random.Random(63)
        for _ in range(80):
            low=rng.uniform(-math.tau,math.tau)
            high=low+rng.uniform(.0001, .4)
            lower,upper=shifted.radius_bounds(1.7,low,high)
            for index in range(11):
                radius=shifted.radius_at_angle(1.7,low+(high-low)*index/10)
                self.assertLessEqual(lower-1e-10,radius)
                self.assertLessEqual(radius,upper+1e-10)
        # A rotated curve's angular interval crosses its parameter-period
        # seam. A split rounded one ulp downward must not lose the next arc.
        seam=FourierCurve({'offset':[-.008228395789330802,-.009454189594854449],
                           'harmonics':[
                               [[-.8940891423692483,-.44788905489799824],
                                [.44788905489799824,-.8940891423692483]],
                               [[.042237984471834966,.002443955790776456],
                                [-.05461990698236244,-.036379490686411345]],
                           ]})
        bounds=seam.radius_bounds(1.35,8.962878112946235,9.285522367360425)
        self.assertLessEqual(seam.radius_at_angle(1.35,9.285522367360425),bounds[1])

    def test_first_ray_exit_chooses_nearest_crossing_on_smooth_curve(self):
        curve=FourierCurve(CURVE)
        point=[.1,-.08]
        for index in range(24):
            angle=math.tau*index/24
            direction=[math.cos(angle),math.sin(angle)]
            result=curve.first_ray_exit(1.5,point,direction)
            length=math.dist(point,result)
            self.assertAlmostEqual(math.hypot(*result),curve.radius_at_angle(1.5,math.atan2(result[1],result[0])),places=9)
            self.assertLess(math.hypot(*(point[i]+(length-1e-5)*direction[i] for i in range(2))),
                            curve.radius_at_angle(1.5, math.atan2(point[1]+(length-1e-5)*direction[1],point[0]+(length-1e-5)*direction[0])))
            # Independent dense polyline is a separate numerical oracle.
            near=math.inf
            samples=4096
            previous=curve.point(1.5,0.)
            for j in range(1,samples+1):
                current=curve.point(1.5,math.tau*j/samples)
                segment=[current[0]-previous[0],current[1]-previous[1]]
                denom=direction[0]*segment[1]-direction[1]*segment[0]
                if abs(denom)>1e-12:
                    delta=[previous[0]-point[0],previous[1]-point[1]]
                    t=(delta[0]*segment[1]-delta[1]*segment[0])/denom
                    s=(delta[0]*direction[1]-delta[1]*direction[0])/denom
                    if t>0 and 0<=s<=1:near=min(near,t)
                previous=current
            self.assertLess(abs(length-near),5e-6)
        with self.assertRaisesRegex(ValueError,'起点不在'):
            curve.first_ray_exit(1.,[2,0],[-1,0])

    def test_concave_fourth_harmonic_returns_first_of_three_ray_intersections(self):
        # This still has a certified strictly increasing polar angle. A ray
        # from an interior point nevertheless crosses the concave outline
        # three times; picking any arbitrary root changes the CP topology.
        curve=FourierCurve({'harmonics':[
            [[1,0],[0,1]], [[0,0],[0,0]], [[0,0],[0,0]], [[.16,0],[0,.16]],
        ]})
        point=[.614427512233704,-.5408449869497352]
        direction=[-.900682264216513,-.9042383200818446]
        result=curve.first_ray_exit(1.,point,direction)
        parameter=math.dist(point,result)/math.hypot(*direction)
        self.assertAlmostEqual(parameter,.19862215240486636,places=10)
        self.assertLess(parameter,.2817182022807324)

    def test_invalid_winding_or_oversized_harmonics_are_rejected(self):
        for bad in (
            {'offset':[0,0], 'harmonics':[[[1,0],[0,-1]]]},
            {'offset':[.5,.5], 'harmonics':[[[1,0],[0,1]],[[.4,0],[0,.4]]]},
            {'offset':[0,0], 'harmonics':[[[1,0],[0,1]],[[1,0],[0,1]]]},
            {'offset':[0,0], 'harmonics':[[[1,0],[0,1]]]*5},
        ):
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                validate_fourier_curve(bad)

    def test_changed_smooth_profiles_propagate_to_valid_cp_and_flat_faces(self):
        outer=[
            {'offset':[.01,0], 'harmonics':[[[1,0],[0,1]],[[.04,.01],[0,.03]]]},
            {'offset':[0,.01], 'harmonics':[[[1,0],[0,1]],[[.03,.01],[0,.04]]]},
            {'offset':[0,0], 'harmonics':[[[1,0],[0,1]],[[.02,.01],[0,.05]]]},
        ]
        middle=[
            {'offset':[.005,.003], 'harmonics':[[[1,0],[0,1]],[[.035,.01],[0,.035]]]},
            {'offset':[0,.005], 'harmonics':[[[1,0],[0,1]],[[.025,.01],[0,.045]]]},
        ]
        params=dict(family='ring',ringMode='origamica',sides=8,rings=2,
                    outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15],
                    offsetAngle=13,angle=36,outerFourierCurves=outer,creaseFourierCurves=middle)
        result=generate(params)
        fold,flat=result['fold'],result['source']['foldedForm']
        self.assertEqual(result['source']['curveFamily'],'vector-fourier')
        self.assertEqual((len(fold['vertices_coords']),len(fold['edges_vertices']),len(fold['faces_vertices'])),(72,136,65))
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertEqual(check_local_conditions(fold)['status'],'passed')
        self.assertLess(result['source']['closureError'],1e-10)
        self.assertLess(math.dist(fold['vertices_coords'][0],FourierCurve(outer[0]).point(1.,math.radians(13))),1e-11)
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=8)
        with self.assertRaises(ValueError):
            validate_request({**params,'outerLinearMaps':[[[1,0],[0,1]]]*3,
                              'creaseLinearMaps':[[[1,0],[0,1]]]*2})

    def test_strict_nesting_rejects_continuous_curve_overlap(self):
        curve=FourierCurve(CURVE)
        with self.assertRaisesRegex(ValueError,'嵌套'):
            _check_nested_curves((1.,curve),(1.000001,curve))
        enlarged=FourierCurve({'offset':[0,0], 'harmonics':[[[1.18,0],[0,1]],[[.04,.01],[0,.03]]]})
        with self.assertRaisesRegex(ValueError,'嵌套'):
            _check_nested_curves((1.,enlarged),(1.1,curve))

    def test_input_curve_preview_keeps_true_fourier_parameter_phase(self):
        curve={'offset':[.01,.005],'harmonics':[[[1.04,.06],[.015,.96]],[[.04,.01],[0,.03]]]}
        params=dict(family='ring',ringMode='origamica',sides=8,rings=1,
                    outerRadii=[1,1.8],creaseRadii=[1.35],angle=36,offsetAngle=13,
                    outerFourierCurves=[curve,curve],creaseFourierCurves=[curve])
        preview=ring_function_graphics_query(params)
        self.assertEqual(preview['outerCurves'][0][0],[1.09,.02])
        self.assertLess(math.dist(preview['outerCurves'][0][25],FourierCurve(curve).point(1.,math.pi/2)),1e-13)
        self.assertEqual(len(preview['outerCurves'][0]),101)
        self.assertFalse(preview['creasePattern'])


if __name__=='__main__':
    unittest.main()
