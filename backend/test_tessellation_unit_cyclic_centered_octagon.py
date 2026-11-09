import itertools
import math
import unittest

from tessellation_unit_cyclic_centered import unit_cyclic_quadrilateral_info
from tessellation_unit_cyclic_centered_hexagon import (
    original_formula_cyclic_centered_hexagon_out359,
)
from tessellation_unit_cyclic_centered_octagon import (
    FORMULA_ANGLES, FORMULA_EFFECTIVE_ANGLES, FORMULA_SIDE_GAPS,
    FORMULA_TYPES, FORMULA_ZERO_GAPS,
    formula_cyclic_centered_octagon_candidate,
    unit_cyclic_centered_octagon_tile,
)


def central_edge_assignment(fold, a, b):
    coordinates = fold['vertices_coords']
    indices = [min(range(len(coordinates)),
                   key=lambda i: math.dist(point, coordinates[i]))
               for point in (a, b)]
    for edge, assignment in zip(fold['edges_vertices'],
                                fold['edges_assignment']):
        if set(edge) == set(indices):
            return assignment
    raise AssertionError(f'central edge missing: {a}, {b}')


class UnitCyclicCenteredOctagonTests(unittest.TestCase):
    def test_even_angle_completion_and_nonzero_side_mode(self):
        result = formula_cyclic_centered_octagon_candidate()
        source = result['sourceTile']
        self.assertEqual(source['inputAngles'], FORMULA_ANGLES)
        self.assertEqual(source['effectiveAngles'], FORMULA_EFFECTIVE_ANGLES)
        for got, expected in zip(source['zeroAlternationCenterAngles'],
                                 FORMULA_ZERO_GAPS):
            self.assertAlmostEqual(got, expected, places=8)
        for got, expected in zip(source['centerAngles'], FORMULA_SIDE_GAPS):
            self.assertAlmostEqual(got, expected, places=8)
        self.assertAlmostEqual(source['alternatingAdjustment'], 5., places=8)
        vertices = source['vertices']
        self.assertEqual(vertices[:2], [[0., 0.], [1., 0.]])
        self.assertAlmostEqual(math.dist(vertices[1], vertices[2]), 1., places=9)
        self.assertAlmostEqual(vertices[2][0], 1+math.sqrt(2)/2, places=9)
        self.assertAlmostEqual(vertices[3][1], 1+math.sqrt(2)/2, places=9)
        self.assertAlmostEqual(vertices[5][0], -.20201576930855, places=9)
        for point in vertices:
            self.assertAlmostEqual(math.dist(point, source['circumcenter']),
                                   source['circumradius'], places=9)
        self.assertEqual(source['notebookFormulas'],
                         ['In[357]', 'In[373]', 'In[378]', 'In[3041]'])
        self.assertIsNone(source['savedOctagonNumericalOut'])

    def test_named_cp_assignments_and_face_isometry(self):
        result = formula_cyclic_centered_octagon_candidate()
        fold, mother, source = (result[key] for key in
                                ('fold', 'mother', 'sourceTile'))
        self.assertEqual((len(fold['vertices_coords']),
                          len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (32, 48, 17))
        self.assertEqual(len(mother['faces_vertices']), 1)
        self.assertEqual(source['centralTypes'], FORMULA_TYPES)
        center = source['centralVertices']
        self.assertEqual([central_edge_assignment(fold, a, b)
                          for a, b in zip(center, center[1:]+center[:1])],
                         FORMULA_TYPES)
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertLess(result['closureError'], 1e-8)
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
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

    def test_regular_octagon_is_only_an_analytic_comparison(self):
        _, _, source = unit_cyclic_centered_octagon_tile(
            [135.]*6+[0., 0.], 1., 2, .1, 80., FORMULA_TYPES)
        self.assertEqual(source['effectiveAngles'], [135.]*8)
        for gap in source['centerAngles']:
            self.assertAlmostEqual(gap, 45., places=9)
        self.assertAlmostEqual(source['alternatingAdjustment'], 0., places=9)
        vertices = source['vertices']
        self.assertAlmostEqual(vertices[2][0], 1+math.sqrt(2)/2, places=9)
        self.assertAlmostEqual(vertices[2][1], math.sqrt(2)/2, places=9)
        self.assertAlmostEqual(vertices[3][0], 1+math.sqrt(2)/2, places=9)
        self.assertAlmostEqual(vertices[3][1], 1+math.sqrt(2)/2, places=9)
        self.assertIsNone(source['savedOctagonNumericalOut'])

    def test_invalid_input_rejects_and_old_sources_remain_four_six_sided(self):
        invalid = (
            ([140,135,135,135,130,135,0],1.,2,.1,80.,FORMULA_TYPES),
            ([140,135,135,135,130,135,1,0],1.,2,.1,80.,FORMULA_TYPES),
            ([140,True,135,135,130,135,0,0],1.,2,.1,80.,FORMULA_TYPES),
            ([140,135,135,math.nan,130,135,0,0],1.,2,.1,80.,FORMULA_TYPES),
            ([179.]*6+[0.,0.],1.,2,.1,80.,FORMULA_TYPES),
            (FORMULA_ANGLES,0.,2,.1,80.,FORMULA_TYPES),
            (FORMULA_ANGLES,5.01,2,.1,80.,FORMULA_TYPES),
            (FORMULA_ANGLES,1.,3,.1,80.,FORMULA_TYPES),
            (FORMULA_ANGLES,1.,2,.9,80.,FORMULA_TYPES),
            (FORMULA_ANGLES,1.,2,.1,90.,FORMULA_TYPES),
            (FORMULA_ANGLES,1.,2,.1,80.,['M']*7),
        )
        for arguments in invalid:
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                unit_cyclic_centered_octagon_tile(*arguments)
        n4 = unit_cyclic_quadrilateral_info([75,85,95,105],1.2,2)
        self.assertEqual(n4['effectiveAngles'], [75.,85.,105.,95.])
        n6 = original_formula_cyclic_centered_hexagon_out359()
        self.assertEqual(n6['sourceTile']['effectiveAngles'],
                         [128.,119.,118.,115.,114.,126.])
        self.assertEqual(len(n6['fold']['faces_vertices']), 13)


if __name__ == '__main__':
    unittest.main()
