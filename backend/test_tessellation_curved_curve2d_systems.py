import copy
import math
import unittest
from unittest.mock import patch
import numpy as np
import mpmath as mp

from tessellation_curved_curve2d_systems import precompute_curve2d_systems, validate_curve2d_system, GenericLinkedError
from tessellation_curved_generic_linked_query import PRESET, Kernel, query_generic_linked
from tessellation_curved_generic_linked_expression import Taylor


class Curve2DSystemsTests(unittest.TestCase):
    def setUp(self):
        self.prepared=precompute_curve2d_systems({'family':'curve2d-systems-native','curves':PRESET['curves']})

    def test_original_literal_parabola_angle_and_root_for_each_ordered_prefix(self):
        q={**copy.deepcopy(PRESET),'q0Expression':'s','q1Expression':'s','gamma0Expression':'1.8','rootSeeds':[.02],'segments':8}
        for count in (1,2,3):
            actual=query_generic_linked({**q,'curve2DSystems':self.prepared['systems'][:count]})
            self.assertEqual(actual['query']['rootSeeds'],[.02])
            self.assertEqual(actual['query']['curve2DSystems'],self.prepared['systems'][:count])
            self.assertEqual(actual['curve2DSystems']['replacementIndices'],list(range(count)))
            self.assertEqual(actual['curve2DSystems']['next2DConsumedIndices'],list(range(min(count,2))))
            self.assertFalse(actual['curve2DSystems']['next2DThirdSystemUsed'])
            self.assertTrue(all(n>0 for n in actual['curve2DSystems']['evaluations']))
            with mp.workdps(50):
                for row in actual['sample']['rows']:
                    s=mp.mpf(str(row['s']))
                    self.assertAlmostEqual(row['foldAnglesDeg'][1],-math.degrees(1.8),places=10)
                    # Original In[4076] rfn reduces to this independent quadratic
                    # for q0=q1=s, parallel parabolas, constant gamma0.
                    root=mp.findroot(lambda z:(1-mp.mpf('.36')*s*s)*(z-s)+mp.mpf('1.2')*s*(mp.mpf('.3')*(z*z-s*s)+mp.mpf('.2')),s)
                    self.assertAlmostEqual(row['qValues'][2],float(root),places=10)

    def test_external_rules_are_really_called_and_not_renormalized(self):
        kernel=Kernel({**copy.deepcopy(PRESET),'curve2DSystems':self.prepared['systems'][:1]})
        class Marker(Exception):pass
        def imported_tangent(argument):raise Marker('external supplied rule called')
        kernel.external_systems[0][2][0]=imported_tangent
        with self.assertRaises(Marker):kernel.geometry(0,Taylor.variable(.1,3))
        bad=copy.deepcopy(self.prepared['systems'][0]);bad['rules'][2]['expressions'][0]='1.001*('+bad['rules'][2]['expressions'][0]+')'
        with self.assertRaisesRegex(GenericLinkedError,'cache-invariant'):validate_curve2d_system(bad,PRESET['curves'][0])

    def test_source_domain_order_unsafe_code_and_false_metadata_are_rejected(self):
        base=self.prepared['systems'][0]
        changes=[lambda x:x['source'].update(function='NCurve2DSystem'),lambda x:x['source'].update(definitionCell='In[3632]'),
                 lambda x:x.update(parameterDomain=[-1.,1.]),lambda x:x['curve'].update(y='0.3*u**2+0.2'),
                 lambda x:x['rules'].reverse(),lambda x:x['rules'][0].update(expressions=['__import__("os")']),
                 lambda x:x.update(parameterDomain=[True,2.])]
        for mutate in changes:
            bad=copy.deepcopy(base);mutate(bad)
            with self.assertRaises(GenericLinkedError):validate_curve2d_system(bad,PRESET['curves'][0])
        swapped=[self.prepared['systems'][1],self.prepared['systems'][0]]
        with self.assertRaisesRegex(GenericLinkedError,'cache-source'):query_generic_linked({**PRESET,'curve2DSystems':swapped})

    def test_symbolic_identity_is_not_replaced_by_finite_sample_agreement(self):
        bad=copy.deepcopy(self.prepared['systems'][0])
        source=bad['rules'][0]['expressions'][0]
        # Agrees at native endpoints and original common endpoints, not as an identity.
        bad['rules'][0]['expressions'][0]=source+'+.001*(u+1)*(u-2)*u*(u-.35)'
        with patch('tessellation_curved_curve2d_systems.regular_rule_domain',side_effect=AssertionError('identity gate was skipped')):
            with self.assertRaisesRegex(GenericLinkedError,'cache-invariant'):validate_curve2d_system(bad,PRESET['curves'][0])
        bad['rules'][0]['expressions'][0]='('+source+')*(u-.123)/(u-.123)'
        with self.assertRaisesRegex(GenericLinkedError,'cache-domain'):validate_curve2d_system(bad,PRESET['curves'][0])

    def test_automatic_empty_and_same_source_prefix_preserve_all_inputs(self):
        base=query_generic_linked({**PRESET,'segments':8})
        for option in ('Automatic',[]):
            actual=query_generic_linked({**PRESET,'segments':8,'curve2DSystems':option})
            self.assertEqual(actual['sample'],base['sample'])
            self.assertEqual(actual['curve2DSystems']['evaluations'],[])
        for count in (1,2,3):
            actual=query_generic_linked({**PRESET,'segments':8,'curve2DSystems':self.prepared['systems'][:count]})
            for a,b in zip(actual['sample']['rows'],base['sample']['rows']):
                for key in ('qValues','qDerivatives','flatCurves','flatDerivatives','foldedCurves','foldedDerivatives'):
                    np.testing.assert_allclose(a[key],b[key],rtol=2e-9,atol=2e-9)
        self.assertFalse(self.prepared['proof']['numericalInterpolationReproduced'])


if __name__=='__main__':unittest.main()
