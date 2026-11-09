"""Permanent source-equation regressions; no server/UI or output/ dependency."""
import copy
import json
import math
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tessellation_curved_discretization_generic as generic

REFERENCE = json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/curved-discretization-generic-reference-20261001.json').read_text(encoding='utf-8'))


def query(mode, **fields):
    return generic.query_discretization_generic({'family': generic.FAMILY, 'mode': mode, **fields})


def uniform(curve, divisions=4, start=0., end=1.):
    return query('uniform', curve=curve, divisions=divisions, parameterStart=start, parameterEnd=end)


def kink_query():
    return {key: copy.deepcopy(REFERENCE['kink'][key]) for key in ('foldPoints', 'leftRulings', 'rightRulings')}


class GenericDiscretizationTests(unittest.TestCase):
    def test_ordered_duplicate_rules_ragged_values_and_unsorted_repeated_parameters(self):
        parameters = [2., -.5, 2., 0.]
        rules = [{'key': 'A', 'expression': 's+1'},
                 {'key': 'A', 'expression': [['s', 's**2'], ['3'], []]},
                 {'key': 'B', 'expression': []}]
        result = query('system', rules=rules, parameters=parameters)
        rows = result['sample']['rules']
        self.assertEqual([row['key'] for row in rows], ['A','A','B'])
        self.assertEqual(rows[0]['values'], [3., .5, 3., 1.])
        self.assertEqual(rows[1]['values'][1], [[-.5,.25],[3.],[]])
        self.assertEqual(rows[2]['values'], [[],[],[],[]])
        self.assertEqual(result['sample']['parameters'], parameters)
        result['query']['rules'][0]['key'] = 'changed'
        self.assertEqual(rules[0]['key'], 'A')

    def test_empty_system_empty_sample_and_finite_sqrt_zero_are_literal_values(self):
        self.assertEqual(query('system', rules=[], parameters=[1,0])['sample']['rules'], [])
        self.assertEqual(query('system', rules=[{'key':'A','expression':'s'}], parameters=[])['sample']['rules'][0]['values'], [])
        r = query('system', rules=[{'key':'root','expression':'sqrt(s)'}], parameters=[0,4])
        self.assertEqual(r['sample']['rules'][0]['values'], [0.,2.])
        self.assertTrue(r['certification']['allSampledValuesFinite'])

    def test_undefined_atoms_preserve_finite_siblings_without_cropping_parameters(self):
        r = query('system', rules=[{'key':'R','expression':['1/s','sqrt(s)']}], parameters=[0,-1,1])
        self.assertEqual(r['sample']['rules'][0]['values'], [[None,0.],[-1.,None],[1.,1.]])
        self.assertEqual([(x['sampleIndex'],x['path']) for x in r['sample']['undefined']], [(0,[0]),(1,[1])])
        self.assertFalse(r['certification']['allSampledValuesFinite'])

    def test_parabola_matches_independent_80_digit_source_equations_not_equal_arc_length(self):
        r = uniform(REFERENCE['parabola']['curve'])['sample']
        for actual, expected in zip(r['parameters'], REFERENCE['parabola']['parameters']):
            self.assertAlmostEqual(actual,float(expected),places=12)
        self.assertGreater(max(r['normalizedChordLengths'])/min(r['normalizedChordLengths']), 3.)
        self.assertGreater(abs(r['parameters'][1]-.25),.05)
        for row in r['equations']:
            self.assertLess(abs(row['directionResidual']),1e-12)

    def test_real_unconstrained_solver_keeps_outside_nonmonotonic_root_and_does_not_sort(self):
        r = uniform(REFERENCE['oscillatoryUnconstrained']['curve'])['sample']
        self.assertFalse(r['strictlyOrderedAlongRequestedInterval'])
        self.assertEqual(r['outsideRequestedInterval'],[2])
        for actual, expected in zip(r['parameters'],REFERENCE['oscillatoryUnconstrained']['parameters']):
            self.assertAlmostEqual(actual,float(expected),places=10)
        self.assertEqual(r['initialGuess'],[0,.25,.5,.75,1])
        self.assertTrue(r['unconstrainedParameters'])

    def test_dimension_is_not_fixed_to_2_or_3_and_reverse_interval_is_preserved(self):
        r = uniform(['cos(s)','sin(s)','s/3','2*s','0'],divisions=6,start=1.2,end=-.6)['sample']
        self.assertTrue(r['strictlyOrderedAlongRequestedInterval'])
        self.assertTrue(all(len(p)==5 for p in r['points']))
        for actual,expected in zip(r['parameters'],r['initialGuess']):
            self.assertAlmostEqual(actual,expected,places=10)
        line = uniform(['s'],divisions=3)['sample']
        self.assertEqual(line['parameters'],line['initialGuess'])

    def test_stationary_derivative_is_original_zero_equation_not_an_extra_regular_curve_gate(self):
        r = uniform(['s**3'],divisions=2,start=-1,end=1)['sample']
        self.assertEqual(r['parameters'],[-1.,0.,1.])
        self.assertEqual(r['stationaryVertices'],[2])
        self.assertEqual(r['equations'][0]['directionResidual'],0.)

    def test_one_segment_has_no_interior_equations_and_requires_no_endpoint_derivative(self):
        r = uniform(['sqrt(s)','0'],divisions=1)['sample']
        self.assertEqual(r['parameters'],[0,1])
        self.assertEqual(r['points'],[[0.,0.],[1.,0.]])
        self.assertEqual(r['equations'],[])
        constant = uniform(['3','3'],divisions=1)['sample']
        self.assertEqual(constant['normalizedChordLengths'],[0.])
        with self.assertRaisesRegex(generic.GenericDiscretizationError,'undefined-chord-equation'):
            uniform(['3','3'],divisions=2)

    def test_parameter_free_radicals_have_zero_derivative_without_changing_source_ast(self):
        r = uniform(['s+sqrt(0)', 's*(sqrt(0)+2)', 's**-2'], start=1., end=2.)
        self.assertEqual(r['query']['curve'], ['s+sqrt(0)', 's*(sqrt(0)+2)', 's**-2'])
        for row in r['sample']['equations']:
            self.assertEqual(row['derivative'][:2], [1., 2.])
            self.assertAlmostEqual(row['derivative'][2], -2/row['parameter']**3)
        self.assertEqual(uniform(['s+sqrt(0)','s'])['sample']['parameters'], [0.,.25,.5,.75,1.])
        with self.assertRaisesRegex(generic.GenericDiscretizationError, 'source-undefined'):
            uniform(['s+sqrt(s-s)', 's'])

    def test_compensated_tiny_translated_curve_uses_original_chord_equations(self):
        base = uniform(['-s**2','s'])['sample']
        small = uniform(['1000000000-1e-8*s**2','1000000000+1e-8*s'])['sample']
        for actual, expected in zip(small['parameters'],base['parameters']):
            self.assertAlmostEqual(actual,expected,places=11)
        for p,r in zip(small['normalizedPoints'],base['normalizedPoints']):
            for actual,expected in zip(p,r):self.assertAlmostEqual(actual,expected,places=11)
        self.assertLess(small['normalization']['scale'],1e-7)

    def test_original_signed_sector_and_endpoint_quotients_keep_raw_direction_amplitudes(self):
        data = kink_query()
        result = query('multipliers',**data)
        for value, expected in zip(result['sample']['multipliers'],REFERENCE['kink']['multipliers']):
            self.assertAlmostEqual(value,float(expected),places=12)
        for key,expected in zip(('a1','a2','a3','a4'),[60,100,120,80]):
            self.assertAlmostEqual(math.degrees(result['sample']['sectors'][1][key]),expected,places=12)
        for key in ('leftRulings','rightRulings'):
            data[key] = [[v*1e100 for v in row] for row in data[key]]
        scaled = query('multipliers',**data)
        self.assertEqual(scaled['sample']['leftRulings'],data['leftRulings'])
        for a,b in zip(scaled['sample']['multipliers'],result['sample']['multipliers']):
            self.assertAlmostEqual(a,b,places=12)

    def test_kawasaki_uses_original_chop_threshold_and_aborts_instead_of_success(self):
        data = kink_query()
        for delta,abort in [(4e-11,False),(6e-11,True)]:
            angle=math.radians(260)+delta
            data['rightRulings'][1]=[math.cos(angle),math.sin(angle)]
            if abort:
                with self.assertRaises(generic.GenericDiscretizationError) as caught:
                    query('multipliers',**data)
                self.assertEqual(caught.exception.code,'original-kawasaki-abort')
                self.assertEqual(caught.exception.details['vertex'],2)
            else:
                r=query('multipliers',**data)['sample']
                self.assertEqual(r['kawasaki'][0]['choppedAngle'],0)
                self.assertNotEqual(r['kawasaki'][0]['alternatingAngle'],0)

    def test_zero_denominator_has_original_undefined_state_but_tiny_nonzero_is_not_chopped(self):
        data={'foldPoints':[[0,0],[1,0]],'leftRulings':[[0,1],[0,1]],'rightRulings':[[0,-1],[0,-1]]}
        r=query('multipliers',**data)
        self.assertEqual(r['sample']['multipliers'],[None,None])
        self.assertEqual(r['sample']['quotients'][0]['state'],'original-zero-denominator')
        self.assertFalse(r['certification']['allSampledValuesFinite'])
        data['rightRulings']=[[-1e-13,-1],[-1e-13,-1]]
        r=query('multipliers',**data)['sample']
        self.assertTrue(r['allMultipliersFinite'])
        self.assertFalse(r['chopAppliedToDenominator'])
        self.assertGreater(abs(r['multipliers'][0]),1e12)

    def test_zero_direction_and_duplicate_points_do_not_produce_fake_rotations(self):
        for data in [
            {'foldPoints':[[0,0],[1,0]],'leftRulings':[[0,0],[0,1]],'rightRulings':[[0,-1],[0,-1]]},
            {'foldPoints':[[0,0],[0,0]],'leftRulings':[[0,1],[0,1]],'rightRulings':[[0,-1],[0,-1]]},
        ]:
            with self.assertRaisesRegex(generic.GenericDiscretizationError,'undefined-direction'):
                query('multipliers',**data)

    def test_resource_limits_are_explicit_and_unsafe_or_unused_inputs_are_rejected(self):
        invalid = [
            {'family':generic.FAMILY,'mode':'uniform','curve':['s'],'divisions':True,'parameterStart':0,'parameterEnd':1},
            {'family':generic.FAMILY,'mode':'uniform','curve':['s']*65,'divisions':4,'parameterStart':0,'parameterEnd':1},
            {'family':generic.FAMILY,'mode':'system','rules':[{'key':'x','expression':[[[[['s']]]]]}],'parameters':[0]},
            {'family':generic.FAMILY,'mode':'system','rules':[{'key':'x','expression':'__import__(s)'}],'parameters':[0]},
            {'family':generic.FAMILY,'mode':'system','rules':[],'parameters':[float('nan')]},
            {'family':generic.FAMILY,'mode':'system','rules':[],'parameters':[],'hiddenOption':True},
        ]
        for data in invalid:
            with self.subTest(data=data),self.assertRaises(ValueError):
                generic.query_discretization_generic(data)
        with patch.dict(generic.LIMITS,{'maximumScalarEvaluations':3}):
            with self.assertRaisesRegex(generic.GenericDiscretizationError,'evaluation-budget'):
                uniform(['s','s**2'])
        with patch.dict(generic.LIMITS,{'maximumAstWeightedEvaluations':1}):
            with self.assertRaisesRegex(generic.GenericDiscretizationError,'evaluation-budget'):
                query('system',rules=[{'key':'x','expression':'s+s'}],parameters=[0])
        with patch.dict(generic.LIMITS,{'maximumRootEvaluations':2}):
            with self.assertRaisesRegex(generic.GenericDiscretizationError,'root-budget'):
                uniform(['-s**2','s'])

    def test_certification_does_not_promote_a_numerical_root_to_wolfram_or_global_folding(self):
        r=uniform(['-s**2','s'])
        self.assertTrue(r['certification']['rootEquationNumericallyVerified'])
        for key in ('rootBranchEquivalentToWolfram','allRootsEnumerated','continuousDomainCertified',
                    'symbolicObjectsReproduced','wolframOptionsReproduced','adoptableCreasePattern','globalFoldingCertified'):
            self.assertFalse(r['certification'][key])
        self.assertEqual(r['source']['definitionCell'],'In[4089]')
        self.assertFalse(r['source']['wolframNumericOutAvailable'])
        json.dumps(r,allow_nan=False)

    def test_short_power_expansion_reserves_real_cartesian_work_before_allocation(self):
        expression='((1+1+1+1)**4)**2'
        small=query('system',rules=[{'key':'power','expression':expression}],parameters=[0])
        self.assertEqual(small['sample']['rules'][0]['values'],[65536.])
        self.assertGreaterEqual(small['sample']['budget']['offsetProducts'],65536)
        # This input fits the scalar/AST budgets but would otherwise request
        # more than four billion offset products. It must fail before expansion.
        with self.assertRaises(generic.GenericDiscretizationError) as caught:
            query('system',rules=[{'key':'same','expression':[expression]*4} for _ in range(64)],parameters=[0]*256)
        self.assertEqual(caught.exception.code,'evaluation-budget')
        details=caught.exception.details
        self.assertLessEqual(details['offsetProductsUsed'],generic.LIMITS['maximumOffsetProducts'])
        self.assertGreater(details['offsetProductsUsed']+details['requestedOffsetProducts'],details['offsetProductLimit'])
        # A budget error inside AST evaluation must not become a null sample.
        with patch.dict(generic.LIMITS,{'maximumOffsetProducts':16}):
            with self.assertRaisesRegex(generic.GenericDiscretizationError,'evaluation-budget'):
                query('system',rules=[{'key':'power','expression':expression}],parameters=[0])

    def test_arbitrary_precision_json_integer_overflow_is_a_tagged_input_refusal(self):
        huge=10**310
        inputs=[
            {'mode':'system','rules':[],'parameters':[huge]},
            {'mode':'uniform','curve':['s'],'divisions':4,'parameterStart':huge,'parameterEnd':1},
            {'mode':'multipliers','foldPoints':[[huge,0],[1,0]],'leftRulings':[[0,1],[0,1]],'rightRulings':[[0,-1],[0,-1]]},
        ]
        for data in inputs:
            with self.subTest(mode=data['mode']),self.assertRaises(generic.GenericDiscretizationError) as caught:
                generic.query_discretization_generic({'family':generic.FAMILY,**data})
            self.assertEqual(caught.exception.code,'finite-input-budget')


if __name__ == '__main__':
    unittest.main()
