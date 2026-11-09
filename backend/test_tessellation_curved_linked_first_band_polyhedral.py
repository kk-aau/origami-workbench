"""Finite isometric paper paired with Origamica's saved perturbed first band."""

import math
import unittest

from tessellate import generate, validate_request


class LinkedFirstBandPolyhedralTests(unittest.TestCase):
    def test_saved_first_band_has_one_exactly_isometric_triangular_sheet(self):
        result = generate({'family': 'linked-first-band-polyhedral'})
        fold, source = result['fold'], result['source']
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (66, 129, 64))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(source['originalSavedCell'], 'In[4086]')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertFalse(source['sampledSmoothSpatialVerticesExact'])
        self.assertTrue(source['numericalDarbouxIntegration'])
        self.assertFalse(source['originalSmoothSurfaceExact'])
        self.assertFalse(source['wholeSavedPerturbedChainCertified'])
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertFalse(source['selfCollisionChecked'])
        self.assertEqual(len(source['foldedForm3D']), len(fold['vertices_coords']))
        self.assertLess(source['maximumFaceDistanceError'], 1e-12)
        self.assertLess(source['maximumFacePlaneError'], 1e-12)
        for face in fold['faces_vertices']:
            for i, a in enumerate(face):
                for b in face[i + 1:]:
                    self.assertAlmostEqual(
                        math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b]),
                        math.dist(source['foldedForm3D'][a], source['foldedForm3D'][b]),
                        places=11)

    def test_finite_companion_converges_to_saved_smooth_flat_boundaries(self):
        drifts = []
        for count in (8, 32, 96):
            result = generate({'family': 'linked-first-band-polyhedral',
                               'curveSegments': count})
            drifts.append(result['source']['maximumSmoothFlatLandmarkDrift'])
            self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
            self.assertLess(result['source']['maximumFaceDistanceError'], 1e-12)
        self.assertGreater(drifts[0], 10 * drifts[1])
        self.assertGreater(drifts[1], 4 * drifts[2])
        self.assertGreater(drifts[2], 0)

    def test_invalid_scope_is_rejected(self):
        for invalid in ({'curveSegments': True}, {'curveSegments': 7},
                        {'curveSegments': 97}, {'minimumAngleDeg': float('nan')},
                        {'minimumAngleDeg': 91}, {'variant': 'zero-chain'}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_request({'family': 'linked-first-band-polyhedral',
                                  **invalid})


if __name__ == '__main__':
    unittest.main()
