"""Independent tests of native expressions, root seams and actual geometry."""
import copy
import json
import math
from pathlib import Path
import unittest

import mpmath as mp
import numpy as np
from scipy.integrate import solve_ivp

from tessellation_curved_generic_linked_expression import Expression,GenericLinkedError,Taylor
from tessellation_curved_generic_linked_query import PRESET,Kernel,query_generic_linked,validate_generic_linked_query
from tessellation_curved_linked_first_band_query import query_linked_first_band

FIXTURES=Path(__file__).resolve().parents[1]/'tests'/'fixtures'


class GenericLinkedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.default=query_generic_linked({**PRESET,'segments':8})

    def test_real_route_and_nonconstant_native_source(self):
        out=query_linked_first_band({**PRESET,'segments':8})
        self.assertEqual(out['family'],'linked-generic-common-parameter')
        self.assertEqual(out['query']['q0Expression'],PRESET['q0Expression'])
        self.assertEqual(out['query']['gamma0Expression'],PRESET['gamma0Expression'])
        self.assertEqual(out['certification']['bandCount'],2)
        self.assertLess(out['diagnostics']['maxMetricError'],1e-9)
        first,last=out['sample']['rows'][0],out['sample']['rows'][-1]
        self.assertNotEqual(first['foldAnglesDeg'][0],last['foldAnglesDeg'][0])
        self.assertAlmostEqual(first['qDerivatives'][0],1.03,places=12)
        self.assertFalse(out['source']['savedNumericalOut'])
        for key in ('adoptableCreasePattern','exactStraightCreaseFOLD','selfCollisionChecked','continuousFoldPathChecked','integrationErrorIntervalCertified'):
            self.assertFalse(out['certification'][key])

    def test_independent_high_precision_native_taylor(self):
        mp.mp.dps=65
        source='Exp[0.2u] Sin[u] + Sqrt[1+u^2] + ArcTan[u]'
        fn=lambda u:mp.exp(mp.mpf('.2')*u)*mp.sin(u)+mp.sqrt(1+u*u)+mp.atan(u)
        for u in (.17,.6):
            jet=Expression(source,'u')(Taylor.variable(u,7))
            for k in range(6):
                expected=float(mp.diff(fn,mp.mpf(u),k)/math.factorial(k))
                self.assertAlmostEqual(jet.c[k],expected,delta=2e-12*max(1,abs(expected)))
            derivative=Expression(source,'u').derivative()(Taylor.variable(u,5))
            for k in range(4):
                expected=float(mp.diff(fn,mp.mpf(u),k+1)/math.factorial(k))
                self.assertAlmostEqual(derivative.c[k],expected,delta=2e-12*max(1,abs(expected)))

    def test_independent_five_point_position_derivatives_and_efg(self):
        kernel=Kernel(validate_generic_linked_query({**PRESET,'segments':8}));kernel.certify()
        a,b=PRESET['parameterStart'],PRESET['parameterEnd'];_,_,geom=kernel.point(a)
        p=np.array([x.value for x in geom[0]['p']]);t=np.array([x.value for x in geom[0]['t']]);l=np.array([x.value for x in geom[0]['l']])
        initial=np.array((*p,0.,*t,0.,*l,0.,0.,0.,1.))
        sol=solve_ivp(kernel.first_derivative,(a,b),initial,method='DOP853',rtol=2e-13,atol=2e-15,dense_output=True)
        h=2e-5
        for s in (.031,.123,.271):
            rows=[kernel.row(s+k*h,sol.sol(s+k*h))[0] for k in (-2,-1,0,1,2)]
            calculated={}
            for name,derivative in (('normalizedFlatCurves','normalizedFlatDerivatives'),('normalizedFoldedCurves','normalizedFoldedDerivatives')):
                fd=(np.array(rows[0][name])-8*np.array(rows[1][name])+8*np.array(rows[3][name])-np.array(rows[4][name]))/(12*h)
                np.testing.assert_allclose(fd,rows[2][derivative],atol=2e-8,rtol=2e-8)
                calculated[name]=fd
            flat=np.array(rows[2]['normalizedFlatCurves']);spatial=np.array(rows[2]['normalizedFoldedCurves'])
            for i in range(2):
                for v in (.19,.57,.83):
                    ds=(1-v)*calculated['normalizedFoldedCurves'][i]+v*calculated['normalizedFoldedCurves'][i+1];dv=spatial[i+1]-spatial[i]
                    ps=(1-v)*calculated['normalizedFlatCurves'][i]+v*calculated['normalizedFlatCurves'][i+1];pv=flat[i+1]-flat[i]
                    np.testing.assert_allclose((ds@ds,ds@dv,dv@dv),(ps@ps,ps@pv,pv@pv),atol=3e-7,rtol=2e-8)

    def test_five_non_circular_bands_nonlinear_q_and_gamma_keep_all_six_curves(self):
        with open(FIXTURES/'origamica-generic-linked-five8.json',encoding='utf-8') as f:query=json.load(f)['query']
        out=query_generic_linked(query)
        self.assertEqual(out['certification']['bandCount'],5)
        self.assertEqual(len(out['query']['rootSeeds']),4)
        for row in out['sample']['rows']:
            self.assertEqual(len(row['normalizedFoldedCurves']),6)
            self.assertAlmostEqual(row['qValues'][0],row['s']+1e-6*math.sin(row['s']),places=12)
            self.assertAlmostEqual(row['foldAnglesDeg'][0],math.degrees(1.8+1e-6*math.sin(row['s'])),places=10)
        self.assertLess(out['diagnostics']['maxMetricError'],1e-8)
        domain=out['diagnostics']['parameterDomain']
        self.assertEqual(domain['seamChecks'],domain['verifiedCells']-1)
        self.assertGreater(domain['minimumSeamRootDerivativeLowerBound'],0)

    def test_three_four_bands_are_the_same_real_prefix_without_band_dependent_substitution(self):
        with open(FIXTURES/'origamica-generic-linked-five8.json',encoding='utf-8') as f:reference=json.load(f)
        for bands in (3,4):
            query={**reference['query'],'curves':reference['query']['curves'][:bands+1],
                   'rootSeeds':reference['query']['rootSeeds'][:bands-1]}
            out=query_generic_linked(query)
            self.assertEqual(out['certification']['bandCount'],bands)
            for actual,full in zip(out['sample']['rows'],reference['sample']['rows']):
                for key in ('qValues','qDerivatives','normalizedFlatCurves','normalizedFoldedCurves','normalizedFoldedDerivatives'):
                    np.testing.assert_allclose(actual[key],full[key][:bands+1],atol=3e-8,rtol=3e-8)

    def test_scale_1e_6_1e_8_with_1e9_translation_preserves_source_and_normalized_geometry(self):
        for scale in ('1e-6','1e-8'):
            query={**PRESET,'segments':8,'curves':[{'x':f'1e9+{scale}u','y':f'1e9+{scale}(0.3u^2+{i*.2:.1f})',
                    'parameterMin':-1.,'parameterMax':2.} for i in range(3)]}
            out=query_generic_linked(query)
            self.assertEqual(out['query']['curves'],query['curves'])
            self.assertAlmostEqual(out['diagnostics']['parameterDomain']['coordinateNormalization']['scale']/float(scale),.2,places=12)
            for actual,base in zip(out['sample']['rows'],self.default['sample']['rows']):
                for key in ('qValues','qDerivatives','foldAnglesDeg','normalizedFlatCurves','normalizedFoldedCurves'):
                    np.testing.assert_allclose(actual[key],base[key],atol=3e-9,rtol=3e-9)

    def test_unknown_global_paper_does_not_suppress_valid_local_source(self):
        with open(FIXTURES/'origamica-generic-linked-unknown8.json',encoding='utf-8') as f:query=json.load(f)['query']
        out=query_generic_linked(query)
        self.assertTrue(out['certification']['fullIntervalRegularityCertified'])
        self.assertFalse(out['certification']['planarPaperInjectivityCertified'])
        self.assertFalse(out['certification']['globalBoundaryInjectivityChecked'])
        for row in out['sample']['rows']:
            np.testing.assert_allclose(row['qValues'],[row['s']]*3,atol=2e-10)
        self.assertEqual(out['query']['curves'][0]['parameterMin'],-.5)

    def test_safe_expression_contract_rejects_code_and_mutable_objects(self):
        for source in ('__import__("os")','u.__class__','[u,1]','sin(u,1)','u**u','u**9','True','lambda u:u'):
            with self.subTest(source=source),self.assertRaises(GenericLinkedError):Expression(source,'u')
        query=validate_generic_linked_query({**PRESET,'gamma0Expression':'2 Pi/3 + 0.01 Sin[s]'})
        self.assertEqual(query['gamma0Expression'],'2 Pi/3 + 0.01 Sin[s]')
        query['curves'][0]['x']='changed'
        self.assertEqual(PRESET['curves'][0]['x'],'u')

    def test_actual_singularity_no_solution_and_budget_have_distinct_codes(self):
        singular={**PRESET,'curves':[{'x':'u','y':str(i*.2),'parameterMin':-1,'parameterMax':2} for i in range(3)]}
        with self.assertRaisesRegex(GenericLinkedError,r'\[singularity\]'):query_generic_linked(singular)
        no_root=copy.deepcopy(PRESET);no_root['curves'][2].update(parameterMin=.9,parameterMax=1.1);no_root['rootSeeds']=[1.]
        with self.assertRaisesRegex(GenericLinkedError,r'\[root-no-solution\]'):query_generic_linked(no_root)
        kernel=Kernel(validate_generic_linked_query(PRESET));kernel.evaluations=1024
        with self.assertRaisesRegex(GenericLinkedError,r'\[interval-budget\]'):kernel.certify()


if __name__=='__main__':unittest.main()
