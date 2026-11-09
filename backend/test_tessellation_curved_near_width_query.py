import math
import unittest
from tessellation_curved_near_width_query import PRESET, query_near_width, validate_near_width_query


class GenericNearWidthTests(unittest.TestCase):
    def test_original_saved_formula_and_derivative(self):
        r = query_near_width(PRESET)
        self.assertTrue(r['certification']['fullDomainFormulaCertified'])
        for row in r['sample']['rows']:
            s = row['s']
            self.assertAlmostEqual(row['scale'], 1/math.cos(s), places=12)
            self.assertAlmostEqual(row['scaleDerivative'], math.sin(s)/math.cos(s)**2, places=12)
            self.assertAlmostEqual(row['outer'][0], s+.5*math.tan(s), places=12)
            self.assertAlmostEqual(row['outer'][1], .5, places=12)
        self.assertFalse(r['source']['wolframInterpolationReproduced'])

    def test_nonunit_director_preserves_literal_formula_without_normalization(self):
        r = query_near_width({**PRESET, 'baseCurve': ['s', '.2*s**2'], 'director': ['.6', '1'], 'parameterEnd': .6})
        for row in r['sample']['rows']:
            s = row['s']; projection = (.6+.4*s)/math.sqrt(1+.16*s*s)
            self.assertAlmostEqual(row['scale'], 1/math.sqrt(1-projection**2), places=12)
            self.assertEqual(row['director'], [.6, 1.])
        self.assertGreater(r['sample']['rows'][0]['localPerpendicularDistance'], .5)
        self.assertFalse(r['certification']['nearestFootDistanceChecked'])

    def test_spatial_helix_formula_and_negative_or_zero_width(self):
        q = {**PRESET, 'baseCurve': ['cos(s)', 'sin(s)', 's/2'], 'director': ['0', '0', '1'], 'parameterEnd': 1.5}
        for width in (.5, -.5, 0):
            r = query_near_width({**q, 'width': width})
            self.assertTrue(r['certification']['fullDomainFormulaCertified'])
            for row in r['sample']['rows']:
                self.assertAlmostEqual(row['scale'], math.sqrt(5)/2, places=12)
                self.assertAlmostEqual(row['outer'][2]-row['base'][2], width*math.sqrt(5)/2, places=12)
                self.assertAlmostEqual(row['localPerpendicularDistance'], abs(width), places=12)
        self.assertFalse(r['certification']['spatialDevelopabilityChecked'])

    def test_tiny_curve_with_large_translation_keeps_normalized_geometry(self):
        q = {**PRESET, 'baseCurve': ['s', '.2*s**2'], 'director': ['.6', '1'], 'parameterEnd': .6, 'width': .1}
        plain = query_near_width(q)
        tiny = query_near_width({**q, 'baseCurve': ['1e9+1e-8*s', '-1e9+1e-8*.2*s**2'], 'width': 1e-9})
        for a, b in zip(plain['sample']['rows'], tiny['sample']['rows']):
            self.assertAlmostEqual(a['scale'], b['scale'], places=12)
            for key in ('normalizedBase', 'normalizedOuter'):
                for x, y in zip(a[key], b[key]): self.assertAlmostEqual(x, y, places=12)

    def test_interior_stationary_point_is_never_certified_from_regular_samples(self):
        r = query_near_width({**PRESET, 'baseCurve': ['(s-.1)**2', '0'], 'director': ['0', '1'], 'parameterEnd': 1, 'segments': 8})
        self.assertEqual(r['proof']['status'], 'unknown')
        self.assertTrue(any(a <= .1 <= b for a, b in r['proof']['unresolved']))
        self.assertFalse(r['certification']['fullDomainFormulaCertified'])

    def test_small_nonzero_source_denominator_is_not_a_singularity(self):
        r = query_near_width({**PRESET, 'baseCurve': ['s/(1e-8*1e-8)', '0'],
                              'director': ['0', '1'], 'parameterEnd': .25})
        self.assertTrue(r['certification']['fullDomainFormulaCertified'])
        for row in r['sample']['rows']:
            self.assertEqual(row['scale'], 1.)
            self.assertAlmostEqual(row['outer'][1], .5, places=12)

    def test_invalid_functions_and_real_domain_are_distinct(self):
        for patch in ({'director': ['1', '0']}, {'baseCurve': ['0', '0']}, {'baseCurve': ['sqrt(s-.1)', '0']},
                      {'director': ['__import__("os")', '1']}, {'director': ['s.__class__', '1']},
                      {'director': ['0', '0', '1']}, {'segments': True}, {'width': True}, {'extra': 1}):
            with self.subTest(patch=patch), self.assertRaises(ValueError): query_near_width({**PRESET, **patch})
        with self.assertRaises(ValueError): validate_near_width_query([])


if __name__ == '__main__': unittest.main()
