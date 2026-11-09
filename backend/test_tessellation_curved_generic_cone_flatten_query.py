"""Saved cone: Darboux recovery, differential geometry and bounded JSON."""

import math
import unittest

from tessellation_curved_generic_cone_flatten_query import (
    first_fundamental_form, flat_base, query_generic_cone_flatten,
    source_base, source_normal, surface, validate_generic_cone_flatten_query)


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2],
            a[0]*b[1]-a[1]*b[0])


def diff(fn, u, h=1e-5):
    left, right = fn(u-h), fn(u+h)
    return tuple((r-l)/(2*h) for l, r in zip(left, right))


class GenericConeFlattenTests(unittest.TestCase):
    def test_source_darboux_recovery_matches_saved_initial_conditions(self):
        a, c = .5, math.sqrt(3)/2
        self.assertAlmostEqual(source_base(0)[0], c)
        self.assertAlmostEqual(source_base(0)[1], -a)
        self.assertEqual(flat_base(0), (1, 0))
        for u in (.2, .9, 2.5):
            bb = source_base(u)
            dd = tuple(-x for x in bb)
            bp = (0, a*math.sin(u), a*math.cos(u))
            t = tuple(x/a for x in bp)
            U = source_normal(u)
            L = cross(U, t)
            for got, expected in zip(cross(bp, dd), (a*x for x in U)):
                self.assertAlmostEqual(got, expected, places=13)
            for got, expected in zip(L, dd):
                self.assertAlmostEqual(got, expected, places=13)
            self.assertAlmostEqual(dot(t, dd), 0, places=13)
            self.assertAlmostEqual(dot(L, dd), 1, places=13)
            tp = (0, math.cos(u), -math.sin(u))
            self.assertAlmostEqual(dot(tp, L)/a, 1, places=13)
            planar_t=( -math.sin(a*u), math.cos(a*u))
            planar_l=(-math.cos(a*u),-math.sin(a*u))
            self.assertLess(math.dist(diff(flat_base, u),
                                      tuple(a*x for x in planar_t)), 1e-10)
            self.assertLess(math.dist(planar_l,
                                      tuple(-x for x in flat_base(u))),1e-14)

    def test_first_forms_regular_interior_and_singular_apex(self):
        for angle in (15, 30, 47, 60):
            a=math.sin(math.radians(angle))
            for u in (.1, .8, 2.6):
                for v in (-.9, -.2, .4, .99):
                    expected=first_fundamental_form(v, angle)
                    self.assertAlmostEqual(expected[0]*expected[2]-expected[1]**2,
                                           a*a*(1-v)**2, places=13)
                    for space in (False, True):
                        su=diff(lambda s: surface(s,v,angle_deg=angle,
                                                   space=space),u)
                        h=1e-5
                        minus=surface(u,v-h,angle_deg=angle,space=space)
                        plus=surface(u,v+h,angle_deg=angle,space=space)
                        sv=tuple((b-a)/(2*h) for a,b in zip(minus,plus))
                        metric=(dot(su,su),dot(su,sv),dot(sv,sv))
                        for got,want in zip(metric,expected):
                            self.assertAlmostEqual(got,want,places=9)
                        self.assertGreater(math.sqrt(dot(su,su)*dot(sv,sv)-
                                                     dot(su,sv)**2),0)
            for space in (False, True):
                self.assertTrue(all(abs(x)<1e-14 for x in surface(
                    .7,1,angle_deg=angle,space=space)))
            self.assertEqual(first_fundamental_form(1,angle)[0],0)

    def test_saved_pair_and_boundary_are_not_a_fold_graph(self):
        result=query_generic_cone_flatten({'family':'generic-cone-flatten-in3886'})
        self.assertEqual(result['source']['savedCell'],'In[3886]')
        self.assertFalse(result['source']['machineReadableWolframOut'])
        self.assertEqual(result['initial']['flatBase'],[1,0])
        self.assertEqual(result['initial']['flatTangent'],[0,1])
        sample=result['sample']
        self.assertEqual(len(sample['parameterValues']),65)
        self.assertEqual(len(sample['rulingValues']),9)
        self.assertEqual(sample['rulingValues'][0],-1)
        self.assertEqual(sample['rulingValues'][-1],1)
        self.assertEqual(sample['flatSamples'][0][0],[2,0])
        self.assertAlmostEqual(sample['flatBaseCurve'][-1][0],0,places=14)
        for point in sample['flatSamples'][-1]:
            self.assertAlmostEqual(point[0],0,places=13)
        self.assertEqual(sample['flatSamples'][0][-1],[0,0])
        self.assertEqual(sample['foldedSamples'][0][-1],[0,0,0])
        self.assertTrue(result['certification']['apexAtVOneSingular'])
        self.assertTrue(result['certification']['sampleIncludesApex'])
        self.assertFalse(result['certification']['sampledSurfaceExactFOLD'])
        self.assertFalse(result['certification']['adoptableCreasePattern'])
        self.assertNotIn('vertices_coords',result)

    def test_closed_query_rejects_non_saved_or_unbounded_inputs(self):
        valid={'family':'generic-cone-flatten-in3886'}
        for item in (None,[],{}, {**valid,'expression':'Cos[u]'},
                     {**valid,'angleDeg':True},{**valid,'angleDeg':14},
                     {**valid,'angleDeg':float('nan')},
                     {**valid,'curveSegments':15},
                     {**valid,'curveSegments':16.5},
                     {**valid,'rulingSegments':17},
                     {**valid,'rulingEnd':1.01},
                     {**valid,'rulingEnd':False}):
            with self.subTest(item=item),self.assertRaises(ValueError):
                validate_generic_cone_flatten_query(item)
        result=query_generic_cone_flatten({**valid,'rulingEnd':.8})
        self.assertFalse(result['certification']['sampleIncludesApex'])
        for u,v in ((-1,0),(math.pi+.01,0),(.4,-1.1),(.4,1.01)):
            with self.assertRaises(ValueError):
                surface(u,v)


if __name__=='__main__':
    unittest.main()
