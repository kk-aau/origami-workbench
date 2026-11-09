"""Origamica In[3520] faceted twisted pot: spatial metric and branch checks."""

import math
import unittest

from tessellate import check_geometry
from tessellation_twisted_pot import generate_twisted_pot, validate_twisted_pot


COARSE = {
    'family': 'twisted-pot',
    'crossSection': [[0, 0], [1, 0], [1, .5], [1.5, 1], [1, 1.5], [1, 2]],
    'sectors': 12, 'asymmetry': 1, 'goreTwist': 1,
    'flangeRotationDeg': 25, 'border': 'planar',
}

FINE = {
    'family': 'twisted-pot',
    'crossSection': [
        [0, 0], [.201973165620801, 0],
        [.24551521390921868, .04929828350861052],
        [.29103491611100674, .09719117040644294],
        [.3388464527060197, .14962845353074342],
        [.3844362844792038, .20295497962034656],
        [.42712836236230056, .2575101758008096],
        [.4701991399309364, .31986097513766437],
        [.5030814933671452, .37584120420889644],
    ],
    'sectors': 6, 'asymmetry': 1, 'goreTwist': 1,
    'flangeRotationDeg': -8, 'border': 'planar',
}


def maximum_face_metric_error(fold, spatial):
    worst = 0.
    for face in fold['faces_vertices']:
        for j, a in enumerate(face):
            for b in face[j+1:]:
                worst = max(worst, abs(math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b])
                                       - math.dist(spatial[a], spatial[b])))
    return worst


class TwistedPotTests(unittest.TestCase):
    def test_saved_coarse_input_without_display_inset_is_one_isometric_paper_disk(self):
        result = generate_twisted_pot(COARSE, check_geometry)
        fold, source = result['fold'], result['source']
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (156, 420, 265))
        self.assertEqual(156-420+265, 1)
        self.assertEqual(len(source['foldedForm3D']), 156)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(set(fold['edges_assignment']), {'M', 'V', 'B', 'U'})
        self.assertLess(maximum_face_metric_error(fold, source['foldedForm3D']), 1e-9)
        self.assertLess(max(source['goreEquationResiduals']), 1e-9)
        self.assertLess(max(source['flangeEquationResiduals']), 1e-9)
        self.assertGreater(max(p[2] for p in source['foldedForm3D']), 1.9)
        self.assertGreater(max(math.dist(cp, xyz[:2]) for cp, xyz in
                               zip(fold['vertices_coords'], source['foldedForm3D'])), .2)
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertFalse(source['continuousRigidPathChecked'])
        # This value is computed from the saved input and In[3520] equations;
        # the notebook does not store a machine-readable Wolfram coordinate Out.
        self.assertAlmostEqual(source['goreTwistAnglesRad'][1], .248205998584468, 9)

    def test_saved_fine_input_without_display_inset_and_trimmed_border(self):
        result = generate_twisted_pot(FINE, check_geometry)
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (132, 372, 241))
        self.assertLess(maximum_face_metric_error(result['fold'],
                                                 result['source']['foldedForm3D']), 1e-9)
        self.assertLess(max(result['source']['flangeEquationResiduals']), 1e-8)
        planar = generate_twisted_pot(COARSE, check_geometry)
        trimmed = generate_twisted_pot({**COARSE, 'border': 'trimmed'}, check_geometry)
        self.assertEqual((trimmed['stats']['vertices'], trimmed['stats']['edges'],
                          trimmed['stats']['faces']), (144, 384, 241))
        for output in (planar, trimmed):
            fold = output['fold']
            self.assertEqual(fold['edges_assignment'].count('B'), 36)
            self.assertLess(maximum_face_metric_error(fold, output['source']['foldedForm3D']), 1e-9)
            boundary = {v for (a, b), kind in zip(fold['edges_vertices'], fold['edges_assignment'])
                        if kind == 'B' for v in (a, b)}
            zs = [output['source']['foldedForm3D'][v][2] for v in boundary]
            if output is planar:
                self.assertLess(max(zs)-min(zs), 1e-10)
            else:
                self.assertGreater(max(zs)-min(zs), .4)

    def test_saved_flange_inset_only_decorates_3d_display(self):
        for rho, letter in ((-1, 'p'), (1, 'r')):
            with self.subTest(asymmetry=rho):
                params = {**COARSE, 'asymmetry': rho}
                original = generate_twisted_pot(params, check_geometry)
                decorated = generate_twisted_pot({**params, 'flangeInset': .05}, check_geometry)
                self.assertEqual(decorated['fold'], original['fold'])
                self.assertEqual(decorated['source']['foldedForm3D'],
                                 original['source']['foldedForm3D'])
                display = decorated['source']['flatFlangeDisplay']
                self.assertEqual(display['sourceLetter'], letter)
                self.assertEqual(display['fraction'], .05)
                self.assertEqual(len(display['vertexIndices']),
                                 COARSE['sectors']*(len(COARSE['crossSection'])-3))
                self.assertTrue(display['displayOnly'])
                self.assertFalse(display['metricPreserving'])
                self.assertNotIn('flatFlangeDisplay', original['source'])
                self.assertLess(maximum_face_metric_error(decorated['fold'],
                    decorated['source']['foldedForm3D']), 1e-9)

    def test_both_gore_diagonals_and_both_flange_directions_keep_real_isometry(self):
        for rho in (-1, 1):
            for tau in (-1, 1):
                for zeta in (-8, 8):
                    with self.subTest(rho=rho, tau=tau, zeta=zeta):
                        result = generate_twisted_pot({**COARSE, 'asymmetry': rho,
                                                       'goreTwist': tau, 'flangeRotationDeg': zeta},
                                                      check_geometry)
                        self.assertLess(maximum_face_metric_error(result['fold'],
                                                                 result['source']['foldedForm3D']), 1e-9)
                        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                        self.assertEqual(result['fold']['edges_assignment'][0], 'V')
                        self.assertTrue(all(math.isfinite(v) for p in result['source']['foldedForm3D']
                                            for v in p))

    def test_original_fixed_flange_fold_type_survives_angle_based_assignment(self):
        from tessellation_twisted_pot import _assemble, _faceted_flange, _gore_rows
        params = validate_twisted_pot(COARSE)
        _, _, _, initial, _, *_ = _assemble(params, _faceted_flange(params, _gore_rows(params)))
        assignments = generate_twisted_pot(COARSE, check_geometry)['fold']['edges_assignment']
        self.assertTrue(any(kind == 'V' for kind in initial))
        for kind, actual in zip(initial, assignments):
            if kind != 'U':
                self.assertEqual(actual, kind)

    def test_downward_profile_reverses_original_seeded_cross_section_type(self):
        downward = {**COARSE,
                    'crossSection': [[x, -z] for x, z in COARSE['crossSection']],
                    'typeMinimumAngleDeg': 10}
        result = generate_twisted_pot(downward, check_geometry)
        self.assertEqual(result['fold']['edges_assignment'][0], 'M')
        self.assertLess(maximum_face_metric_error(result['fold'],
                                                 result['source']['foldedForm3D']), 1e-9)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')

    def test_rejects_nonisometric_smooth_mode_and_bad_profile(self):
        invalid = [
            {'flatFlanges': 'smooth'}, {'flangeInset': -.05},
            {'flangeInset': .6},
            {'asymmetry': 0}, {'goreTwist': 0}, {'border': 'polygon'},
            {'crossSection': [[0, 0], [1, .1], [1, .5], [1, 1]]},
            {'crossSection': [[0, 0], [1, 0], [1, .5], [1, .4]]},
            {'crossSection': [[0, 0], [1, 0], [1, .5]]},
        ]
        for change in invalid:
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_twisted_pot({**COARSE, **change})


if __name__ == '__main__':
    unittest.main()
