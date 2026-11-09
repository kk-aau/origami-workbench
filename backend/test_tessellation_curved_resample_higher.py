import math
import unittest
import copy
import mpmath as mp
import numpy as np

from tessellation_curved_uniform_resample import UniformPolynomial
from tessellation_curved_generic_darboux import FLATTEN_PRESET, query_flatten_generic, GenericDarbouxError


def local_mp(samples, degree, s):
    """Independent 50-digit Vandermonde solve, not production Lagrange products."""
    n=len(samples)-1; x=mp.mpf(str(s))*n
    cell=min(n-1,int(mp.floor(x)));first=min(n-degree,max(0,cell-degree//2));z=x-first
    matrix=mp.matrix([[mp.mpf(j)**k for k in range(degree+1)] for j in range(degree+1)])
    coefficients=mp.lu_solve(matrix,mp.matrix(samples[first:first+degree+1]))
    value=sum(coefficients[k]*z**k for k in range(degree+1))
    derivative=sum(k*coefficients[k]*z**(k-1) for k in range(1,degree+1))*n
    return float(value),float(derivative)


class HigherResampleTests(unittest.TestCase):
    def test_original_in125_cubic_and_literal_quartic_reproduce_values_and_derivatives(self):
        for degree in (2,3,4):
            polynomial=(lambda x:1+.5*x*x-.5*x**3) if degree==3 else (lambda x:x**degree+.3*x+.2)
            derivative=(lambda x:x-1.5*x*x) if degree==3 else (lambda x:degree*x**(degree-1)+.3)
            values=[[polynomial(j/8),2*polynomial(j/8)] for j in range(9)]
            interpolation=UniformPolynomial(0.,1.,values,degree)
            for s in (.013,.19,.37,.71,.995):
                v,d=interpolation.evaluate(s)
                np.testing.assert_allclose(v,[polynomial(s),2*polynomial(s)],atol=4e-14,rtol=0)
                np.testing.assert_allclose(d,[derivative(s),2*derivative(s)],atol=6e-14,rtol=0)
            for j in range(9):self.assertEqual(interpolation.evaluate(j/8)[0],values[j])
            with self.assertRaises(ValueError):interpolation.evaluate(1.01)

    def test_nonlinear_data_are_continuous_at_knots_but_keep_both_actual_derivatives(self):
        values=[[math.sin(j/8)] for j in range(9)]
        interpolation=UniformPolynomial(0.,1.,values,3)
        left=interpolation.evaluate(.5,'left');right=interpolation.evaluate(.5,'right')
        self.assertEqual(left[0],right[0]);self.assertEqual(left[0],values[4])
        self.assertGreater(abs(left[1][0]-right[1][0]),1e-5)
        with mp.workdps(50):
            v,d=local_mp([mp.sin(mp.mpf(j)/8) for j in range(9)],3,.37)
        np.testing.assert_allclose(interpolation.evaluate(.37),[[v],[d]],atol=4e-14,rtol=0)

    def test_actual_four_stage_flatten_matches_independent_closed_base_and_high_precision_polynomials(self):
        for degree in (2,3,4):
            q={**copy.deepcopy(FLATTEN_PRESET),'resample':True,'interpolationPoints':8,'interpolationOrder':degree,
               'initialParameter':.37,'initialPoint':[2.,-3.],'segments':16,'rulingSegments':4}
            actual=query_flatten_generic(q)
            with mp.workdps(50):
                ui=mp.mpf('.37');angle=-mp.atan2(mp.mpf('.6')*ui**2,mp.sqrt(1+mp.mpf('.04')*ui**2))
                c,h=mp.cos(angle),mp.sin(angle)
                primitive=lambda s:mp.mpf('.5')*s*mp.sqrt(1+mp.mpf('.04')*s*s)+mp.mpf('2.5')*mp.asinh(mp.mpf('.2')*s)
                b=lambda s:[c*(primitive(s)-primitive(ui))-h*mp.mpf('.2')*(s**3-ui**3),
                            h*(primitive(s)-primitive(ui))+c*mp.mpf('.2')*(s**3-ui**3)]
                samples=[b(mp.mpf(j)/8) for j in range(9)]
                for row in actual['sample']['rows']:
                    for k,offset in enumerate((2.,-3.)):
                        value,derivative=local_mp([p[k] for p in samples],degree,row['s'])
                        self.assertAlmostEqual(row['targetBase'][k],offset+value,places=10)
                        self.assertAlmostEqual(row['targetBaseDerivative'][k],derivative,places=10)
            self.assertEqual(actual['query'],q)
            self.assertFalse(actual['certification']['formalIsometryCertified'])
            self.assertFalse(actual['certification']['adoptableCreasePattern'])
            polynomial=actual['resampling']['polynomial']
            self.assertEqual(polynomial['auditedKnotSides'],14)
            self.assertFalse(polynomial['wolframDefaultAlgorithmReproduced'])
            self.assertFalse(polynomial['originalAutomaticPointsReproduced'])
            self.assertGreater(actual['diagnostics']['maximumFrameResidual'],1e-12)

    def test_more_samples_and_higher_degree_are_real_curve_output_not_false_exact_metric_flags(self):
        errors=[]
        for degree in (1,2,3,4):
            r=query_flatten_generic({**FLATTEN_PRESET,'resample':True,'interpolationPoints':8,'interpolationOrder':degree,'segments':16})
            errors.append(r['diagnostics']['maximumRelativeMetricDifference'])
            self.assertFalse(r['certification']['formalIsometryCertified'])
        self.assertTrue(all(a>b for a,b in zip(errors,errors[1:])))
        self.assertLess(errors[3],1e-6)

    def test_automatic_and_unsupported_orders_are_never_silently_guessed_or_reduced(self):
        for changes in ({'interpolationPoints':'Automatic'},{'interpolationOrder':'Automatic'}, {'interpolationOrder':5},
                        {'interpolationOrder':True},{'interpolationOrder':0}):
            q={**FLATTEN_PRESET,'resample':True,'interpolationPoints':8,'interpolationOrder':3,**changes}
            with self.assertRaisesRegex(GenericDarbouxError,'input-contract'):query_flatten_generic(q)


if __name__=='__main__':unittest.main()
