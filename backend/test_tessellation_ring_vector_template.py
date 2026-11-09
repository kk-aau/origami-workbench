"""Original pfn[i]/rfn[i] indexed vector-function semantics."""
import itertools
import math
import unittest

from tessellate import check_geometry, check_local_conditions, generate, validate_request
from tessellation_ring_original import ring_function_graphics_query
from tessellation_ring_vector_expression import VectorExpressionCurve, vector_expression_curve
from tessellation_ring_signed_power import SignedPowerSuperellipse


TEMPLATE = ['cos(phi)/(1+0.015*i*cos(3*phi))',
            'sin(phi)/(1+0.015*i*cos(3*phi))']
SQUARING_CIRCLE = ['sign(cos(phi))*abs(cos(phi))**(1/(i+1))',
                   'sign(sin(phi))*abs(sin(phi))**(1/(i+1))']


def parameters():
    return dict(family='ring', ringMode='origamica', sides=8, rings=2,
                outerRadii=[1, 1.8, 2.6], creaseRadii=[1.35, 2.15],
                offsetAngle=13, angle=36,
                outerVectorTemplate=TEMPLATE, creaseVectorTemplate=TEMPLATE)


class IndexedRingVectorTests(unittest.TestCase):
    def test_saved_squaring_circle_formula_uses_exact_superellipse_geometry(self):
        source = dict(family='ring', ringMode='origamica', sides=20, rings=3,
                      outerRadii=[.75,1.75,2.75,3.75], creaseRadii=[1,2,3],
                      angle=45, offsetAngle=6)
        formula = {**source, 'outerVectorTemplate':SQUARING_CIRCLE,
                   'creaseVectorTemplate':SQUARING_CIRCLE}
        signed = {**source, 'outerSignedPowers':[1,2,3,4],
                  'creaseSignedPowers':[1,2,3]}
        for index in range(4):
            profile = vector_expression_curve(SQUARING_CIRCLE, index)
            self.assertIsInstance(profile, SignedPowerSuperellipse)
            self.assertEqual(profile.power, index+1)
        result, reference = generate(formula), generate(signed)
        self.assertEqual(result['source']['curveFamily'], 'indexed-vector-expression')
        self.assertEqual(tuple(result['stats'][key] for key in ('vertices','edges','faces')),
                         (260,500,241))
        self.assertEqual(result['fold']['edges_vertices'], reference['fold']['edges_vertices'])
        self.assertEqual(result['fold']['edges_assignment'], reference['fold']['edges_assignment'])
        self.assertLess(max(math.dist(a,b) for a,b in zip(result['fold']['vertices_coords'],
                                                           reference['fold']['vertices_coords'])),1e-12)
        self.assertLess(max(math.dist(a,b) for a,b in zip(result['source']['foldedForm'],
                                                           reference['source']['foldedForm'])),1e-12)
        self.assertEqual(check_geometry(result['fold'])['status'], 'passed')
        self.assertEqual(check_local_conditions(result['fold'])['status'], 'passed')
        self.assertEqual(ring_function_graphics_query(formula)['outerCurves'],
                         ring_function_graphics_query(signed)['outerCurves'])
        self.assertEqual(ring_function_graphics_query(formula)['creaseCurves'],
                         ring_function_graphics_query(signed)['creaseCurves'])

    def test_only_exact_matched_signed_power_pair_uses_nonsmooth_path(self):
        constant = [part.replace('i+1','3') for part in SQUARING_CIRCLE]
        self.assertEqual(vector_expression_curve(constant).power, 3)
        invalid = (
            [SQUARING_CIRCLE[0], SQUARING_CIRCLE[1].replace('i+1','i+2')],
            [SQUARING_CIRCLE[0].replace('abs(cos(phi))','abs(sin(phi))'), SQUARING_CIRCLE[1]],
            [SQUARING_CIRCLE[0].replace('1/(i+1)','1/(i+1.0000000000000001)'), SQUARING_CIRCLE[1]],
            [SQUARING_CIRCLE[0].replace('cos(phi)','cos(2*phi)'), SQUARING_CIRCLE[1]],
            [SQUARING_CIRCLE[0].replace('sign','abs'), SQUARING_CIRCLE[1]],
        )
        for pair in invalid:
            with self.subTest(pair=pair), self.assertRaises(ValueError):
                vector_expression_curve(pair, 2)
        with self.assertRaises(ValueError):
            validate_request({**parameters(), 'outerVectorTemplate':SQUARING_CIRCLE,
                              'creaseVectorTemplate':[SQUARING_CIRCLE[0],
                                                      SQUARING_CIRCLE[1].replace('sin','cos')]})

    def test_indexed_function_matches_explicit_independent_functions(self):
        by_index = generate(parameters())
        explicit = ['cos(phi)/(1+0.015*%d*cos(3*phi))' % i for i in range(3)]
        explicit_y = ['sin(phi)/(1+0.015*%d*cos(3*phi))' % i for i in range(3)]
        parameters_explicit = {key:value for key,value in parameters().items()
                               if key not in ('outerVectorTemplate','creaseVectorTemplate')}
        parameters_explicit['outerVectorExpressions'] = [[x,y] for x,y in zip(explicit,explicit_y)]
        parameters_explicit['creaseVectorExpressions'] = [[x,y] for x,y in zip(explicit[:2],explicit_y[:2])]
        separately = generate(parameters_explicit)
        self.assertEqual(by_index['source']['curveFamily'],'indexed-vector-expression')
        self.assertEqual(tuple(by_index['stats'][key] for key in ('vertices','edges','faces')),(72,136,65))
        self.assertEqual(by_index['fold']['edges_assignment'], separately['fold']['edges_assignment'])
        self.assertLess(max(math.dist(a,b) for a,b in zip(by_index['fold']['vertices_coords'],
                                                           separately['fold']['vertices_coords'])),1e-10)
        self.assertLess(max(math.dist(a,b) for a,b in zip(by_index['source']['foldedForm'],
                                                           separately['source']['foldedForm'])),1e-10)
        fold, flat = by_index['fold'], by_index['source']['foldedForm']
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertEqual(check_local_conditions(fold)['status'],'passed')
        self.assertLess(by_index['source']['closureError'],1e-9)
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=8)

    def test_original_graphics_evaluates_each_index_at_parameter_phi(self):
        preview = ring_function_graphics_query(parameters())
        self.assertEqual(preview['sampleCount'],101)
        for index, line in enumerate(preview['outerCurves']):
            expected = VectorExpressionCurve(TEMPLATE,index)
            for sample in (0,11,25,75,100):
                self.assertLess(math.dist(line[sample],expected.point(parameters()['outerRadii'][index],
                                                                     math.pi*sample/50)),1e-12)
            self.assertAlmostEqual(line[0][0],parameters()['outerRadii'][index]/(1+.015*index))
        self.assertNotEqual(preview['outerCurves'][0][0],preview['outerCurves'][1][0])

    def test_rejects_invalid_or_mixed_index_functions(self):
        good=validate_request(parameters())
        self.assertEqual(good['outerVectorTemplate'],TEMPLATE)
        invalid=(
            {'creaseVectorTemplate':None},
            {'outerVectorTemplate':['cos(phi)','sin(phi).__class__']},
            {'outerVectorTemplate':['cos(phi)/(i-i)','sin(phi)']},
            {'outerVectorTemplate':['cos((i+1)*phi)','sin((i+1)*phi)']},
            {'outerVectorTemplate':['cos(phi)','-sin(phi)']},
            {'outerVectorTemplate':['cos(phi)','sin(phi)'],
             'outerVectorExpressions':[['cos(phi)','sin(phi)']]*3,
             'creaseVectorExpressions':[['cos(phi)','sin(phi)']]*2},
        )
        for patch in invalid:
            with self.subTest(patch=patch),self.assertRaises(ValueError):
                validate_request({**parameters(),**patch})

    def test_different_indices_do_not_bypass_nesting_proof(self):
        params={**parameters(), 'rings':1, 'outerRadii':[1.,1.8], 'creaseRadii':[1.35],
                'outerVectorTemplate':['cos(phi)/(1+0.4*i*cos(phi))',
                                       'sin(phi)/(1+0.4*i*cos(phi))'],
                'creaseVectorTemplate':['cos(phi)','sin(phi)']}
        with self.assertRaisesRegex(ValueError,'严格嵌套'):
            generate(params)


if __name__=='__main__':
    unittest.main()
