"""The original smooth flange is useful as a reference, never a fold result."""

import unittest

from tessellate import dispatch_request
from tessellation_twisted_pot_smooth_query import query_twisted_pot_smooth


SAVED = {'family': 'twisted-pot', 'flatFlanges': 'smooth', 'sectors': 12,
         'asymmetry': 1, 'goreTwist': 1, 'flangeRotationDeg': 25,
         'border': 'trimmed', 'flangeInset': .05}


class TwistedPotSmoothQueryTests(unittest.TestCase):
    def test_saved_smooth_trimmed_case_is_read_only_and_nonisometric(self):
        result = dispatch_request({'operation': 'twisted-pot-smooth-reference', **SAVED})
        self.assertEqual(result['family'], 'twisted-pot-smooth-reference')
        self.assertEqual((len(result['paper']['vertices']), len(result['paper']['edges']),
                          len(result['paper']['faces'])), (144, 384, 241))
        self.assertTrue(result['diagnostics']['paperGeometryPassed'])
        self.assertGreater(result['diagnostics']['maximumFaceDistanceError'], .18)
        self.assertLess(result['diagnostics']['maximumGoreEquationResidual'], 1e-9)
        self.assertFalse(result['certification']['metricPreserving'])
        self.assertFalse(result['certification']['adoptableCreasePattern'])
        self.assertNotIn('fold', result)

    def test_display_inset_does_not_change_source_geometry(self):
        inset = query_twisted_pot_smooth(SAVED)
        base = query_twisted_pot_smooth({**SAVED, 'flangeInset': 0})
        self.assertEqual(inset['paper'], base['paper'])
        self.assertEqual(inset['reference3D']['vertices'], base['reference3D']['vertices'])
        self.assertNotEqual(inset['reference3D']['displayVertices'],
                            base['reference3D']['displayVertices'])

    def test_rejects_wrong_mode_and_unsupported_parameters(self):
        for bad in ({**SAVED, 'flatFlanges': 'faceted'},
                    {**SAVED, 'flangeInset': -.1},
                    {**SAVED, 'extra': 1}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                query_twisted_pot_smooth(bad)


if __name__ == '__main__':
    unittest.main()
