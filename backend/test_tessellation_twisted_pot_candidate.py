"""Studio dispatch must retain the verified isometric twisted-pot subset."""

import unittest

from tessellate import generate, validate_request


class TwistedPotCandidateTests(unittest.TestCase):
    def test_default_candidate_has_developed_paper_and_real_static_faces(self):
        response = generate({'family': 'twisted-pot'})
        fold, source, stats = response['fold'], response['source'], response['stats']
        self.assertEqual((stats['vertices'], stats['edges'], stats['faces']),
                         (78, 210, 133))
        self.assertEqual(stats['checks']['geometry']['status'], 'passed')
        self.assertEqual(stats['checks']['local']['status'], 'not_applicable')
        self.assertEqual(source['spatialKind'], 'origamica-twisted-pot')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertEqual(len(fold['vertices_coords']), len(source['foldedForm3D']))
        self.assertLess(source['maximumFaceDistanceError'], 1e-9)

    def test_display_only_inset_and_nonisometric_smooth_mode_reject(self):
        params = validate_request({'family': 'twisted-pot', 'flangeInset': .05})
        self.assertEqual(params['flangeInset'], .05)
        baseline = generate({'family': 'twisted-pot'})
        displayed = generate({'family': 'twisted-pot', 'flangeInset': .05})
        self.assertEqual(displayed['fold'], baseline['fold'])
        self.assertEqual(displayed['source']['foldedForm3D'], baseline['source']['foldedForm3D'])
        self.assertEqual(displayed['source']['flatFlangeDisplay']['fraction'], .05)
        with self.assertRaisesRegex(ValueError, 'smooth'):
            validate_request({'family': 'twisted-pot', 'flatFlanges': 'smooth'})


if __name__ == '__main__':
    unittest.main()
