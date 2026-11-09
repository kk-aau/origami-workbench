"""Origamica section 43 rectangular-pot formulas and static geometry."""

import math
import unittest

from tessellate import check_geometry
from tessellation_rectangular_pot import (
    _assemble, _wedge_rows, generate_rectangular_pot, validate_rectangular_pot,
)


FULL = {'family': 'rectangular-pot',
        'crossSection': [[0, 0], [1, 1], [1, 2], [1, 3], [2, 4]],
        'sectors': 5, 'panels': 5, 'asymmetry': 0,
        'gapHalfAngleDeg': 0, 'flangeExcess': 0,
        'typeMinimumAngleDeg': 10}
WEDGE = {**FULL, 'crossSection': [[.3, 0], [1, 1], [1, 2], [1, 3], [2, 4]],
         'sectors': 8, 'panels': 1, 'flangeExcess': .1}


def generate(data):
    return generate_rectangular_pot(validate_rectangular_pot(data), check_geometry)


def independent_max_face_distance(fold, spatial):
    flat = fold['vertices_coords']
    return max(abs(math.dist(flat[a], flat[b])-math.dist(spatial[a], spatial[b]))
               for face in fold['faces_vertices']
               for i, a in enumerate(face) for b in face[i+1:])


class RectangularPotTests(unittest.TestCase):
    def test_in3504_3505_smooth_saved_pots_are_statistically_isometric(self):
        # Notebook In[3504]/In[3505] evaluates this 21-point numerical
        # section, rather than a symbolic surface or an arbitrary spline.
        section = [[.5*math.sin(math.pi*i/20), math.cos(math.pi*i/20)-1]
                   for i in range(21)]
        self.assertAlmostEqual(section[0][1], 0)
        self.assertAlmostEqual(section[10][0], .5)
        self.assertAlmostEqual(section[-1][1], -2)
        for rho in (0, .3333):
            with self.subTest(asymmetry=rho):
                query = {**FULL, 'crossSection': section, 'sectors': 4,
                         'panels': 4, 'asymmetry': rho,
                         'flangeExcess': .5, 'typeMinimumAngleDeg': 30}
                result = generate(query)
                fold, source = result['fold'], result['source']
                self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                                  result['stats']['faces']), (425, 824, 400))
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                self.assertEqual(len(fold['vertices_coords']), len(source['foldedForm3D']))
                self.assertTrue(source['staticGlobalIsometryChecked'])
                self.assertFalse(source['continuousRigidPathChecked'])
                self.assertFalse(source['selfCollisionChecked'])
                self.assertLess(independent_max_face_distance(fold, source['foldedForm3D']), 1e-10)
                self.assertLess(source['maximumFacePlaneError'], 1e-10)
                self.assertAlmostEqual(source['flangeHalfHeight'],
                                       .5*math.tan(math.pi/4)*1.5, 12)
                self.assertEqual(result['stats']['parameters']['typeMinimumAngleDeg'], 30)

    def test_smooth_input_capacity_keeps_face_budget_and_old_twelve_points(self):
        section = [[.5*math.sin(math.pi*i/23), math.cos(math.pi*i/23)-1]
                   for i in range(24)]
        max_query = {**FULL, 'crossSection': section, 'sectors': 4,
                     'panels': 4, 'flangeExcess': .5}
        params = validate_rectangular_pot(max_query)
        self.assertEqual(len(params['crossSection']), 24)
        self.assertEqual(generate(max_query)['stats']['faces'], 460)
        with self.assertRaisesRegex(ValueError, '2–24'):
            validate_rectangular_pot({**max_query,
                'crossSection': section + [[0, -2.1]]})
        with self.assertRaisesRegex(ValueError, '600'):
            validate_rectangular_pot({**max_query, 'panels': 6, 'sectors': 6})
        twelve = {**max_query, 'crossSection': section[:12]}
        self.assertEqual(generate(twelve)['stats']['faces'], 220)

    def test_saved_whole_pot_example_is_single_rectangular_isometric_paper(self):
        result = generate(FULL)
        fold, source = result['fold'], result['source']
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (105, 204, 100))
        self.assertEqual(len(source['foldedForm3D']), len(fold['vertices_coords']))
        self.assertEqual(len(fold['edges_assignment']), len(fold['edges_vertices']))
        self.assertEqual(len(fold['edges_foldAngle']), len(fold['edges_vertices']))
        self.assertEqual(result['stats']['vertices']-result['stats']['edges']+
                         result['stats']['faces'], 1)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'not_applicable')
        self.assertEqual(source['spatialKind'], 'origamica-rectangular-pot')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertFalse(source['selfCollisionChecked'])
        self.assertLess(independent_max_face_distance(fold, source['foldedForm3D']), 1e-10)
        self.assertLess(source['maximumFacePlaneError'], 1e-10)
        self.assertEqual(min(y for _, y in fold['vertices_coords']), 0)
        self.assertAlmostEqual(max(y for _, y in fold['vertices_coords']),
                               2*source['flangeHalfHeight']*FULL['panels'])
        # Original h=max(w_i)*(1+fe), w_i=tan(pi/m-delta)*x_i.
        self.assertAlmostEqual(source['flangeHalfHeight'], 2*math.tan(math.pi/5), 12)
        self.assertAlmostEqual(source['gapSolutions'][0]['u'],
                               1/math.cos(math.pi/10)**2, 12)

    def test_saved_wedge_example_flange_excess_and_fold_types(self):
        result = generate(WEDGE)
        source = result['source']
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (30, 49, 20))
        self.assertAlmostEqual(source['flangeHalfHeight'],
                               2*math.tan(math.pi/8)*1.1, 12)
        self.assertAlmostEqual(source['gapSolutions'][0]['u'],
                               1/math.cos(math.pi/16)**2, 12)
        self.assertLess(independent_max_face_distance(result['fold'],
                         source['foldedForm3D']), 1e-10)
        params = validate_rectangular_pot(WEDGE)
        cp, xyz, _, h = _wedge_rows(params)
        coords, spatial, edges, _, _, ids = _assemble(params, cp, xyz, h)
        edge_type = {tuple(edge): kind for edge, kind in zip(
            result['fold']['edges_vertices'], result['fold']['edges_assignment'])}
        for letter, expected in [('b', 'M'), ('c', 'V'), ('d', 'V'), ('e', 'M')]:
            key = tuple(sorted((ids[0, letter, 1], ids[0, letter, 2])))
            self.assertEqual(edge_type[key], expected)
        self.assertEqual(len(coords), len(spatial))

    def test_panel_count_joins_shared_seams_without_welding_sheet_ends(self):
        params = validate_rectangular_pot({**FULL, 'panels': 3})
        cp, xyz, _, h = _wedge_rows(params)
        coords, spatial, _, _, _, ids = _assemble(params, cp, xyz, h)
        for panel in range(2):
            for row in range(len(params['crossSection'])):
                self.assertEqual(ids[panel, 'f', row], ids[panel+1, 'a', row])
        self.assertNotEqual(ids[0, 'a', 1], ids[2, 'f', 1])
        self.assertEqual((len(coords), len(spatial)), (65, 65))
        result = generate({**FULL, 'panels': 3})
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (65, 124, 60))
        self.assertLess(result['source']['maximumFaceDistanceError'], 1e-10)

    def test_extreme_and_intermidiate_asymmetry_and_finite_nonzero_gap(self):
        for rho in (-1, -.3333333333, 0, .3333333333, 1):
            with self.subTest(asymmetry=rho):
                result = generate({**FULL, 'asymmetry': rho})
                self.assertLess(result['source']['maximumFaceDistanceError'], 1e-10)
                self.assertTrue(all(math.isfinite(value)
                    for point in result['source']['foldedForm3D'] for value in point))
        self.assertAlmostEqual(generate({**FULL, 'asymmetry': 1})['source']['gapSolutions'][0]['u'], 1)
        gap = generate({**FULL, 'flangeExcess': .1, 'gapHalfAngleDeg': 1})
        self.assertLess(gap['source']['maximumFaceDistanceError'], 1e-10)
        self.assertTrue(all(row['s'] >= 0 and row['t'] >= 0
                            for row in gap['source']['gapSolutions']))

    def test_flat_flange_inset_is_display_only_for_both_original_extremes(self):
        for rho, letter in ((-1, 'b'), (1, 'e')):
            with self.subTest(asymmetry=rho):
                params = {**FULL, 'asymmetry': rho}
                original = generate(params)
                decorated = generate({**params, 'flatFlangeInset': .1})
                self.assertEqual(decorated['fold'], original['fold'])
                self.assertEqual(decorated['source']['foldedForm3D'],
                                 original['source']['foldedForm3D'])
                self.assertTrue(decorated['source']['staticGlobalIsometryChecked'])
                display = decorated['source']['flatFlangeDisplay']
                self.assertEqual(display['sourceLetter'], letter)
                self.assertEqual(display['fraction'], .1)
                self.assertTrue(display['displayOnly'])
                self.assertFalse(display['metricPreserving'])
                self.assertTrue(all(0 <= index < len(original['source']['foldedForm3D'])
                                    for index in display['vertexIndices']))
                self.assertNotIn('flatFlangeDisplay', original['source'])

    def test_invalid_domains_and_unresolved_gap_are_rejected(self):
        for patch in (
            {'crossSection': [[0, 0], [1, 1], [1, 0], [2, 2]]},
            {'crossSection': [[0, 0], [1, 1], [1, 1], [2, 2]]},
            {'crossSection': [[0, 0], [-1, 1], [2, 2]]},
            {'crossSection': [[0, 0], [1, float('nan')]]},
            {'sectors': 2}, {'panels': 31}, {'panels': 0},
            {'asymmetry': 1.1}, {'flangeExcess': -.1},
            {'flatFlangeInset': .1}, {'flatFlangeInset': -.1},
            {'flatFlangeInset': .6},
            {'typeMinimumAngleDeg': float('inf')},
            {'gapHalfAngleDeg': 18}, {'extraOption': 1},
        ):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                generate({**FULL, **patch})
        # The original source itself warns that a nonzero gap may have no
        # solution; with zero excess the widest row yields a negative wing.
        with self.assertRaises(ValueError):
            generate({**FULL, 'gapHalfAngleDeg': 1})


if __name__ == '__main__':
    unittest.main()
