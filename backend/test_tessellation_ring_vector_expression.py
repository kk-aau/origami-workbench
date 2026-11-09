import itertools
import math
import unittest

from tessellate import check_geometry, check_local_conditions, generate, validate_request
from tessellation_ring_original import ring_function_graphics_query
from tessellation_ring_vector_expression import VectorExpressionCurve, validate_vector_expression


RATIONAL = ['cos(phi)/(1+0.06*cos(3*phi))', 'sin(phi)/(1+0.06*cos(3*phi))']
CIRCLE = ['cos(phi)', 'sin(phi)']


def parameters(expression=RATIONAL):
    return dict(family='ring', ringMode='origamica', sides=8, rings=2,
                outerRadii=[1, 1.8, 2.6], creaseRadii=[1.35, 2.15],
                offsetAngle=13, angle=36,
                outerVectorExpressions=[expression]*3,
                creaseVectorExpressions=[expression]*2)


class RingVectorExpressionTests(unittest.TestCase):
    def test_periodic_numeric_dsl_and_first_ray_exit(self):
        curve = VectorExpressionCurve(RATIONAL)
        self.assertAlmostEqual(curve.point(1, 0)[0], 1/1.06, places=12)
        self.assertAlmostEqual(curve.point(1, math.tau)[0], 1/1.06, places=12)
        self.assertAlmostEqual(curve.first_ray_exit(1, [.2, 0], [1, 0])[0], 1/1.06, places=10)
        rotated = VectorExpressionCurve(['cos(phi+pi/4)*(1+.02*sin(2*phi))',
                                         'sin(phi+pi/4)*(1+.02*sin(2*phi))'])
        self.assertAlmostEqual(rotated.point(1, 0)[0], math.sqrt(.5), places=12)

    def test_rejects_code_nonperiodic_singular_or_wrong_winding(self):
        bad = (
            ['__import__("os")', 'sin(phi)'],
            ['cos(phi).__class__', 'sin(phi)'],
            ['cos(phi)[0]', 'sin(phi)'],
            ['phi*cos(phi)', 'sin(phi)'],
            ['cos(1.5*phi)', 'sin(phi)'],
            ['cos(9*phi)', 'sin(phi)'],
            ['cos(phi)/(1-cos(phi))', 'sin(phi)'],
            ['cos(2*phi)', 'sin(2*phi)'],
            ['cos(phi)', '-sin(phi)'],
            ['0', '0'],
            ['10*cos(phi)', '10*sin(phi)'],
        )
        for value in bad:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_vector_expression(value)
        with self.assertRaises(ValueError):
            validate_request({**parameters(), 'creaseVectorExpressions':[RATIONAL]})
        with self.assertRaises(ValueError):
            validate_request({**parameters(), 'outerExpressions':['r']*3,
                              'creaseExpressions':['r']*2})
        with self.assertRaises(ValueError):
            generate({**parameters(), 'outerVectorExpressions':[
                ['2*cos(phi)','2*sin(phi)'],RATIONAL,RATIONAL]})

    def test_circle_formula_matches_existing_ring_and_rational_formula_keeps_rigid_faces(self):
        circle=generate(parameters(CIRCLE))
        legacy=generate({key:value for key,value in parameters(CIRCLE).items()
                         if key not in ('outerVectorExpressions','creaseVectorExpressions')})
        for left,right in zip(circle['fold']['vertices_coords'],legacy['fold']['vertices_coords']):
            self.assertLess(math.dist(left,right),1e-9)
        result=generate(parameters())
        fold, flat=result['fold'],result['source']['foldedForm']
        self.assertEqual(result['source']['curveFamily'],'numeric-vector-expression')
        self.assertEqual(tuple(len(fold[key]) for key in ('vertices_coords','edges_vertices','faces_vertices')),(72,136,65))
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertEqual(check_local_conditions(fold)['status'],'passed')
        self.assertLess(result['source']['closureError'],1e-9)
        self.assertGreater(math.dist(fold['vertices_coords'][0],circle['fold']['vertices_coords'][0]),.01)
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=8)
        graphics=ring_function_graphics_query(parameters())
        self.assertEqual(graphics['sampleCount'],101)
        self.assertAlmostEqual(graphics['outerCurves'][0][0][0],1/1.06,places=12)
        self.assertLess(math.dist(graphics['outerCurves'][0][0],graphics['outerCurves'][0][-1]),1e-12)


if __name__ == '__main__':
    unittest.main()
