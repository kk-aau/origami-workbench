"""Caller-supplied original rules: literal roots and independent matrix recovery."""
import copy
import json
import math
import unittest
from pathlib import Path
import numpy as np
from scipy.linalg import expm
from tessellation_curved_curve2d_systems import validate_independent_curve2d_system, precompute_curve2d_systems
from tessellation_curved_generic_linked_query import query_generic_linked, validate_generic_linked_query, Kernel, PRESET
from tessellation_curved_generic_linked_expression import GenericLinkedError, Taylor

FIXTURES=json.loads((Path(__file__).parents[1]/'tests/fixtures/origamica-independent-systems-1010.json').read_text(encoding='utf8'))

class IndependentSystemTests(unittest.TestCase):
    def test_original_literal_four_constant_rules_and_unnormalized_matrix_recovery(self):
        q=copy.deepcopy(FIXTURES[1]['query']);r=query_generic_linked(q)
        self.assertEqual(r['query'],q)
        self.assertEqual(r['independentRules']['initialState'],[0.,0.,0.,2.,0.,0.,0.,3.,0.,0.,0.,1.])
        self.assertFalse(r['certification']['finiteNumericalMetricVerified'])
        self.assertFalse(r['certification']['adoptableCreasePattern'])
        # Independent augmented matrix exponential, no production Kernel or ODE
        # used to predict the first curve or its raw frame.
        g=.6;n=g*math.tan(.9);B=np.array([[0,0,0,0],[5,0,-g,-n],[0,g,0,0],[0,n,0,0]],float)
        X0=np.array([[0,2,0,0],[0,0,3,0],[0,0,0,1]],float)
        for row in r['sample']['rows']:
            s=row['s'];X=X0@expm(s*B);Xp=X@B;f,t,l,N=X.T;fp,tp,lp,Np=Xp.T
            # Literal original Next2D with constant rules and parallel offset
            # source curves: gamma1=-gamma0; rfn=2*(q2-s), hence q2=s.
            self.assertAlmostEqual(row['qValues'][2],s,places=12)
            self.assertAlmostEqual(row['foldAnglesDeg'][1],-math.degrees(1.8),places=12)
            f1=f+3*l;f1p=fp+3*lp
            nt=4*t;ntp=4*tp;left=4*l;leftp=4*lp
            normal=np.cross(nt,left);normalp=np.cross(ntp,left)+np.cross(nt,leftp)
            nl=math.cos(-1.8)*left-math.sin(-1.8)*normal
            nlp=math.cos(-1.8)*leftp-math.sin(-1.8)*normalp
            expected=[f,f1,f1+3*nl];derivatives=[fp,f1p,f1p+3*nlp]
            np.testing.assert_allclose(row['normalizedFoldedCurves'],expected,rtol=2e-11,atol=2e-11)
            np.testing.assert_allclose(row['normalizedFoldedDerivatives'],derivatives,rtol=2e-11,atol=2e-11)

    def test_each_prefix_really_runs_and_third_next2d_has_no_invented_influence(self):
        results=[query_generic_linked(copy.deepcopy(c['query'])) for c in FIXTURES]
        for count,r in enumerate(results,1):
            self.assertEqual(r['curve2DSystems']['replacementIndices'],list(range(count)))
            self.assertTrue(all(n>0 for n in r['curve2DSystems']['evaluations']))
            self.assertFalse(r['curve2DSystems']['next2DThirdSystemUsed'])
            self.assertFalse(r['curve2DSystems']['originalSameSourceRequired'])
            self.assertEqual(r['independentRules']['ruleDomains'],[[-2.,3.]]*count)
        self.assertEqual(results[1]['sample'],results[2]['sample'])
        self.assertNotEqual(results[0]['sample'],results[1]['sample'])

    def test_variable_safe_rules_are_composed_and_evaluated_without_normalization(self):
        q=copy.deepcopy(FIXTURES[1]['query']);s=q['curve2DSystems'][0]
        bykey={r['key']:r for r in s['rules']}
        bykey['Speed2D']['expressions']=['1+.1*u'];bykey['LeftCurvature2D']['expressions']=['.6+.02*u']
        bykey['TangentVector2D']['expressions']=['2+u','Sin[u]'];bykey['LeftNormalVector2D']['expressions']=['u','3-u']
        kernel=Kernel(validate_generic_linked_query(q));jet=Taylor([.2,2.,.1]);geom=kernel.geometry(0,jet)
        self.assertAlmostEqual(geom['t'][0].value,2.2)
        self.assertAlmostEqual(geom['t'][0].c[1],2.)
        self.assertAlmostEqual(geom['l'][1].value,2.8)
        self.assertAlmostEqual(geom['speed'].value,(1+.1*.2)*2/.2)
        self.assertAlmostEqual(geom['g'].value,(1+.1*.2)*(.6+.02*.2)*2)
        # Negative speed is an allowed finite caller value, not a hidden
        # positive-speed or source-identity requirement from the old cache.
        bykey['Speed2D']['expressions']=['-1'];validate_independent_curve2d_system(s)

    def test_wrong_identity_mixed_modes_unsafe_rules_and_domain_are_rejected(self):
        base=FIXTURES[1]['query']['curve2DSystems'][0]
        mutations=[lambda s:s.update(family='origamica-curve2d-system-description'),
          lambda s:s['source'].update(function='Curve2DSystem'),lambda s:s['source'].update(kind='verified-same-source'),
          lambda s:s.update(parameterDomain=[True,3]),lambda s:s.update(parameterDomain=[-21,3]),
          lambda s:s['rules'][0].update(key='LeftNormalVector2D'),
          lambda s:s['rules'][0].update(expressions=['__import__("os")','0']),
          lambda s:s['rules'][0].update(expressions=['1/(u-.123)','0'])]
        for mutate in mutations:
            s=copy.deepcopy(base);mutate(s)
            with self.subTest(s=s),self.assertRaises(GenericLinkedError):validate_independent_curve2d_system(s)
        q=copy.deepcopy(FIXTURES[1]['query']);q.pop('curve2DSystemsMode')
        with self.assertRaisesRegex(GenericLinkedError,'cache-contract'):query_generic_linked(q)
        q=copy.deepcopy(FIXTURES[1]['query']);q['curve2DSystems']=precompute_curve2d_systems({'family':'curve2d-systems-native','curves':PRESET['curves']})['systems']
        with self.assertRaisesRegex(GenericLinkedError,'independent-rule-contract'):query_generic_linked(q)

    def test_rules_array_order_is_preserved_and_does_not_change_keyed_consumption(self):
        q=copy.deepcopy(FIXTURES[1]['query']);q['curve2DSystems'][0]['rules'].reverse()
        r=query_generic_linked(q)
        self.assertEqual(r['query']['curve2DSystems'],q['curve2DSystems'])
        self.assertEqual(r['sample'],FIXTURES[1]['response']['sample'])

    def test_third_system_is_used_by_later_next2d_and_three_dimensional_band(self):
        cases=json.loads((Path(__file__).parents[1]/'tests/fixtures/origamica-independent-systems-followup-1010.json').read_text(encoding='utf8'))
        results=[query_generic_linked(copy.deepcopy(c['query'])) for c in cases]
        for r in results:
            self.assertFalse(r['curve2DSystems']['next2DThirdSystemUsed'])
            self.assertEqual(r['certification']['bandCount'],3)
        for left,right in zip(results[0]['sample']['rows'],results[1]['sample']['rows']):
            self.assertEqual(left['foldAnglesDeg'][1],right['foldAnglesDeg'][1])
            self.assertEqual(left['qValues'][2],right['qValues'][2])
            # Original next triple now has the imported third system as its
            # SECOND system, with k changing from .6 to .8.
            expected=2*math.atan(.6/.8*math.tan(.9))
            self.assertAlmostEqual(right['foldAnglesDeg'][2],math.degrees(expected),places=12)
            self.assertNotEqual(left['foldAnglesDeg'][2],right['foldAnglesDeg'][2])
            self.assertEqual(left['foldedCurves'][:3],right['foldedCurves'][:3])
            self.assertNotEqual(left['foldedCurves'][3],right['foldedCurves'][3])

    def test_actual_out_of_domain_and_zero_curvature_are_explicit_errors(self):
        q=copy.deepcopy(FIXTURES[1]['query']);q['curve2DSystems'][0]['parameterDomain']=[.1,3]
        with self.assertRaisesRegex(GenericLinkedError,'independent-rule-domain'):query_generic_linked(q)
        q=copy.deepcopy(FIXTURES[1]['query'])
        for r in q['curve2DSystems'][0]['rules']:
            if r['key']=='LeftCurvature2D':r['expressions']=['0']
        with self.assertRaisesRegex(GenericLinkedError,'singularity'):query_generic_linked(q)

    def test_signed_speed_really_drives_position_instead_of_being_absed_or_replaced(self):
        q=copy.deepcopy(FIXTURES[1]['query'])
        for s in q['curve2DSystems']:
            for row in s['rules']:
                if row['key']=='Speed2D':row['expressions']=['-1']
        r=query_generic_linked(q)
        self.assertEqual(r['sample']['rows'][0]['foldedDerivatives'][0],[-2.,0.,0.])
        self.assertFalse(r['certification']['finiteNumericalMetricVerified'])
        self.assertEqual(r['query']['curve2DSystems'],q['curve2DSystems'])

    def test_automatic_and_empty_are_explicit_no_external_systems(self):
        for option in ('Automatic',[]):
            q=copy.deepcopy(FIXTURES[1]['query']);q['curve2DSystems']=option
            r=query_generic_linked(q)
            self.assertEqual(r['curve2DSystems']['evaluations'],[])
            self.assertEqual(r['independentRules']['ruleDomains'],[])
            self.assertTrue(r['certification']['finiteNumericalMetricVerified'])
            self.assertFalse(r['certification']['allBandsAnalyticLocalIsometry'])

if __name__=='__main__':unittest.main()
