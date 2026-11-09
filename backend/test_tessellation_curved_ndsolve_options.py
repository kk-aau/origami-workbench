import copy,json,math,unittest
from pathlib import Path
from unittest.mock import patch
import mpmath as mp
import numpy as np
from tessellation_curved_ndsolve_options import validate_ndsolve_options
from tessellation_curved_generic_darboux import FLATTEN_PRESET,RESHAPE_PRESET,query_generic_darboux,validate_generic_darboux_query,DarbouxKernel,GenericDarbouxError
from tessellation_curved_generic_linked_expression import GenericLinkedError

ROOT=Path(__file__).parents[1]
fixtures=lambda name:json.loads((ROOT/'tests/fixtures'/name).read_text(encoding='utf8'))

class NDSolveStepTests(unittest.TestCase):
    def test_original_in3886_reparameterization_literal_and_step_size_convergence(self):
        records=fixtures('origamica-ndsolve-literal-convergence-1010.json');errors=[]
        for record in records:
            r=query_generic_darboux(copy.deepcopy(record['query']));self.assertEqual(r['query'],record['query'])
            with mp.workdps(60):
                residuals=[]
                for row in r['sample']['rows']:
                    beta=4*mp.mpf(str(row['s']));b=[mp.cos(beta),mp.sin(beta)];bp=[-4*mp.sin(beta),4*mp.cos(beta)]
                    residuals.extend(abs(mp.mpf(str(x))-y) for x,y in zip(row['targetBase'],b))
                    np.testing.assert_allclose(row['targetDirector'],[-float(x) for x in b],atol=4e-12,rtol=0)
                    np.testing.assert_allclose(row['targetBaseDerivative'],[float(x) for x in bp],atol=2e-11,rtol=0)
                errors.append(float(max(residuals)))
            self.assertFalse(r['certification']['adoptableCreasePattern'])
        self.assertLess(errors[1],errors[0]/100)
        self.assertGreater(records[1]['response']['diagnostics']['integration']['stepOptions']['forwardSteps'],records[0]['response']['diagnostics']['integration']['stepOptions']['forwardSteps'])

    def test_explicit_options_do_not_change_any_source_initial_or_resample_input(self):
        for c in fixtures('origamica-ndsolve-step-options-1010.json'):
            r=query_generic_darboux(copy.deepcopy(c['query']));self.assertEqual(r['query'],c['query'])
            steps=r['diagnostics']['integration']['stepOptions']
            self.assertEqual(steps['options'],c['query']['ndsolveOptions'])
            self.assertFalse(steps['wolframStepControllerReproduced'])
            self.assertFalse(steps['errorGoalNormReproduced'])
            if c['query'].get('resample'):self.assertEqual(r['resampling']['polynomial']['degree'],4)

    def test_maxsteps_rejects_before_another_step_without_returning_partial_domain(self):
        q=validate_generic_darboux_query({**copy.deepcopy(FLATTEN_PRESET),'ndsolveOptions':{'MaxSteps':1}})
        kernel=DarbouxKernel(q)
        with self.assertRaisesRegex(GenericDarbouxError,'max-steps-exceeded'):kernel.integrate()
        self.assertEqual(kernel.accepted_steps,1)
        self.assertIsNone(kernel.forward)
        self.assertLess(kernel.integration_calls,50)

    def test_steps_are_counted_over_both_original_directions(self):
        q={**copy.deepcopy(RESHAPE_PRESET),'initialParameter':.4,'ndsolveOptions':{'MaxSteps':101,'MaxStepSize':.01}}
        r=query_generic_darboux(q);s=r['diagnostics']['integration']['stepOptions']
        self.assertEqual(s['backwardSteps'],40);self.assertEqual(s['forwardSteps'],60)
        q['ndsolveOptions']['MaxSteps']=99
        with self.assertRaisesRegex(GenericDarbouxError,'max-steps-exceeded'):query_generic_darboux(q)

    def test_recorded_actual_step_parameters_keep_original_domain_and_bound_every_step(self):
        c=fixtures('origamica-ndsolve-step-options-1010.json')[2];r=query_generic_darboux(c['query'])
        s=r['diagnostics']['integration']['stepOptions'];q=r['query']
        for key,end in [('backward',q['parameterStart']),('forward',q['parameterEnd'])]:
            nodes=s[key+'Parameters'];self.assertEqual(nodes[0],q['initialParameter']);self.assertEqual(nodes[-1],end)
            self.assertEqual(len(nodes)-1,s[key+'Steps'])
            self.assertTrue(all(0<abs(b-a)<=s['effectiveMaxStepSize']*(1+1e-12) for a,b in zip(nodes,nodes[1:])))

    def test_options_do_not_bypass_existing_total_rhs_budget(self):
        q={**copy.deepcopy(FLATTEN_PRESET),'ndsolveOptions':{'MaxSteps':4096,'MaxStepSize':1e-6}}
        with patch('tessellation_curved_generic_darboux.INTEGRATION_BUDGET',40):
            with self.assertRaisesRegex(GenericDarbouxError,'integration-budget'):query_generic_darboux(q)

    def test_unsupported_goal_defaults_and_invalid_numbers_are_not_nominal_switches(self):
        for raw in [{},{'AccuracyGoal':8},{'PrecisionGoal':8},{'WorkingPrecision':30},{'MaxSteps':'Automatic'},
                    {'MaxSteps':True},{'MaxSteps':0},{'MaxSteps':4097},{'MaxSteps':1.5},{'MaxSteps':math.inf},
                    {'MaxStepSize':0},{'MaxStepSize':1e-7},{'MaxStepSize':True},{'MaxStepSize':2}]:
            with self.subTest(raw=raw),self.assertRaises(GenericLinkedError):validate_ndsolve_options(raw,1.)
        self.assertEqual(validate_ndsolve_options({'MaxSteps':256,'MaxStepSize':.03125},1.),{'MaxSteps':256,'MaxStepSize':.03125})

    def test_maxsteps_only_preserves_existing_default_continuous_output_exactly(self):
        for preset in (FLATTEN_PRESET,RESHAPE_PRESET):
            base=query_generic_darboux(copy.deepcopy(preset))
            changed=query_generic_darboux({**copy.deepcopy(preset),'ndsolveOptions':{'MaxSteps':256}})
            self.assertEqual(base['sample'],changed['sample']);self.assertEqual(base['grid'],changed['grid'])
            self.assertEqual(base['certification'],changed['certification'])
            self.assertNotIn('stepOptions',base['diagnostics']['integration'])
            self.assertEqual(base['diagnostics']['integration']['relativeTolerance'],2e-12)
            self.assertEqual(base['diagnostics']['integration']['absoluteTolerance'],2e-14)

if __name__=='__main__':unittest.main()
