"""C1 piecewise pfn/rfn subset of Origamica's numeric vector curves."""
import itertools
import math
import unittest

from tessellate import check_geometry, check_local_conditions, generate, validate_request
from tessellation_ring_original import ring_function_graphics_query
from tessellation_ring_vector_expression import (
    VectorExpressionCurve, compile_vector_component, validate_vector_template,
)


PAIR = [
    'piecewise(cos(phi),1,.04+.004*i,.02+.002*i)*cos(phi)',
    'piecewise(cos(phi),1,.04+.004*i,.02+.002*i)*sin(phi)',
]
ORDINARY_PAIR = [
    'piecewise(cos(phi),1+(.04+.004*i)*cos(phi)**2,1+(.02+.002*i)*cos(phi)**2)*cos(phi)',
    'piecewise(cos(phi),1+(.04+.004*i)*cos(phi)**2,1+(.02+.002*i)*cos(phi)**2)*sin(phi)',
]


def parameters():
    return dict(family='ring', ringMode='origamica', sides=8, rings=2,
                outerRadii=[1, 1.8, 2.6], creaseRadii=[1.35, 2.15],
                offsetAngle=13, angle=36,
                outerVectorTemplate=PAIR, creaseVectorTemplate=PAIR)


class PiecewiseRingTests(unittest.TestCase):
    def test_visible_squared_gate_accepts_products_and_zero_base(self):
        branch = compile_vector_component(
            'piecewise(cos(phi),1+.04*cos(phi)*cos(phi),1+.02*cos(phi)**2)')
        self.assertAlmostEqual(branch(0, 0)[0][0], 1.04)
        self.assertAlmostEqual(branch(math.pi, math.pi)[0][0], 1.02)
        zero = compile_vector_component('piecewise(cos(phi),cos(phi)**2,0)')
        self.assertAlmostEqual(zero(0, 0)[0][0], 1.)
        self.assertAlmostEqual(zero(math.pi, math.pi)[0][0], 0.)

    def test_ordinary_branches_enclose_values_and_derivatives_at_switches(self):
        curve = VectorExpressionCurve(ORDINARY_PAIR, 2)
        shorthand = VectorExpressionCurve(PAIR, 2)
        for phi in (0, .3, math.pi/2, 2., math.pi, 3*math.pi/2, math.tau):
            self.assertLess(math.dist(curve.point(1, phi), shorthand.point(1, phi)), 1e-12)
        for switch in (math.pi/2, 3*math.pi/2):
            low, high = switch-.02, switch+.02
            values = curve._components(low, high)
            derivatives = curve._components(low, high, True)
            for step in range(41):
                phi = low+(high-low)*step/40
                for dimension, function in enumerate(curve._functions):
                    value, derivative = function(phi, phi)
                    self.assertLessEqual(values[dimension][0]-1e-12, value[0])
                    self.assertLessEqual(value[1], values[dimension][1]+1e-12)
                    self.assertLessEqual(derivatives[dimension][0]-1e-12, derivative[0])
                    self.assertLessEqual(derivative[1], derivatives[dimension][1]+1e-12)
            before = curve._components(switch-1e-7, switch-1e-7, True)
            after = curve._components(switch+1e-7, switch+1e-7, True)
            self.assertTrue(all(abs(a[0]-b[0]) < 2e-6 for a, b in zip(before, after)))

    def test_ordinary_branches_reach_cp_and_preview(self):
        params = parameters()
        params['outerVectorTemplate'] = ORDINARY_PAIR
        params['creaseVectorTemplate'] = ORDINARY_PAIR
        result = generate(params)
        shorthand = generate(parameters())
        self.assertEqual(tuple(result['stats'][key] for key in ('vertices', 'edges', 'faces')),
                         (72, 136, 65))
        self.assertEqual(result['fold']['edges_assignment'], shorthand['fold']['edges_assignment'])
        self.assertLess(max(math.dist(a, b) for a, b in zip(result['fold']['vertices_coords'],
                                                              shorthand['fold']['vertices_coords'])), 1e-9)
        self.assertLess(max(math.dist(a, b) for a, b in zip(result['source']['foldedForm'],
                                                              shorthand['source']['foldedForm'])), 1e-9)
        self.assertEqual(check_geometry(result['fold'])['status'], 'passed')
        self.assertEqual(check_local_conditions(result['fold'])['status'], 'passed')
        preview = ring_function_graphics_query(params)
        self.assertEqual(len(preview['outerCurves']), 3)
        self.assertTrue(all(math.dist(line[0], line[-1]) < 1e-12 for line in preview['outerCurves']))

    def test_branch_values_first_derivatives_and_full_circle_certificate(self):
        curve = VectorExpressionCurve(PAIR, 2)
        self.assertAlmostEqual(curve.point(1, 0)[0], 1.048, places=12)
        self.assertAlmostEqual(curve.point(1, math.pi)[0], -1.024, places=12)
        for switch in (math.pi/2, 3*math.pi/2):
            before = curve._components(switch-1e-7, switch-1e-7, True)
            after = curve._components(switch+1e-7, switch+1e-7, True)
            for a, b in zip(before, after):
                self.assertLess(abs(a[0]-b[0]), 2e-6)
        self.assertGreater(curve.min_norm, .9)
        self.assertLess(curve.max_norm, 1.1)
        self.assertLess(math.dist(curve.point(1, 0), curve.point(1, math.tau)), 1e-12)
        self.assertAlmostEqual(curve.first_ray_exit(1, [.2, 0], [1, 0])[0],
                               1.048, places=10)

    def test_indexed_piecewise_reaches_cp_flat_form_and_input_outline(self):
        params = parameters()
        self.assertEqual(validate_request(params)['outerVectorTemplate'], PAIR)
        indexed = generate(params)
        expanded = {key: value for key, value in params.items()
                    if key not in ('outerVectorTemplate', 'creaseVectorTemplate')}
        rows = [[part.replace('.004*i', f'.004*{index}').replace('.002*i', f'.002*{index}')
                 for part in PAIR] for index in range(3)]
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
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=8)
        preview = ring_function_graphics_query(params)
        self.assertEqual(preview['sampleCount'], 101)
        for index, line in enumerate(preview['outerCurves']):
            self.assertAlmostEqual(line[0][0], params['outerRadii'][index]*(1+.04+.004*index), places=12)
            self.assertLess(math.dist(line[0], line[-1]), 1e-12)

    def test_non_c1_or_executable_piecewise_forms_fail_closed(self):
        bad = (
            ['cos(phi) if cos(phi)>=0 else -cos(phi)', 'sin(phi)'],
            ['piecewise(cos(phi),1+cos(phi),1-cos(phi))*cos(phi)', 'sin(phi)'],
            ['piecewise(cos(phi),1+.04*cos(phi),1+.02*cos(phi))*cos(phi)', 'sin(phi)'],
            ['piecewise(cos(phi),1+.04*cos(phi)**2,1+.02*sin(phi)**2)*cos(phi)', 'sin(phi)'],
            ['piecewise(cos(phi),1+.04*cos(phi)**2,2+.02*cos(phi)**2)*cos(phi)', 'sin(phi)'],
            ['piecewise(cos(phi),1,.04,.02,0)*cos(phi)', 'sin(phi)'],
            ['piecewise(cos(phi)>=0,1,.04,.02)*cos(phi)', 'sin(phi)'],
            ['piecewise(cos(phi),1,sqrt(1-cos(phi)),.02)*cos(phi)', 'sin(phi)'],
            ['piecewise(cos(phi),1,.04,1/0)*cos(phi)', 'sin(phi)'],
            ['piecewise.__class__', 'sin(phi)'],
            ['piecewise(cos(phi),1,__import__("os"),.02)*cos(phi)', 'sin(phi)'],
        )
        for pair in bad:
            with self.subTest(pair=pair), self.assertRaises(ValueError):
                VectorExpressionCurve(pair)
        with self.assertRaises(ValueError):
            validate_vector_template([
                'piecewise(cos(phi),0,.04,.02)*cos(phi)',
                'piecewise(cos(phi),0,.04,.02)*sin(phi)',
            ], 3)


if __name__ == '__main__':
    unittest.main()
