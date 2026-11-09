"""Literal explicit Resample=True/InterpolationOrder=1 numerical contracts."""
import copy
import math
import unittest
import numpy as np

from tessellation_curved_generic_darboux import (
    FLATTEN_PRESET, RESHAPE_PRESET, GenericDarbouxError, query_flatten_generic,
    validate_generic_darboux_query,
)
from tessellation_curved_uniform_resample import UniformLinear


class UniformResampleTests(unittest.TestCase):
    def test_scalar_and_vector_linear_values_and_derivatives(self):
        scalar = UniformLinear(-1., 1., [[-1.], [0.], [1.]])
        vector = UniformLinear(-1., 1., [[-1., 3.], [0., 2.], [1., 1.]])
        self.assertEqual(scalar.evaluate(.25), ([.25], [1.]))
        self.assertEqual(vector.evaluate(.25), ([.25, 1.75], [1., -1.]))
        with self.assertRaises(ValueError): vector.evaluate(1.0001)
        # Explicit right derivative at an interior knot; left at final endpoint.
        bent = UniformLinear(0., 1., [[0.], [1.], [0.]])
        self.assertEqual(bent.evaluate(.5), ([1.], [-2.]))
        self.assertEqual(bent.evaluate(1.), ([0.], [-2.]))

    def test_original_in3886_cone_source_and_literal_piecewise_net(self):
        q = dict(FLATTEN_PRESET, baseCurve=['cos(pi/6)', '-sin(pi/6)*cos(s)', 'sin(pi/6)*sin(s)'],
                 director=['-cos(pi/6)', 'sin(pi/6)*cos(s)', '-sin(pi/6)*sin(s)'],
                 parameterEnd=math.pi, transverseStart=-1., transverseEnd=1., initialPoint=[1., 0.],
                 initialTangent=[0., 1.], segments=16, rulingSegments=4,
                 resample=True, interpolationPoints=8, interpolationOrder=1)
        r = query_flatten_generic(q)
        stamp = r['resampling']; self.assertEqual(len(stamp['parameters']), 9)
        self.assertEqual(stamp['parameters'], [i*math.pi/8 for i in range(9)])
        for row in r['sample']['rows']:
            x = row['s']*8/math.pi; j = min(7, math.floor(x)); w = x-j
            a = np.array([math.cos(j*math.pi/16), math.sin(j*math.pi/16)])
            b = np.array([math.cos((j+1)*math.pi/16), math.sin((j+1)*math.pi/16)])
            np.testing.assert_allclose(row['targetBase'], a+(b-a)*w, atol=4e-12, rtol=0)
            np.testing.assert_allclose(row['targetDirector'], -a-(b-a)*w, atol=4e-12, rtol=0)
            np.testing.assert_allclose(row['targetBaseDerivative'], (b-a)*8/math.pi, atol=4e-12, rtol=0)
        self.assertGreater(r['diagnostics']['maximumRelativeMetricDifference'], .09)
        self.assertFalse(r['certification']['formalIsometryCertified'])
        self.assertFalse(r['certification']['formalStripRegularityCertified'])
        self.assertEqual(r['domain']['formalStripRegularity']['status'], 'unknown')
        self.assertEqual(r['query'], q)

    def test_sampled_offgrid_initial_is_reported_without_moving_seed(self):
        q = dict(FLATTEN_PRESET, initialParameter=.37, initialPoint=[2., -3.],
                 resample=True, interpolationPoints=8, interpolationOrder=1)
        r = query_flatten_generic(q)
        self.assertEqual(r['query']['initialParameter'], .37)
        self.assertEqual(r['initial']['point'], [2., -3.])
        self.assertGreater(r['resampling']['initialNormalizedPointResidual'], 1e-5)
        self.assertGreater(r['resampling']['initialTangentResidual'], 1e-5)
        self.assertFalse(r['certification']['finiteMetricVerified'])
        self.assertFalse(r['certification']['adoptableCreasePattern'])

    def test_default_and_explicit_false_keep_continuous_contract(self):
        a = query_flatten_generic(dict(FLATTEN_PRESET, segments=8))
        b = query_flatten_generic(dict(FLATTEN_PRESET, segments=8, resample=False))
        self.assertNotIn('resampling', a); self.assertNotIn('resampling', b)
        self.assertEqual(a['sample'], b['sample']); self.assertEqual(a['grid'], b['grid'])
        self.assertTrue(a['certification']['formalIsometryCertified'])
        for changes in ({'resample': True}, {'resample': 1}, {'interpolationPoints': 8},
                        {'resample': False, 'interpolationPoints': 8},
                        {'resample': True, 'interpolationPoints': 8, 'interpolationOrder': 5},
                        {'resample': True, 'interpolationPoints': True, 'interpolationOrder': 1}):
            with self.assertRaises(GenericDarbouxError): validate_generic_darboux_query({**copy.deepcopy(FLATTEN_PRESET), **changes})
        with self.assertRaises(GenericDarbouxError): validate_generic_darboux_query({**RESHAPE_PRESET, 'resample': True, 'interpolationPoints': 8, 'interpolationOrder': 1})


if __name__ == '__main__': unittest.main()
