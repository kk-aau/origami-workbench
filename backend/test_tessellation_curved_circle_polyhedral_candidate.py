"""Exact finite-paper companion to saved In[3992]/In[3995] cone folds."""

import math
import unittest

from tessellate import generate, validate_request


class CurvedCirclePolyhedralCandidateTests(unittest.TestCase):
    def test_saved_120_degree_circle_is_a_single_exact_isometric_paper(self):
        result = generate({'family': 'curved-circle-polyhedral'})
        fold, source = result['fold'], result['source']
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (99, 162, 64))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(source['originalSymbolicCell'], 'In[3992]')
        self.assertEqual(source['originalNumericalCell'], 'In[3995]')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertFalse(source['originalSmoothSurfaceExact'])
        self.assertLess(source['maximumFaceDistanceError'], 1e-12)
        self.assertLess(source['maximumFacePlaneError'], 1e-12)
        self.assertAlmostEqual(source['foldedForm3D'][0][0], 1., places=12)
        self.assertAlmostEqual(source['foldedForm3D'][0][1], 0., places=12)
        self.assertAlmostEqual(source['foldedForm3D'][33][0], .5, places=12)
        self.assertAlmostEqual(source['foldedForm3D'][33][2], math.sqrt(3) / 2,
                               places=12)
        for face in fold['faces_vertices']:
            for i, a in enumerate(face):
                for b in face[i + 1:]:
                    self.assertAlmostEqual(
                        math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b]),
                        math.dist(source['foldedForm3D'][a], source['foldedForm3D'][b]),
                        places=11)
        seam = [(edge, kind, angle) for edge, kind, angle in zip(
            fold['edges_vertices'], fold['edges_assignment'],
            fold['edges_foldAngle']) if max(edge) <= 32]
        self.assertEqual(len(seam), 32)
        self.assertTrue(all(kind == 'V' and 120 < angle < 121
                            for _, kind, angle in seam))

    def test_section_angle_correction_converges_to_smooth_development(self):
        drifts = []
        for count in (4, 16, 64):
            result = generate({'family': 'curved-circle-polyhedral',
                               'curveSegments': count})
            drifts.append(result['source']['maximumSmoothDevelopmentAngleDrift'])
            self.assertLess(result['source']['maximumFaceDistanceError'], 1e-11)
        self.assertGreater(drifts[0], 10 * drifts[1])
        self.assertGreater(drifts[1], 10 * drifts[2])
        self.assertGreater(drifts[2], 0)

    def test_parameter_changes_recompute_real_spatial_vertices(self):
        result = generate({'family': 'curved-circle-polyhedral',
                           'foldAngleDeg': 80, 'parameterStartPi': .25,
                           'parameterEndPi': .75, 'leftWidth': .5,
                           'rightWidth': 1.5, 'curveSegments': 12})
        self.assertEqual((result['stats']['vertices'], result['stats']['faces']),
                         (39, 24))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertLess(result['source']['maximumFaceDistanceError'], 1e-11)
        point = result['source']['foldedForm3D'][0]
        self.assertAlmostEqual(point[0], math.sqrt(.5), places=12)
        self.assertAlmostEqual(point[1], math.sqrt(.5), places=12)

    def test_invalid_domains_and_foreign_fields_are_rejected(self):
        for bad in (
                {'curveSegments': True}, {'curveSegments': 3},
                {'foldAngleDeg': 180}, {'leftWidth': 2},
                {'parameterStartPi': .995}, {'rightWidth': 0},
                {'unknown': 1}, {'minimumAngleDeg': float('nan')}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_request({'family': 'curved-circle-polyhedral', **bad})


if __name__ == '__main__':
    unittest.main()
