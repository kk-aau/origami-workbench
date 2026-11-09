import copy
import json
import math
import re
import unittest
from unittest.mock import patch

import mpmath as mp
import numpy as np

from tessellation_curved_matched_pair_query import (
    MatchedPairError, MatchedKernel, NONCIRCULAR_PRESET, PRESET,
    query_curved_matched_pair, validate_curved_matched_pair_query,
)


def tiny_query(source,amount):
    q=copy.deepcopy(source)
    for key in ('flatCurve','spaceCurve'):
        q[key]=[f'1000000000+{amount}*({expression})' for expression in q[key]]
    q['transverseStart']*=amount;q['transverseEnd']*=amount
    return q


class MatchedPairQueryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.circle=query_curved_matched_pair({**PRESET,'segments':8,'rulingSegments':4})
        cls.noncircle=query_curved_matched_pair({**NONCIRCULAR_PRESET,'segments':8,'rulingSegments':4})

    def test_original_circle_all_four_source_branches_have_real_geometry_and_jets(self):
        for psi in (-1,1):
            for sigma in (-1,1):
                r=query_curved_matched_pair({**PRESET,'psi':psi,'sigma':sigma,'segments':8,'rulingSegments':4})
                self.assertTrue(r['certification']['analyticLocalIsometry'])
                self.assertTrue(r['certification']['fullIntervalRegularityCertified'])
                for row in r['sample']['rows']:
                    s=row['s'];t=np.array([-math.sin(s/2),math.cos(s/2)])
                    self.assertTrue(np.allclose(row['c'],[2*math.cos(s/2),2*math.sin(s/2)],atol=1e-13))
                    self.assertTrue(np.allclose(row['d'],sigma*np.array([-math.cos(s/2),-math.sin(s/2)]),atol=1e-13))
                    self.assertTrue(np.allclose(row['dPrime'],-sigma*.5*t,atol=1e-13))
                    self.assertTrue(np.allclose(row['dd'],[-sigma*.5*math.cos(s),-sigma*.5*math.sin(s),-sigma*psi*math.sqrt(3)/2],atol=1e-13))
                self.assertFalse(r['certification']['adoptableCreasePattern'])

    def test_noncircular_whole_original_domain_matches_independent_direct_u_derivative(self):
        r=self.noncircle;domain=r['diagnostics']['parameterDomain']
        self.assertTrue(domain['certified']);self.assertGreater(domain['minimumJacobianLowerBound'],.39)
        self.assertEqual(r['query']['parameterEnd'],math.pi)
        self.assertEqual(r['query']['transverseStart'],-1)
        self.assertTrue(r['certification']['analyticSpeedEquality'])
        mp.mp.dps=45
        def flat(s):return (2-4*mp.log(1+s*s/16),8*mp.atan(s/4)-s)
        def space(s):
            a=4*s/mp.sqrt(5)
            return (.5+.5*mp.cos(a),mp.sin(a)/mp.sqrt(5)+s/5,1-mp.sin(a)/(2*mp.sqrt(5))+2*s/5)
        def derivative(fn,s,n=1):return tuple(mp.diff(lambda x:fn(x)[i],s,n) for i in range(len(fn(s))))
        def dot(a,b):return sum(x*y for x,y in zip(a,b))
        def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
        def normal(a):
            norm=mp.sqrt(dot(a,a));return tuple(x/norm for x in a)
        def frame(s):
            T=normal(derivative(space,s));acc=derivative(space,s,2)
            N=normal(tuple(acc[i]-dot(acc,T)*T[i] for i in range(3)))
            return T,N,cross(T,N)
        def U(s):
            _,N,B=frame(s);C=5/(16+s*s);S=mp.sqrt(1-C*C)
            return tuple(S*N[i]+C*B[i] for i in range(3))
        for row in r['sample']['rows'][::2]:
            s=mp.mpf(str(row['s']));T,N,B=frame(s);up=derivative(U,s)
            C=5/(16+s*s);S=mp.sqrt(1-C*C);L=tuple(C*N[i]-S*B[i] for i in range(3))
            A=dot(up,T);Q=dot(up,L);H=mp.sqrt(dot(up,up))
            p=-mp.sign(A)*Q/H;rr=abs(A)/H;t=normal(derivative(flat,s));l=(-t[1],t[0])
            d=np.array([float(p*t[i]+rr*l[i]) for i in range(2)])
            dd=np.array([float(p*T[i]+rr*L[i]) for i in range(3)])
            self.assertLess(max(np.linalg.norm(d-row['d']),np.linalg.norm(dd-row['dd'])),2e-13)
            for w in (-1,-.37,.43,1):
                xs=np.array(row['cPrime'])+w*np.array(row['dPrime'])
                ys=np.array(row['ccPrime'])+w*np.array(row['ddPrime'])
                self.assertLess(max(abs(xs@xs-ys@ys),abs(xs@d-ys@dd),abs(d@d-dd@dd)),1e-12)

    def test_explicit_nonlinear_common_parameter_and_nonzero_start_preserve_speed(self):
        q=copy.deepcopy(PRESET);replacement='(s+0.02*sin(s))'
        for key in ('flatCurve','spaceCurve'):q[key]=[re.sub(r'\bs\b',replacement,f) for f in q[key]]
        q.update(parameterStart=.1,parameterEnd=1.8,segments=8,rulingSegments=4)
        r=query_curved_matched_pair(q)
        self.assertTrue(r['certification']['analyticSpeedEquality'])
        self.assertTrue(r['certification']['fullIntervalRegularityCertified'])
        for row in r['sample']['rows']:
            s=row['s'];a=s+.02*math.sin(s);ap=1+.02*math.cos(s)
            self.assertLess(np.linalg.norm(np.array(row['c'])-[2*math.cos(a/2),2*math.sin(a/2)]),2e-13)
            self.assertLess(np.linalg.norm(np.array(row['cPrime'])-ap*np.array([-math.sin(a/2),math.cos(a/2)])),2e-13)
        self.assertEqual(r['query'],validate_curved_matched_pair_query(q))

    def test_speed_evidence_is_numerical_for_real_small_mismatch_not_analytic(self):
        q={**PRESET,'spaceCurve':['1.00000000001*cos(s)','1.00000000001*sin(s)','1'],'segments':8,'rulingSegments':4}
        r=query_curved_matched_pair(q)
        self.assertEqual(r['diagnostics']['speedEquality']['status'],'numerical')
        self.assertFalse(r['certification']['analyticSpeedEquality'])
        self.assertFalse(r['certification']['analyticLocalIsometry'])
        self.assertTrue(r['certification']['numericalIsometryToleranceCertified'])

    def test_negative_flat_curvature_and_reversed_common_parameter_are_supported(self):
        # Reflection changes signed planar curvature; reversal changes both
        # tangent directions without imposing a positive native-q convention.
        for reflected,reversed_parameter in ((True,False),(False,True),(True,True)):
            q=copy.deepcopy(PRESET)
            q.update(parameterStart=.1,parameterEnd=1.8,segments=8,rulingSegments=4)
            if reflected:q['flatCurve'][1]='-('+q['flatCurve'][1]+')'
            if reversed_parameter:
                for key in ('flatCurve','spaceCurve'):
                    q[key]=[re.sub(r'\bs\b','(-s-0.02*sin(s))',f) for f in q[key]]
            r=query_curved_matched_pair(q)
            self.assertTrue(r['certification']['analyticLocalIsometry'])
            kernel=MatchedKernel(r['query'])
            for row in r['sample']['rows']:
                s=row['s'];a=-s-.02*math.sin(s) if reversed_parameter else s
                ap=-1-.02*math.cos(s) if reversed_parameter else 1
                expected=[2*math.cos(a/2),(-1 if reflected else 1)*2*math.sin(a/2)]
                prime=ap*np.array([-math.sin(a/2),(-1 if reflected else 1)*math.cos(a/2)])
                self.assertLess(np.linalg.norm(np.array(row['c'])-expected),2e-13)
                self.assertLess(np.linalg.norm(np.array(row['cPrime'])-prime),2e-13)
                expected_sign=(-1 if reflected else 1)*(-1 if reversed_parameter else 1)
                self.assertAlmostEqual(kernel.finite_point(s)['kl'].value,.5*kernel.world_scale*expected_sign,places=12)
            self.assertLess(r['diagnostics']['maximumMetricDifference'],1e-12)

    def test_interval_budget_unknown_keeps_actual_full_readonly_patch(self):
        with patch('tessellation_curved_matched_pair_query.CERTIFICATION_BUDGET',1):
            r=query_curved_matched_pair({**NONCIRCULAR_PRESET,'segments':8,'rulingSegments':4})
        self.assertFalse(r['certification']['fullIntervalRegularityCertified'])
        self.assertIsNone(r['diagnostics']['parameterDomain']['minimumJacobianLowerBound'])
        self.assertEqual(len(r['sample']['rows']),9)
        self.assertEqual(r['sample']['rows'][-1]['s'],math.pi)
        self.assertEqual(len(r['sample']['grid']),9)
        self.assertEqual(r['sample']['grid'][-1][-1]['w'],1)
        self.assertFalse(r['certification']['planarPaperInjectivityCertified'])
        self.assertTrue(r['certification']['finiteNumericalMetricVerified'])

    def test_sufficient_spd_unknown_is_not_a_geometry_rejection(self):
        self.assertTrue(self.circle['certification']['fullIntervalRegularityCertified'])
        self.assertFalse(self.circle['certification']['planarPaperInjectivityCertified'])
        short=query_curved_matched_pair({**PRESET,'parameterEnd':.2,'transverseStart':-.2,'transverseEnd':.2,'segments':8,'rulingSegments':4})
        self.assertTrue(short['certification']['planarPaperInjectivityCertified'])

    def test_small_scales_with_large_translation_keep_normalized_geometry_and_sources(self):
        for amount in (1e-6,1e-8):
            q=tiny_query({**NONCIRCULAR_PRESET,'segments':8,'rulingSegments':4},amount)
            r=query_curved_matched_pair(q)
            self.assertTrue(r['certification']['fullIntervalRegularityCertified'])
            self.assertEqual(r['query']['flatCurve'],q['flatCurve'])
            self.assertEqual(r['query']['spaceCurve'],q['spaceCurve'])
            self.assertAlmostEqual(r['diagnostics']['parameterDomain']['coordinateNormalization']['scale']/amount,1,places=13)
            for original,row in zip(self.noncircle['sample']['rows'],r['sample']['rows']):
                for key in ('normalizedC','normalizedCC','normalizedCPrime','normalizedCCPrime'):
                    self.assertLess(np.linalg.norm(np.array(original[key])-row[key]),2e-12)
                for key in ('d','dd','dPrime','ddPrime'):
                    self.assertLess(np.linalg.norm(np.array(original[key])-row[key]),2e-12)
            for original,row in zip(self.noncircle['sample']['grid'],r['sample']['grid']):
                for point0,point in zip(original,row):
                    self.assertLess(np.linalg.norm(np.array(point0['normalizedSpace'])-point['normalizedSpace']),2e-12)
            json.dumps(r)

    def test_rejects_mismatch_curvature_zero_and_original_width_focus(self):
        cases=[{**PRESET,'spaceCurve':['.8*cos(s)','.8*sin(s)','1']},
               {**PRESET,'flatCurve':['cos(s)','sin(s)']},
               {**PRESET,'spaceCurve':['s','0','1']},
               {**PRESET,'flatCurve':['s**3','0']},
               {**PRESET,'transverseEnd':2},
               {**PRESET,'transverseEnd':3},
               {**PRESET,'flatCurve':['cos(s)','sin(s)'],'spaceCurve':['2*cos(s/2)','2*sin(s/2)','1']}]
        for q in cases:
            with self.subTest(q=q),self.assertRaises(ValueError):query_curved_matched_pair(q)

    def test_rejects_code_free_names_false_branch_and_budget_inputs(self):
        for source in ("__import__('os')",'s.__class__','unknown(s)','s**999','s;1','lambda s:s','exp(1000)+s'):
            with self.subTest(source=source),self.assertRaises(ValueError):query_curved_matched_pair({**PRESET,'flatCurve':[source,'s']})
        for patch_query in ({'psi':0},{'sigma':True},{'rulingSegments':3},{'segments':129},{'unexpected':1},{'flatCurve':['s']}):
            with self.subTest(q=patch_query),self.assertRaises(ValueError):validate_curved_matched_pair_query({**PRESET,**patch_query})


if __name__=='__main__':unittest.main()
