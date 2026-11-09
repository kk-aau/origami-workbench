"""Original square-speed integral and true returned-speed regressions."""
import copy,sys,math,unittest
from pathlib import Path
import mpmath as mp
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_match_speed_generic import PRESET,query_match_curve_speed_generic,GenericCurveSpeedError

def q(**changes):return {**copy.deepcopy(PRESET),'segments':8,**changes}

class LiteralCurveSpeedTests(unittest.TestCase):
    def test_original_constant_speed_counterexample_is_not_repaired(self):
        r=query_match_curve_speed_generic(q(sourceCurve=['s','0']))
        for row in r['sample']['rows']:
            self.assertAlmostEqual(row['mappedParameter'],row['s']/4,13)
            self.assertEqual(row['sourceSpeed'],1);self.assertEqual(row['matchedTargetSpeed'],.5)
        self.assertTrue(r['certification']['finiteSquaredTransportVerified'])
        self.assertFalse(r['certification']['finiteActualSpeedMatchVerified'])
        self.assertFalse(r['source']['speedEquationRepaired'])

    def test_variable_source_and_target_match_the_independent_70digit_squared_speed_integral(self):
        query=q(sourceCurve=['s','s**2/4'],targetCurve=['s','s**2/2','s**3/6'],initialParameter=.37)
        r=query_match_curve_speed_generic(query)
        with mp.workdps(70):
            ui=mp.mpf(query['initialParameter'])
            for row in r['sample']['rows']:
                s=mp.mpf(row['s']);f=mp.mpf(row['mappedParameter'])
                # Integrals of |c1'|² and |c2'|², not their square roots.
                a=(s+s**3/12)-(ui+ui**3/12)
                b=(f+f**3/3+f**5/20)-(ui+ui**3/3+ui**5/20)
                self.assertLess(abs(a-b),mp.mpf('4e-11'))
                expected=(1+s*s/4)/(1+f*f+f**4/4)
                self.assertLess(abs(mp.mpf(row['mappedParameterDerivative'])-expected),mp.mpf('2e-15'))
        self.assertEqual(r['initial'],{'parameter':.37,'mappedParameter':.37})

    def test_original_two_curves_can_have_different_dimensions_and_a_stationary_first_source(self):
        r=query_match_curve_speed_generic(q(sourceCurve=['s'],targetCurve=['2*s','0','0']))
        self.assertEqual(len(r['sample']['rows'][0]['sourcePoint']),1)
        self.assertEqual(len(r['sample']['rows'][0]['matchedTargetPoint']),3)
        stationary=query_match_curve_speed_generic(q(sourceCurve=['1','2'],initialParameter=.3))
        self.assertTrue(all(row['mappedParameter']==.3 and row['mappedParameterDerivative']==0 for row in stationary['sample']['rows']))
        self.assertTrue(stationary['certification']['finiteActualSpeedMatchVerified'])

    def test_matched_function_does_not_require_c2_defined_at_the_unmapped_parameter(self):
        r=query_match_curve_speed_generic(q(sourceCurve=['s','0'],targetCurve=['sqrt(s+1)','0'],parameterStart=-1.1,parameterEnd=.1))
        first=r['sample']['rows'][0]
        self.assertIsNone(first['originalTargetPoint']);self.assertIsNone(first['normalizedOriginalTargetPoint'])
        self.assertAlmostEqual(first['mappedParameter'],math.exp(-4.4)-1,10)
        self.assertAlmostEqual(first['matchedTargetPoint'][0],math.exp(-2.2),10)

    def test_tiny_source_with_huge_translation_keeps_normalized_geometry(self):
        r=query_match_curve_speed_generic(q(sourceCurve=['1e9+1e-9*s','1e9'],targetCurve=['1e9+2e-9*s','1e9']))
        self.assertLess(r['normalization']['scale'],1e-8)
        self.assertAlmostEqual(r['sample']['rows'][-1]['normalizedMatchedTargetPoint'][0],1/3,12)
        self.assertAlmostEqual(r['sample']['rows'][-1]['mappedParameter'],.25,12)
        self.assertFalse(r['certification']['finiteActualSpeedMatchVerified'])

    def test_original_second_speed_zero_or_poles_are_rejected_without_repair(self):
        for changes in ({'targetCurve':['0','0']},{'targetCurve':['s**2','0']},{'targetCurve':['1/s','0']}):
            with self.assertRaises(GenericCurveSpeedError):query_match_curve_speed_generic(q(**changes))
        # Original f' can be zero; original second source's zero speed cannot be divided by.
        with self.assertRaises(GenericCurveSpeedError):query_match_curve_speed_generic(q(sourceCurve=['0'],targetCurve=['0']))

    def test_source_contract_and_false_certificates_remain_explicit(self):
        for changes in ({'initialParameter':2},{'parameterEnd':-.5},{'sourceCurve':['eval(s)']},{'segments':129},{'extra':True}):
            with self.assertRaises(GenericCurveSpeedError):query_match_curve_speed_generic(q(**changes))
        r=query_match_curve_speed_generic(q())
        for key in ('sourceWholeDomainCertified','integrationErrorIntervalCertified','adoptableCreasePattern','exactStraightCreaseFOLD','selfCollisionChecked'):
            self.assertFalse(r['certification'][key])

if __name__=='__main__':unittest.main(verbosity=2)
