"""Origamica section 43 MakeRadialPot / PotPlanar regression tests."""

import math
import unittest
from unittest.mock import patch

from tessellate import generate, validate_request


EXAMPLE = {
    'family': 'radial-pot',
    'crossSection': [[0, 0], [1, 1], [1, 2], [1, 3], [2, 4]],
    'sectors': 5,
    'asymmetry': 0,
    'gapHalfAngleDeg': 3,
    'typeMinimumAngleDeg': 10,
    'border': 'planar',
}


class RadialPotTests(unittest.TestCase):
    def test_saved_in_3480_has_real_isometric_spatial_faces(self):
        result = generate(EXAMPLE)
        fold, source = result['fold'], result['source']
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (101, 200, 100))
        self.assertEqual(len(source['foldedForm3D']), len(fold['vertices_coords']))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'not_applicable')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertEqual(source['spatialKind'], 'origamica-radial-pot')
        self.assertLess(source['maximumFaceDistanceError'], 1e-10)
        self.assertLess(source['maximumFacePlaneError'], 1e-10)
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertFalse(source['selfCollisionChecked'])
        self.assertEqual(result['stats']['vertices']-result['stats']['edges']+
                         result['stats']['faces'], 1)  # one connected paper disk
        self.assertEqual(len(fold['edges_assignment']), len(fold['edges_vertices']))
        self.assertEqual(len(fold['edges_foldAngle']), len(fold['edges_vertices']))
        self.assertEqual(set(fold['edges_assignment']), {'B', 'M', 'V', 'U'})
        # Original row formula: r_2=sqrt(2), width_2=tan(pi/5-3°).
        self.assertAlmostEqual(source['gapSolutions'][1]['radius'], math.sqrt(2), 12)
        self.assertAlmostEqual(source['gapSolutions'][1]['u'], 1.1500676697685412, 9)
        self.assertAlmostEqual(source['gapSolutions'][1]['s'], 0.1453507227816852, 9)

    def test_zero_gap_up_down_flat_bottom_and_extreme_asymmetry(self):
        for section in (
            [[0, 0], [1, 1], [1, 2], [2, 3]],
            [[0, 0], [1, -1], [1, -2], [2, -3]],
            [[0, 0], [1, 0], [1, 1], [2, 2]],
        ):
            for rho in (-1, 0, 1):
                with self.subTest(section=section, asymmetry=rho):
                    result = generate({**EXAMPLE, 'crossSection': section,
                                       'asymmetry': rho, 'gapHalfAngleDeg': 0})
                    self.assertTrue(result['source']['staticGlobalIsometryChecked'])
                    self.assertLess(result['source']['maximumFaceDistanceError'], 1e-9)
                    self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                    self.assertTrue(all(math.isfinite(v) for p in result['source']['foldedForm3D'] for v in p))
                    self.assertTrue(all(row['u'] == 1 for row in result['source']['gapSolutions'][1:]))

    def test_original_flat_flange_inset_only_changes_display_metadata(self):
        for rho, letter in ((-1, 'b'), (1, 'e')):
            with self.subTest(asymmetry=rho):
                params = {**EXAMPLE, 'asymmetry': rho, 'gapHalfAngleDeg': 0}
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
                self.assertTrue(display['vertexIndices'])
                self.assertTrue(all(0 <= index < len(original['source']['foldedForm3D'])
                                    for index in display['vertexIndices']))
                self.assertNotIn('flatFlangeDisplay', original['source'])

    def test_notebook_radial_fold_types_for_upward_pot(self):
        # The original code fixes b/e radial creases opposite to c/d for z>0.
        from tessellation_radial_pot import _assemble, _wedge_rows, _edge_assignments
        params = validate_request({**EXAMPLE, 'gapHalfAngleDeg': 0})
        cp, xyz, _, flat_bottom = _wedge_rows(params)
        coords, spatial, edges, initial, faces, ids, _ = _assemble(params, cp, xyz, flat_bottom)
        types, _ = _edge_assignments(coords, spatial, edges, initial, faces, 0)
        edge_type = {tuple(edge): kind for edge, kind in zip(edges, types)}
        for letter, expected in [('b', 'M'), ('c', 'V'), ('d', 'V'), ('e', 'M')]:
            key = tuple(sorted((ids[0, letter, 1], ids[0, letter, 2])))
            self.assertEqual(edge_type[key], expected)

    def test_original_polygon_border_adds_one_corner_per_wedge(self):
        planar = generate(EXAMPLE)
        polygon = generate({**EXAMPLE, 'border': 'polygon'})
        self.assertEqual(polygon['stats']['vertices'], planar['stats']['vertices']+5)
        self.assertEqual(polygon['stats']['edges'], planar['stats']['edges']+5)
        self.assertEqual(polygon['stats']['faces'], planar['stats']['faces'])
        self.assertLess(polygon['source']['maximumFaceDistanceError'], 1e-10)
        self.assertLess(polygon['source']['maximumFacePlaneError'], 1e-10)
        radius = polygon['source']['gapSolutions'][-1]['radius']
        expected = [radius, radius*math.tan(math.pi/5)]
        self.assertTrue(any(math.dist(p, expected)<1e-10 for p in polygon['fold']['vertices_coords']))
        # In the original source rho=±1 uses the normal boundary, with no
        # additional polygon-corner vertex.
        for rho in (-1, 1):
            with self.subTest(asymmetry=rho):
                ordinary = generate({**EXAMPLE, 'border': 'planar',
                                     'asymmetry': rho, 'gapHalfAngleDeg': 0})
                special = generate({**EXAMPLE, 'border': 'polygon',
                                    'asymmetry': rho, 'gapHalfAngleDeg': 0})
                self.assertEqual(special['fold']['vertices_coords'], ordinary['fold']['vertices_coords'])

    def test_default_circular_border_uses_original_inscribed_five_degree_arcs(self):
        circle = generate({**EXAMPLE, 'border': 'circular'})
        explicit_ccw = generate({**EXAMPLE, 'border': 'circular', 'arcDirection': 'CCW'})
        self.assertEqual(explicit_ccw['fold'], circle['fold'])
        fold = circle['fold']
        self.assertEqual(circle['stats']['faces'], 100)
        self.assertEqual(circle['stats']['vertices'], 161)
        self.assertEqual(circle['stats']['edges'], 260)
        self.assertLess(circle['source']['maximumFaceDistanceError'], 1e-10)
        radius = circle['source']['gapSolutions'][-1]['radius']
        boundary = {vertex for edge, kind in zip(fold['edges_vertices'], fold['edges_assignment'])
                    if kind == 'B' for vertex in edge}
        self.assertGreater(len(boundary), 50)
        self.assertTrue(all(abs(math.hypot(*fold['vertices_coords'][v])-radius)<1e-8
                            for v in boundary))
        coarser = generate({**EXAMPLE, 'border': 'circular', 'arcMaximumAngleDeg': 10})
        self.assertLess(coarser['stats']['vertices'], circle['stats']['vertices'])
        self.assertLess(coarser['source']['maximumFaceDistanceError'], 1e-10)
        for options in ({'arcDivisions': 4}, {'arcMethod': 'circumscribed'},
                        {'arcDivisions': 4, 'arcMethod': 'circumscribed'}):
            with self.subTest(options=options):
                other = generate({**EXAMPLE, 'border': 'circular', **options})
                self.assertGreater(other['stats']['vertices'], circle['stats']['vertices'])
                self.assertLess(other['source']['maximumFaceDistanceError'], 1e-10)

    def test_circular_border_skips_collapsed_flange_at_both_extreme_asymmetries(self):
        for rho in (-1, 1):
            for method, counts in (('inscribed', (141, 220, 80)),
                                   ('circumscribed', (161, 240, 80))):
                with self.subTest(asymmetry=rho, arcMethod=method):
                    result = generate({**EXAMPLE, 'asymmetry': rho,
                                       'gapHalfAngleDeg': 0, 'border': 'circular',
                                       'arcMethod': method, 'flatFlangeInset': .1})
                    stats, fold, source = result['stats'], result['fold'], result['source']
                    self.assertEqual((stats['vertices'], stats['edges'], stats['faces']), counts)
                    self.assertEqual(stats['vertices']-stats['edges']+stats['faces'], 1)
                    self.assertEqual(stats['checks']['geometry']['status'], 'passed')
                    self.assertLess(source['maximumFaceDistanceError'], 1e-9)
                    self.assertLess(source['maximumFacePlaneError'], 1e-9)
                    self.assertEqual(len(fold['vertices_coords']), len(source['foldedForm3D']))
                    self.assertTrue(source['flatFlangeDisplay']['displayOnly'])
                    if method == 'inscribed':
                        radius = source['gapSolutions'][-1]['radius']
                        boundary = {vertex for edge, kind in zip(fold['edges_vertices'],
                            fold['edges_assignment']) if kind == 'B' for vertex in edge}
                        self.assertTrue(all(abs(math.hypot(*fold['vertices_coords'][index])-radius)<1e-8
                                            for index in boundary))

    def test_invalid_profile_gap_and_unsupported_border_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'ArcDirection=CW'):
            generate({**EXAMPLE, 'border': 'circular', 'arcDirection': 'CW'})
        bad = [
            {'crossSection': [[0, 0], [1, 1], [1, 0], [2, 2]]},
            {'crossSection': [[0, 0], [1, 1], [1, 1], [2, 2]]},
            {'crossSection': [[0, 0], [-1, 1], [1, 2]]},
            {'gapHalfAngleDeg': 18},
            {'sectors': True},
            {'border': 'unknown'},
            {'border': 'circular', 'arcMaximumAngleDeg': .1},
            {'border': 'circular', 'arcDivisions': 0},
            {'border': 'circular', 'arcMethod': 'unknown'},
            {'border': 'circular', 'arcDirection': 'CW'},
            {'border': 'circular', 'arcDirection': 'unknown'},
            {'border': 'planar', 'arcDirection': 'CCW'},
            {'border': 'planar', 'arcMaximumAngleDeg': 5},
            {'border': 'polygon', 'arcMethod': 'inscribed'},
            {'flatFlangeInset': .1},
            {'flatFlangeInset': -.1},
            {'flatFlangeInset': .6},
            {'paper': {'shape': 'square', 'margin': .1}},
            {'crossSection': [[0, 0], [1, float('nan')], [2, 3]]},
        ]
        for patch in bad:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                generate({**EXAMPLE, **patch})

    def test_saved_profile_clockwise_major_arcs_fail_single_paper_gate(self):
        # In[315] changes a2 to a2-2π for CW when a2>a1. For the
        # In[3480] pot, each intended small outer arc becomes a major arc.
        import tessellation_radial_pot as pot
        from tessellate import check_geometry

        def original_cw_arc(start, end, maximum_angle, minimum_divisions, method):
            a1, a2 = math.atan2(start[1], start[0]), math.atan2(end[1], end[0])
            if a2 > a1:
                a2 -= math.tau
            sweep = abs(a2-a1)
            divisions = max(minimum_divisions,
                            math.ceil(sweep/math.radians(maximum_angle)-1e-10))
            r1, r2 = math.hypot(*start), math.hypot(*end)
            factor = 1 if method == 'inscribed' else 1/math.cos(sweep/(2*divisions))
            weights = (range(1, divisions) if method == 'inscribed'
                       else (i+.5 for i in range(divisions)))
            return [start]+[
                pot._scaled(pot._unit(a1*(1-w)+a2*w), factor*r1**(1-w)*r2**w)
                for w in (i/divisions for i in weights)
            ]+[end]

        saved = pot.validate_radial_pot({**EXAMPLE, 'border': 'circular'})
        rows2, _, _, _ = pot._wedge_rows(saved)
        radius = rows2['a'][-1][0]
        def minor_sweep(first, second):
            end = pot._ray_circle(rows2[second][-1],
                                  pot._sub(rows2[second][-1], rows2[second][-2]),
                                  radius)
            start_angle = math.atan2(rows2[first][-1][1], rows2[first][-1][0])
            end_angle = math.atan2(end[1], end[0])
            return (end_angle-start_angle) % math.tau
        ab, ef = minor_sweep('a', 'b'), minor_sweep('e', 'f')
        self.assertTrue(14 < math.degrees(ab) < 16)
        self.assertTrue(14 < math.degrees(ef) < 16)
        self.assertGreater(math.degrees(math.tau-ab), 344)
        self.assertGreater(math.degrees(math.tau-ef), 344)
        with patch.object(pot, '_polygonal_ellipse_arc', original_cw_arc):
            for rho in (-1, 0, 1):
                for method in ('inscribed', 'circumscribed'):
                    with self.subTest(asymmetry=rho, arcMethod=method), self.assertRaises(ValueError):
                        params = pot.validate_radial_pot({
                            **EXAMPLE, 'border': 'circular', 'asymmetry': rho,
                            'arcMethod': method, 'arcMaximumAngleDeg': 30,
                            'gapHalfAngleDeg': 0 if abs(rho) == 1 else 3,
                        })
                        pot.generate_radial_pot(params, check_geometry)


if __name__ == '__main__':
    unittest.main()
