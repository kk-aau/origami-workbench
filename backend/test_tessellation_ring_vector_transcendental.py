"""Smooth Mathematica numeric-function subset in indexed pfn/rfn."""
import itertools
import math
import unittest

from tessellate import check_geometry, check_local_conditions, generate, validate_request
from tessellation_ring_original import ring_function_graphics_query
from tessellation_ring_vector_expression import VectorExpressionCurve, validate_vector_template


TEMPLATE = [
    'sqrt(1+0.08*cos(2*phi))*exp(0.015*i*cos(3*phi))*cos(phi)',
    'sqrt(1+0.08*cos(2*phi))*exp(0.015*i*cos(3*phi))*sin(phi)',
]


def parameters():
    return dict(family='ring', ringMode='origamica', sides=8, rings=2,
                outerRadii=[1, 1.8, 2.6], creaseRadii=[1.35, 2.15],
                offsetAngle=13, angle=36,
                outerVectorTemplate=TEMPLATE, creaseVectorTemplate=TEMPLATE)


class IndexedTranscendentalRingTests(unittest.TestCase):
    def test_exp_sqrt_values_derivatives_and_ray_exit(self):
        curve = VectorExpressionCurve(TEMPLATE, 2)
        for phi in (0, math.pi/6, math.pi/2, 1.7, math.tau):
            amplitude = math.sqrt(1+.08*math.cos(2*phi))*math.exp(.03*math.cos(3*phi))
            actual = curve.point(1, phi)
            self.assertAlmostEqual(actual[0], amplitude*math.cos(phi), places=12)
            self.assertAlmostEqual(actual[1], amplitude*math.sin(phi), places=12)
        amplitude_at_zero = math.sqrt(1.08)*math.exp(.03)
        self.assertAlmostEqual(curve._components(0, 0, True)[0][0], 0, places=12)
        self.assertAlmostEqual(curve._components(0, 0, True)[1][0], amplitude_at_zero, places=12)
        self.assertAlmostEqual(curve.first_ray_exit(1, [.2, 0], [1, 0])[0],
                               amplitude_at_zero, places=10)
        shifted = VectorExpressionCurve(['cos(phi+sqrt(2)/20)',
                                         'sin(phi+sqrt(2)/20)'])
        self.assertAlmostEqual(shifted.point(1, 0)[0], math.cos(math.sqrt(2)/20), places=12)

    def test_indexed_curves_propagate_into_cp_flat_form_and_original_preview(self):
        params = parameters()
        self.assertEqual(validate_request(params)['outerVectorTemplate'], TEMPLATE)
        indexed = generate(params)
        expanded = {key: value for key, value in params.items()
                    if key not in ('outerVectorTemplate', 'creaseVectorTemplate')}
        rows = [[part.replace('0.015*i', f'0.015*{index}') for part in TEMPLATE]
                for index in range(3)]
        expanded['outerVectorExpressions'] = rows
        expanded['creaseVectorExpressions'] = rows[:2]
        separate = generate(expanded)
        fold, flat = indexed['fold'], indexed['source']['foldedForm']
        self.assertEqual(indexed['source']['curveFamily'], 'indexed-vector-expression')
        self.assertEqual(tuple(indexed['stats'][key] for key in ('vertices', 'edges', 'faces')),
                         (72, 136, 65))
        self.assertEqual(fold['edges_assignment'], separate['fold']['edges_assignment'])
        self.assertLess(max(math.dist(a, b) for a, b in zip(fold['vertices_coords'],
                                                              separate['fold']['vertices_coords'])), 1e-9)
        self.assertLess(max(math.dist(a, b) for a, b in zip(flat,
                                                              separate['source']['foldedForm'])), 1e-9)
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertEqual(check_local_conditions(fold)['status'], 'passed')
        self.assertLess(indexed['source']['closureError'], 1e-9)
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=8)
        preview = ring_function_graphics_query(params)
        self.assertEqual(preview['sampleCount'], 101)
        for index, line in enumerate(preview['outerCurves']):
            self.assertAlmostEqual(line[0][0], params['outerRadii'][index]*
                                   math.sqrt(1.08)*math.exp(.015*index), places=12)
            self.assertLess(math.dist(line[0], line[-1]), 1e-12)

    def test_sqrt_domain_and_unsafe_calls_are_rejected_over_the_whole_ring(self):
        bad = (
            ['sqrt(1-cos(phi))*cos(phi)', 'sin(phi)'],
            ['sqrt(0.1+cos(phi))*cos(phi)', 'sin(phi)'],
            ['sqrt(-1)*cos(phi)', 'sin(phi)'],
            ['exp(1000*cos(phi))*cos(phi)', 'sin(phi)'],
            ['exp.__class__', 'sin(phi)'],
            ['exp(cos(phi), 1)', 'sin(phi)'],
            ['exp(__import__("os"))', 'sin(phi)'],
        )
        for pair in bad:
            with self.subTest(pair=pair), self.assertRaises(ValueError):
                VectorExpressionCurve(pair)
        unsafe_index = ['sqrt(1-0.4*i*cos(phi))*cos(phi)',
                        'sqrt(1-0.4*i*cos(phi))*sin(phi)']
        with self.assertRaises(ValueError):
            validate_vector_template(unsafe_index, 4)


if __name__ == '__main__':
    unittest.main()
