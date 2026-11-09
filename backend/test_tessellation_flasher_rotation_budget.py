"""Budget-derived m domain keeps the original static source checks."""
import copy
import math
import unittest

from tessellate import generate, validate_request
from tessellation_flasher import flasher_sector_quads


class FlasherRotationBudgetTests(unittest.TestCase):
    def test_high_height_boundary_rejects_inverted_or_unconverged_source_branches(self):
        for diagonal in ('X', 'Y', 'Z'):
            query = dict(family='flasher', rings=1, heightOrder=2,
                         rotationalOrder=74, radialIncrement=.05, diagonal=diagonal)
            before = copy.deepcopy(query)
            with self.subTest(diagonal=diagonal), self.assertRaisesRegex(ValueError, '反向面|未收敛'):
                generate(query)
            self.assertEqual(query, before)

    def test_default_r2h2_m17_is_legal_and_constructs_409_faces(self):
        result = generate(dict(family='flasher', rotationalOrder=17))
        self.assertEqual(result['stats']['faces'], 409)
        self.assertEqual(result['stats']['parameters']['rotationalOrder'], 17)
        self.assertTrue(result['source']['staticGlobalIsometryChecked'])
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')

    def test_m17_and_budget_maximum_m149_construct_all_source_diagonals(self):
        for m in (17, 149):
            for diagonal in ('X', 'Y', 'Z'):
                query = dict(family='flasher', rings=1, heightOrder=1, rotationalOrder=m,
                             radialIncrement=.05, diagonal=diagonal, minimumAngleDeg=10)
                with self.subTest(m=m, diagonal=diagonal):
                    before = copy.deepcopy(query)
                    result = generate(query)
                    self.assertEqual(query, before)
                    self.assertEqual(tuple(result['stats'][key] for key in ('vertices', 'edges', 'faces')),
                                     (4*m, 8*m, 4*m+1))
                    self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                    self.assertEqual(result['stats']['checks']['local']['status'], 'not_applicable')
                    self.assertEqual(result['stats']['checks']['layerOrder']['status'], 'not_checked')
                    self.assertTrue(result['source']['staticGlobalIsometryChecked'])
                    for flag in ('continuousRigidPathChecked', 'selfCollisionChecked', 'deployedPatternChecked'):
                        self.assertFalse(result['source'][flag])
                    flat = result['fold']['vertices_coords']
                    spatial = result['source']['foldedForm3D']
                    for face in result['fold']['faces_vertices']:
                        for i, a in enumerate(face):
                            for b in face[i+1:]:
                                self.assertLess(abs(math.dist(flat[a], flat[b])-math.dist(spatial[a], spatial[b])), 1e-8)

    def test_actual_face_budget_limits_each_factor_before_seed_allocation(self):
        for r in range(1, 10):
            for h in range(1, 10):
                if r*h > 9:
                    continue
                maximum = 599 // (2*r*(r+1)*h)
                params = validate_request(dict(family='flasher', rings=r, heightOrder=h,
                                               rotationalOrder=maximum))
                actual = maximum * (2*len(flasher_sector_quads(r, h, maximum))+2*r)+1
                self.assertLessEqual(actual, 600)
                self.assertEqual(params['rotationalOrder'], maximum)
                with self.assertRaises(ValueError):
                    validate_request(dict(family='flasher', rings=r, heightOrder=h,
                                          rotationalOrder=maximum+1))
        with self.assertRaisesRegex(ValueError, '600'):
            validate_request(dict(family='flasher', rings=1, heightOrder=2, rotationalOrder=75))

    def test_larger_rotation_does_not_admit_bad_numeric_or_radial_inputs(self):
        for patch in (dict(rotationalOrder=150), dict(rotationalOrder=17.5), dict(rotationalOrder=True),
                      dict(rotationalOrder=math.inf), dict(rotationalOrder=math.nan),
                      dict(rings=5, heightOrder=2), dict(radialIncrement=-.1), dict(diagonal='W')):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                validate_request({**dict(family='flasher', rings=1, heightOrder=1), **patch})


if __name__ == '__main__':
    unittest.main()
