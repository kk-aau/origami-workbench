import copy
import json
import math
import unittest
from unittest.mock import patch

import mpmath as mp
import numpy as np

from tessellation_curved_constant_width_generic import (
    ConstantWidthError,NONCIRCULAR_PRESET,PRESET,query_constant_width_generic,
    validate_constant_width_generic_query,
)

SIGN_QUERY={**PRESET,'baseCurve':['s','0'],'director':['1','cos(10*s)'],
    'signedOffset':.3,'parameterStart':-.01,'parameterEnd':.01,
    'footEvaluationStart':-.6,'footEvaluationEnd':.6,'segments':8}


class GenericConstantWidthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.circle=query_constant_width_generic({**PRESET,'segments':8})
        cls.parabola=query_constant_width_generic({**NONCIRCULAR_PRESET,'segments':8})

    def test_saved_circle_original_unextended_foot_and_two_signed_offsets(self):
        for offset in (.1,-.1):
            r=query_constant_width_generic({**PRESET,'signedOffset':offset,'segments':8})
            self.assertTrue(r['certification']['continuousRootBranchCertified'])
            self.assertEqual(r['source']['findRootSeedRecipe'],{'widthStartMultiplier':.5,'widthSecondMultiplier':1,'footSecondStepRatio':.01})
            for row in r['sample']['rows']:
                s=row['s'];den=math.sqrt((1-offset)**2-math.sin(s)**2)
                expected=math.cos(s)-den;foot=math.asin(math.sin(s)/(1-offset))
                self.assertAlmostEqual(row['scale'],expected,places=11)
                self.assertAlmostEqual(row['footParameter'],foot,places=11)
                self.assertAlmostEqual(row['scaleDerivative'],-math.sin(s)+math.sin(s)*math.cos(s)/den,places=10)
                self.assertAlmostEqual(row['footParameterDerivative'],math.cos(s)/den,places=10)
                self.assertAlmostEqual(row['perpendicularDistance'],abs(offset),places=11)
            self.assertFalse(r['certification']['nearestFootDistanceChecked'])
        self.assertGreater(self.circle['sample']['rows'][-1]['footParameter'],PRESET['parameterEnd'])
        self.assertFalse(self.circle['source']['interpolationReproduced'])

    def test_noncircular_parabola_matches_50_digit_independent_root_and_derivatives(self):
        mp.mp.dps=50;r=self.parabola
        self.assertTrue(r['certification']['fullIntervalDistanceCertified'])
        self.assertTrue(r['certification']['paperRegularityCertified'])
        self.assertEqual(r['query']['baseCurve'],NONCIRCULAR_PRESET['baseCurve'])
        for row in r['sample']['rows']:
            s=mp.mpf(str(row['s']))
            u=mp.findroot(lambda u:u-mp.mpf('.01')*u/mp.sqrt(1+mp.mpf('.04')*u*u)-s,(s,s+mp.mpf('.008')))
            factor=1+mp.mpf('.04')*u*u
            width=mp.mpf('.1')*(u*u-s*s)+mp.mpf('.05')/mp.sqrt(factor)
            up=1/(1-mp.mpf('.01')/factor**mp.mpf('1.5'))
            wp=mp.mpf('.2')*(u*up-s)-mp.mpf('.002')*u*up/factor**mp.mpf('1.5')
            for key,reference in [('scale',width),('footParameter',u),('scaleDerivative',wp),('footParameterDerivative',up)]:
                self.assertLess(abs(row[key]-float(reference)),2e-12)

    def test_literal_sign_uses_director_at_foot_and_can_reverse_positive_width(self):
        r=query_constant_width_generic(SIGN_QUERY);row=r['sample']['rows'][4]
        self.assertEqual(row['s'],0)
        self.assertAlmostEqual(row['scale'],-.3,places=12)
        self.assertAlmostEqual(row['footParameter'],-.3,places=12)
        self.assertEqual(row['branchSign'],-1)
        self.assertGreater(math.cos(10*row['s']),0)
        self.assertLess(math.cos(10*row['footParameter']),0)
        self.assertTrue(r['certification']['continuousRootBranchCertified'])
        self.assertEqual(r['diagnostics']['paperRegularity']['orientation'],-1)
        # The tempting +.3 root selected using d(s) fails the literal equation.
        wrong_outer=np.array([.3,.3]);wrong_expected=np.array([.3,-.3])
        self.assertGreater(np.linalg.norm(wrong_outer-wrong_expected),.59)

    def test_nonunit_variable_director_is_preserved_and_width_scales_inversely(self):
        r=query_constant_width_generic({**NONCIRCULAR_PRESET,'director':['0','2+s'],'segments':8})
        self.assertTrue(r['certification']['continuousRootBranchCertified'])
        for original,row in zip(self.parabola['sample']['rows'],r['sample']['rows']):
            s=row['s']
            self.assertEqual(row['director'],[0,2+s])
            self.assertEqual(row['directorDerivative'],[0,1])
            self.assertAlmostEqual(row['scale'],original['scale']/(2+s),places=12)
            self.assertAlmostEqual(row['scaleDerivative'],original['scaleDerivative']/(2+s)-original['scale']/(2+s)**2,places=12)
            self.assertLess(np.linalg.norm(np.array(row['outer'])-original['outer']),2e-12)

    def test_common_parameter_reversal_retains_native_orientation(self):
        r=query_constant_width_generic({**PRESET,'baseCurve':['cos(s)','-sin(s)'],'segments':8})
        self.assertTrue(r['certification']['fullIntervalDistanceCertified'])
        for original,row in zip(self.circle['sample']['rows'],r['sample']['rows']):
            self.assertEqual(row['branchSign'],-1)
            self.assertAlmostEqual(row['scale'],original['scale'],places=11)
            self.assertAlmostEqual(row['footParameter'],original['footParameter'],places=11)
            self.assertAlmostEqual(row['baseDerivative'][1],-math.cos(row['s']),places=12)

    def test_small_scales_large_translation_keep_physical_derivatives_and_original_sources(self):
        for amount in (1e-6,1e-8):
            q={**NONCIRCULAR_PRESET,'baseCurve':[f'1000000000+{amount}*({f})' for f in NONCIRCULAR_PRESET['baseCurve']],
               'signedOffset':.05*amount,'segments':8}
            r=query_constant_width_generic(q)
            self.assertTrue(r['certification']['fullIntervalDistanceCertified'])
            self.assertEqual(r['query']['baseCurve'],q['baseCurve'])
            self.assertAlmostEqual(r['normalization']['scale']/amount,self.parabola['normalization']['scale'],places=12)
            for original,row in zip(self.parabola['sample']['rows'],r['sample']['rows']):
                for key in ('normalizedBase','normalizedOuter','normalizedFoot','normalizedNormal','normalizedBaseDerivative','normalizedOuterDerivative'):
                    self.assertLess(np.linalg.norm(np.array(row[key])-original[key]),2e-12)
                for key in ('scale','scaleDerivative'):
                    self.assertLess(abs(row[key]/amount-original[key]),2e-12)
                for key in ('baseDerivative','outerDerivative'):
                    self.assertLess(np.linalg.norm(np.array(row[key])/amount-original[key]),2e-12)
            json.dumps(r)

    def test_zero_offset_keeps_zero_function_and_never_positive_width_paper(self):
        r=query_constant_width_generic({**PRESET,'signedOffset':0,'segments':8})
        self.assertTrue(r['certification']['finiteNumericalDistanceVerified'])
        self.assertFalse(r['certification']['paperRegularityCertified'])
        self.assertEqual(r['diagnostics']['paperRegularity']['status'],'degenerate')
        for row in r['sample']['rows']:
            self.assertAlmostEqual(row['scale'],0,places=12)
            self.assertAlmostEqual(row['scaleDerivative'],0,places=12)
            self.assertAlmostEqual(row['footParameter'],row['s'],places=12)
            self.assertLess(np.linalg.norm(np.array(row['normalizedBase'])-row['normalizedOuter']),2e-12)

    def test_budget_unknown_keeps_entire_actual_domain_and_rows(self):
        with patch('tessellation_curved_constant_width_generic.CERTIFICATION_BUDGET',1):
            r=query_constant_width_generic({**NONCIRCULAR_PRESET,'segments':8})
        self.assertEqual(r['proof']['status'],'unknown')
        self.assertFalse(r['certification']['continuousRootBranchCertified'])
        self.assertFalse(r['certification']['fullIntervalDistanceCertified'])
        self.assertTrue(r['certification']['finiteNumericalDistanceVerified'])
        self.assertEqual(len(r['sample']['rows']),9)
        self.assertEqual(r['sample']['rows'][-1]['s'],.8)
        self.assertAlmostEqual(r['sample']['rows'][-1]['scale'],self.parabola['sample']['rows'][-1]['scale'],places=12)

    def test_finite_foot_domain_failure_is_not_reported_as_mathematical_no_solution(self):
        with self.assertRaisesRegex(ConstantWidthError,'额外有限求值域'):
            query_constant_width_generic({**PRESET,'footEvaluationEnd':1.2,'segments':8})

    def test_rejects_singular_equations_sign_zero_and_unsafe_sources(self):
        cases=[{**PRESET,'baseCurve':['0','0']},{**PRESET,'director':['0','0']},
               {**PRESET,'signedOffset':1},
               {**PRESET,'baseCurve':['s','0'],'director':['1','0']},
               {**NONCIRCULAR_PRESET,'baseCurve':['s+0/(s-.4)','.1*s**2']},
               {**PRESET,'baseCurve':['exp(1000)+s','0']}]
        for q in cases:
            with self.subTest(q=q),self.assertRaises(ValueError):query_constant_width_generic(q)
        for source in ("__import__('os')",'s.__class__','free(s)','s**999','s;1','lambda s:s'):
            with self.subTest(source=source),self.assertRaises(ValueError):query_constant_width_generic({**PRESET,'baseCurve':[source,'s']})
        for fields in ({'segments':True},{'segments':129},{'footEvaluationStart':-41},{'signedOffset':1001},{'extra':1}):
            with self.subTest(fields=fields),self.assertRaises(ValueError):validate_constant_width_generic_query({**PRESET,**fields})


if __name__=='__main__':unittest.main()
