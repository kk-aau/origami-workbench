import itertools
import math
import unittest

from tessellation_unit_cyclic_centered import (
    original_cyclic_centered_pair, unit_cyclic_quadrilateral_info,
)
from tessellation_unit_cyclic_centered_hexagon import (
    OUT359_ANGLES, OUT359_EFFECTIVE_ANGLES, OUT359_SIDE_GAPS,
    OUT359_ZERO_GAPS, PRESET_TYPES,
    original_formula_cyclic_centered_hexagon_out359,
    unit_cyclic_centered_hexagon_tile,
)


def central_edge_assignment(fold, a, b):
    coordinates = fold['vertices_coords']
    vertex_indices = [min(range(len(coordinates)),
                          key=lambda i: math.dist(point, coordinates[i]))
                      for point in (a, b)]
    for edge, assignment in zip(fold['edges_vertices'],
                                fold['edges_assignment']):
        if set(edge) == set(vertex_indices):
            return assignment
    raise AssertionError(f'central edge missing: {a}, {b}')


class UnitCyclicCenteredHexagonTests(unittest.TestCase):
    def test_saved_mother_out359_then_in373_side_constraint(self):
        result = original_formula_cyclic_centered_hexagon_out359()
        source = result['sourceTile']
        self.assertEqual(source['inputAngles'], OUT359_ANGLES)
        self.assertEqual(source['effectiveAngles'], OUT359_EFFECTIVE_ANGLES)
        for got, expected in zip(source['zeroAlternationCenterAngles'],
                                 OUT359_ZERO_GAPS):
            self.assertAlmostEqual(got, expected, places=9)
        for got, expected in zip(source['centerAngles'], OUT359_SIDE_GAPS):
            self.assertAlmostEqual(got, expected, places=8)
        self.assertAlmostEqual(source['alternatingAdjustment'], 3., places=8)
        vertices = source['vertices']
        self.assertEqual(vertices[:2], [[0., 0.], [1., 0.]])
        self.assertAlmostEqual(math.dist(vertices[1], vertices[2]), 1., places=9)
        self.assertAlmostEqual(vertices[2][0], 1.484809620246, places=9)
        self.assertAlmostEqual(vertices[3][1], 1.738010930346, places=9)
        for point in vertices:
            self.assertAlmostEqual(math.dist(point, source['circumcenter']),
                                   source['circumradius'], places=9)
        self.assertEqual(source['motherAnchor'], 'In[359]/Out[359]')
        self.assertEqual(source['tileFormula'], 'In[3041]')
        self.assertIsNone(source['twistNumericalOut'])

    def test_named_single_tile_cp_assignments_flat_form_and_scope(self):
        result = original_formula_cyclic_centered_hexagon_out359()
        fold, mother, source = (result[key] for key in
                                ('fold', 'mother', 'sourceTile'))
        self.assertEqual((len(fold['vertices_coords']),
                          len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (24, 36, 13))
        self.assertEqual(len(mother['faces_vertices']), 1)
        self.assertEqual(source['centralTypes'], PRESET_TYPES)
        center = source['centralVertices']
        self.assertEqual([central_edge_assignment(fold, a, b)
                          for a, b in zip(center, center[1:]+center[:1])],
                         PRESET_TYPES)
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertLess(result['closureError'], 1e-8)
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
        self.assertEqual(source['layerOrder'], 'not_checked')
        self.assertFalse(result['adoptable'])
        self.assertFalse(source['adoptable'])
        flat = result['foldedForm']
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(
                    math.dist(fold['vertices_coords'][a],
                              fold['vertices_coords'][b]),
                    math.dist(flat[a], flat[b]), places=7,
                )

    def test_invalid_hexagon_inputs_reject_without_widening_n4(self):
        good = (OUT359_ANGLES, 1., 2, .1, 80., PRESET_TYPES)
        invalid = (
            ([128, 119, 118, 115], 1., 2, .1, 80., PRESET_TYPES),
            ([128, 119, 118, 115, 1, 0], 1., 2, .1, 80., PRESET_TYPES),
            ([128, True, 118, 115, 0, 0], 1., 2, .1, 80., PRESET_TYPES),
            ([128, 119, math.nan, 115, 0, 0], 1., 2, .1, 80., PRESET_TYPES),
            ([179, 179, 179, 179, 0, 0], 1., 2, .1, 80., PRESET_TYPES),
            (OUT359_ANGLES, 0., 2, .1, 80., PRESET_TYPES),
            (OUT359_ANGLES, 5.01, 2, .1, 80., PRESET_TYPES),
            (OUT359_ANGLES, 1., 3, .1, 80., PRESET_TYPES),
            (OUT359_ANGLES, 1., 2, .9, 80., PRESET_TYPES),
            (OUT359_ANGLES, 1., 2, .1, 90., PRESET_TYPES),
            (OUT359_ANGLES, 1., 2, .1, 80., ['M']*5),
        )
        for arguments in invalid:
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                unit_cyclic_centered_hexagon_tile(*arguments)
        fold, _, _ = unit_cyclic_centered_hexagon_tile(*good)
        self.assertEqual(len(fold['faces_vertices']), 13)
        # The separate saved n=4 implementation must retain its original input
        # semantics and pair topology when a six-sided adapter is added.
        n4 = unit_cyclic_quadrilateral_info([75, 85, 95, 105], 1.2, 2)
        self.assertEqual(n4['effectiveAngles'], [75., 85., 105., 95.])
        pair = original_cyclic_centered_pair(False)['fold']
        self.assertEqual((len(pair['vertices_coords']),
                          len(pair['edges_vertices']),
                          len(pair['faces_vertices'])), (26, 40, 15))


if __name__ == '__main__':
    unittest.main()
