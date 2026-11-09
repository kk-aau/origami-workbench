"""Independent differential, interval and input-contract checks for linked strips."""
import math
import unittest
import numpy as np
import mpmath as mp
from scipy.integrate import solve_ivp
from tessellation_curved_linked_common_parameter_query import (
    PRESET,parameter_jets,query_linked_common_parameter,validate_linked_common_parameter_query,
    lift_row,_first_derivative)
from tessellation_curved_linked_common_interval import BoundJet,Interval,certify_parameter_domain
from tessellation_curved_linked_first_band_query import query_linked_first_band


class LinkedCommonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.default=query_linked_common_parameter({**PRESET,'segments':16})

    def test_nonzero_saved_physical_input_retains_all_four_bands(self):
        out=self.default
        self.assertEqual(out['query']['q1Harmonics'],[.1])
        self.assertTrue(out['source']['savedPhysicalInputsPreserved'])
        self.assertEqual(out['certification']['bandCount'],4)
        for row in out['sample']['rows']:
            self.assertEqual(len(row['flatCurves']),5)
            self.assertEqual(len(row['foldedCurves']),5)
        self.assertAlmostEqual(out['sample']['rows'][0]['foldAnglesDeg'][1],-110.56999209210358,places=10)
        for key in ('adoptableCreasePattern','exactStraightCreaseFOLD','originalSavedFormulaReplayed',
                    'selfCollisionChecked','continuousFoldPathChecked'):
            self.assertFalse(out['certification'][key])
        self.assertLess(out['diagnostics']['maxMetricError'],1e-9)

    def test_corrected_first_band_agrees_with_existing_saved_first_band(self):
        old=query_linked_first_band({'family':PRESET['family'],'segments':16})
        for new,reference in zip(self.default['sample']['rows'],old['sample']['rows']):
            np.testing.assert_allclose(new['foldedCurves'][:2],[reference['foldedFirst'],reference['foldedSecond']],atol=2e-9)

    def test_independent_five_point_position_derivatives_and_all_band_metrics(self):
        q=PRESET
        initial=np.array((1.,0.,0.,0.,1.,0.,-1.,0.,0.,0.,0.,1.))
        sol=solve_ivp(lambda s,y:_first_derivative(q,s,y),(0,math.pi),initial,
                      method='DOP853',rtol=1e-13,atol=2e-15,dense_output=True)
        h=2e-4
        for s in (.17,.61,1.2,2.2,2.97):
            rows=[lift_row(q,s+k*h,sol.sol(s+k*h))[0] for k in (-2,-1,0,1,2)]
            for key,derivative in (('foldedCurves','foldedDerivatives'),('flatCurves','flatDerivatives')):
                fd=(np.array(rows[0][key])-8*np.array(rows[1][key])+8*np.array(rows[3][key])-np.array(rows[4][key]))/(12*h)
                np.testing.assert_allclose(fd,rows[2][derivative],atol=2e-8,rtol=2e-8)
            spatial=np.array(rows[2]['foldedCurves']);planar=np.array(rows[2]['flatCurves'])
            sd=(np.array(rows[0]['foldedCurves'])-8*np.array(rows[1]['foldedCurves'])+8*np.array(rows[3]['foldedCurves'])-np.array(rows[4]['foldedCurves']))/(12*h)
            pd=(np.array(rows[0]['flatCurves'])-8*np.array(rows[1]['flatCurves'])+8*np.array(rows[3]['flatCurves'])-np.array(rows[4]['flatCurves']))/(12*h)
            for band in range(4):
                for v in (.11,.37,.83):
                    a=(1-v)*sd[band]+v*sd[band+1];b=spatial[band+1]-spatial[band]
                    c=(1-v)*pd[band]+v*pd[band+1];d=planar[band+1]-planar[band]
                    np.testing.assert_allclose((a@a,a@b,b@b),(c@c,c@d,d@d),atol=3e-8,rtol=3e-8)

    def test_taylor_high_derivatives_against_independent_high_precision_scalar_formula(self):
        mp.mp.dps=65
        def q1(s):return s+mp.mpf('.1')*mp.sin(2*s)
        def gamma1(s):
            delta=q1(s)-s;p=1+mp.mpf('.2')*mp.cos(2*s)
            return -2*mp.atan((mp.mpf('1.1')-mp.cos(delta))/(mp.mpf('1.1')*mp.cos(delta)-1)*mp.sqrt(3)/p)
        def q2(s):
            delta=q1(s)-s;p=1+mp.mpf('.2')*mp.cos(2*s)
            target=mp.diff(gamma1,s)/(p*mp.tan(gamma1(s)/2))+mp.sin(delta)/(mp.mpf('1.1')-mp.cos(delta))
            half=target*(mp.mpf('1.1')-mp.mpf('1.2'))/(mp.mpf('1.2')+mp.sqrt(mp.mpf('1.2')**2+(mp.mpf('1.2')**2-mp.mpf('1.1')**2)*target**2))
            return q1(s)+2*mp.atan(half)
        for s in (.13,.72,1.41,2.7):
            q,g=parameter_jets(PRESET,s)
            for jet,fn in ((g[1],gamma1),(q[2],q2)):
                for n in range(4):
                    expected=float(mp.diff(fn,mp.mpf(s),n))/math.factorial(n)
                    self.assertAlmostEqual(jet.c[n],expected,delta=2e-8*max(1,abs(expected)))

    def test_interval_covers_full_domain_and_contains_independent_values(self):
        proof=self.default['diagnostics']['parameterDomain']
        self.assertTrue(proof['certified']);self.assertTrue(proof['planarPaperInjective'])
        self.assertGreater(proof['minimumSpeedLowerBound'],.01)
        self.assertGreater(proof['minimumTransverseLowerBound'],1e-6)
        self.assertLess(proof['planarAngularSpanUpperBound'],2*math.pi-.05)
        self.assertEqual(proof['verifiedCells'],(proof['evaluations']+1)//2)
        for a in (.1,.7,1.3,2.8):
            bound,_=parameter_jets(PRESET,Interval(a,a+.001),BoundJet,order=7)
            for s in np.linspace(a,a+.001,13):
                q,_=parameter_jets(PRESET,float(s))
                for actual,enclosed in zip(q,bound):
                    for n in (0,1):
                        self.assertLessEqual(enclosed.c[n].lo,actual.c[n]+2e-12)
                        self.assertGreaterEqual(enclosed.c[n].hi,actual.c[n]-2e-12)

    def test_cosine_interval_does_not_lose_pi_shift_uncertainty_at_cancellation(self):
        mp.mp.dps=65
        for angle in (-math.pi/2,-math.pi/2+1e-9,math.pi/2,0.,math.pi):
            bound=Interval(angle).cos();exact=mp.cos(mp.mpf(angle))
            self.assertLessEqual(mp.mpf(bound.lo),exact)
            self.assertGreaterEqual(mp.mpf(bound.hi),exact)

    def test_parameterized_two_three_five_bands_and_signed_fourier_variants(self):
        variants=[{'radii':[1,1.15,1.35]}, {'radii':[1,1.15,1.35,1.6],'q1Harmonics':[.05]},
                  {'radii':[1,1.15,1.3,1.45,1.6,1.75],'q1Harmonics':[.01]},
                  {'firstFoldAngleDeg':-95,'q1Harmonics':[.04,.002,.0002]},
                  {'parameterStart':.2,'parameterEnd':2.8,'q1Harmonics':[.04,.005]}]
        for extra in variants:
            with self.subTest(extra=extra):
                out=query_linked_common_parameter({**PRESET,**extra,'segments':8})
                self.assertEqual(out['certification']['bandCount'],len(out['query']['radii'])-1)
                self.assertFalse(out['source']['savedPhysicalInputsPreserved'])
                self.assertLess(out['diagnostics']['maxMetricError'],1e-8)

    def test_zero_perturbation_is_an_explicit_variant_not_a_silent_repair(self):
        out=query_linked_common_parameter({**PRESET,'q1Harmonics':[0.],'segments':8})
        self.assertFalse(out['source']['savedPhysicalInputsPreserved'])
        for row in out['sample']['rows']:
            np.testing.assert_allclose(row['qValues'],[row['s']]*5,atol=1e-12)
            np.testing.assert_allclose(row['foldAnglesDeg'],[120,-120,120,-120],atol=1e-10)

    def test_strict_inputs_and_failed_full_interval_gate(self):
        bad=[{'segments':True},{'radii':[1,1.01,1.2]},{'q1Harmonics':[.1,.2]},
             {'firstFoldAngleDeg':0},{'parameterStart':2,'parameterEnd':1},{'unused':1}]
        for extra in bad:
            with self.subTest(extra=extra),self.assertRaises(ValueError):validate_linked_common_parameter_query({**PRESET,**extra})
        # Valid first-band input but later q_i lose monotonicity: retain all
        # bands and reject, rather than replacing .18 by zero or dropping them.
        with self.assertRaisesRegex(ValueError,'全区间'):
            query_linked_common_parameter({**PRESET,'q1Harmonics':[.18],'segments':8})

if __name__=='__main__':unittest.main()
