"""Safe Wolfram numeric syntax for section 31's saved vector functions."""
import math
import unittest

from tessellate import check_geometry, check_local_conditions, generate, validate_request
from tessellation_ring_original import ring_function_graphics_query
from tessellation_ring_signed_power import SignedPowerSuperellipse
from tessellation_ring_vector_expression import (
    VectorExpressionCurve, compile_vector_component, vector_expression_curve,
)


SAVED = ['Sign[Cos[φ]] Abs[Cos[φ]]^(1/(i+1))',
         'Sign[Sin[φ]] Abs[Sin[φ]]^(1/(i+1))']
PYTHON = ['sign(cos(phi))*abs(cos(phi))**(1/(i+1))',
          'sign(sin(phi))*abs(sin(phi))**(1/(i+1))']
SMOOTH = ['Sqrt[1+0.08 Cos[2 φ]] Exp[0.015 i Cos[3 φ]] Cos[φ]',
          'Sqrt[1+0.08 Cos[2 φ]] Exp[0.015 i Cos[3 φ]] Sin[φ]']
SMOOTH_PYTHON = [
    'sqrt(1+0.08*cos(2*phi))*exp(0.015*i*cos(3*phi))*cos(phi)',
    'sqrt(1+0.08*cos(2*phi))*exp(0.015*i*cos(3*phi))*sin(phi)',
]
PIECEWISE = [
    'Piecewise[{{1+.04 Cos[φ]^2,Cos[φ]>=0}},1+.02 Cos[φ]^2] Cos[φ]',
    'Piecewise[{{1+.04 Cos[φ]^2,Cos[φ]>=0}},1+.02 Cos[φ]^2] Sin[φ]',
]
PIECEWISE_LOCAL = [
    'piecewise(cos(phi),1+.04*cos(phi)**2,1+.02*cos(phi)**2)*cos(phi)',
    'piecewise(cos(phi),1+.04*cos(phi)**2,1+.02*cos(phi)**2)*sin(phi)',
]


class MathematicaRingFormulaTests(unittest.TestCase):
    def test_constant_powers_keep_unary_precedence_right_associativity_and_real_domain(self):
        values = {'-2^2': -4, '(-2)^2': 4, '2^2^3': 256,
                  '2^-1': .5, '4^(1/2)': 2, '1.5*^-2': .015,
                  '2 E': 2*math.e, '90 Degree': math.pi/2,
                  r'90\[Degree]': math.pi/2, '90°': math.pi/2,
                  'Sin[Pi/2]': 1, 'Cos[Pi/4]': math.sqrt(.5)}
        for source, expected in values.items():
            with self.subTest(source=source):
                value, derivative = compile_vector_component(source)(0,math.tau)
                self.assertAlmostEqual(value[0], expected, places=12)
                self.assertEqual(value[0],value[1])
                self.assertEqual(derivative,(0,0))
        powered = compile_vector_component('Cos[φ]^(2^2)')
        value, derivative = powered(.3,.3)
        self.assertAlmostEqual(value[0], math.cos(.3)**4, places=12)
        self.assertAlmostEqual(derivative[0],-4*math.cos(.3)**3*math.sin(.3),places=12)
        for source in ('0^0','0^-1','(-1)^(.5)','2^1000000','1*^999','Sqrt[-1]'):
            with self.subTest(source=source),self.assertRaises(ValueError):
                compile_vector_component(source)

    def test_saved_in2681_inline_formula_has_the_same_exact_signed_power_path(self):
        # In[2681] defines F[x,i]=Sign[x] Abs[x]^(1/(1+i)); the input API
        # accepts the inlined component, not an arbitrary user-defined F.
        source = dict(family='ring', ringMode='origamica', sides=20, rings=3,
                      outerRadii=[.75,1.75,2.75,3.75], creaseRadii=[1,2,3],
                      angle=45, offsetAngle=6)
        wolfram = {**source, 'outerVectorTemplate':SAVED,
                   'creaseVectorTemplate':SAVED}
        python = {**source, 'outerVectorTemplate':PYTHON,
                  'creaseVectorTemplate':PYTHON}
        self.assertEqual(validate_request(wolfram)['outerVectorTemplate'], SAVED)
        for index in range(4):
            curve = vector_expression_curve(SAVED, index)
            self.assertIsInstance(curve, SignedPowerSuperellipse)
            self.assertEqual(curve.power, index+1)
        actual, expected = generate(wolfram), generate(python)
        self.assertEqual(tuple(actual['stats'][key] for key in ('vertices','edges','faces')),
                         (260,500,241))
        self.assertEqual(actual['fold']['edges_assignment'], expected['fold']['edges_assignment'])
        for field in ('vertices_coords',):
            self.assertLess(max(math.dist(a,b) for a,b in zip(actual['fold'][field],
                                                               expected['fold'][field])),1e-12)
        self.assertLess(max(math.dist(a,b) for a,b in zip(actual['source']['foldedForm'],
                                                           expected['source']['foldedForm'])),1e-12)
        self.assertEqual(check_geometry(actual['fold'])['status'],'passed')
        self.assertEqual(check_local_conditions(actual['fold'])['status'],'passed')
        self.assertEqual(ring_function_graphics_query(wolfram)['outerCurves'],
                         ring_function_graphics_query(python)['outerCurves'])

    def test_function_brackets_powers_constants_and_implicit_products_are_generic(self):
        # In[2675]: rfn[φ_]:=2{Cos[φ],Sin[φ]}, p={1,0}, d={1,1}.
        circle = VectorExpressionCurve(['2 Cos[φ]', '2 Sin[φ]'])
        intersection = circle.first_ray_exit(1,[1,0],[1,1])
        distance = (math.sqrt(7)-1)/2
        self.assertLess(math.dist(intersection,[1+distance,distance]),1e-10)
        escaped = compile_vector_component(r'2Cos[\[Phi]+\[Pi]/4]')
        self.assertAlmostEqual(escaped(0,0)[0][0],math.sqrt(2),places=12)
        self.assertAlmostEqual(escaped(0,0)[1][0],-math.sqrt(2),places=12)
        self.assertAlmostEqual(compile_vector_component('2π')(0,0)[0][0],math.tau)
        for index in range(3):
            original, lower = VectorExpressionCurve(SMOOTH,index), VectorExpressionCurve(SMOOTH_PYTHON,index)
            for phi in (0,.23,math.pi/2,math.pi,math.tau):
                self.assertLess(math.dist(original.point(1,phi),lower.point(1,phi)),1e-12)
                self.assertEqual(original._components(phi,phi,True),lower._components(phi,phi,True))
        params = dict(family='ring',ringMode='origamica',sides=8,rings=2,
                      outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15],
                      offsetAngle=13,angle=36)
        wolfram = generate({**params,'outerVectorTemplate':SMOOTH,
                            'creaseVectorTemplate':SMOOTH})
        lower = generate({**params,'outerVectorTemplate':SMOOTH_PYTHON,
                          'creaseVectorTemplate':SMOOTH_PYTHON})
        self.assertEqual(tuple(wolfram['stats'][key] for key in ('vertices','edges','faces')),
                         (72,136,65))
        self.assertLess(max(math.dist(a,b) for a,b in zip(wolfram['fold']['vertices_coords'],
                                                           lower['fold']['vertices_coords'])),1e-10)
        self.assertLess(max(math.dist(a,b) for a,b in zip(wolfram['source']['foldedForm'],
                                                           lower['source']['foldedForm'])),1e-10)

    def test_unknown_symbols_code_and_unproved_domains_still_fail_closed(self):
        bad = (
            ['F[Cos[φ],i]','Sin[φ]'],
            ['Evaluate[Cos[φ]]','Sin[φ]'],
            ['Cos[φ];1','Sin[φ]'],
            ['Cos[φ][[1]]','Sin[φ]'],
            ['Cos[1.5 φ]','Sin[φ]'],
            ['Cos[9 φ]','Sin[φ]'],
            ['Sqrt[1-Cos[φ]] Cos[φ]','Sin[φ]'],
            ['Exp[1000 Cos[φ]] Cos[φ]','Sin[φ]'],
            ['Sign[Cos[φ]]','Sin[φ]'],
            ['Sign[Cos[φ]] Abs[Cos[φ]]^(1/(i+2))',SAVED[1]],
            ['Cos[φ] + __import__["os"]','Sin[φ]'],
        )
        for pair in bad:
            with self.subTest(pair=pair),self.assertRaises(ValueError):
                vector_expression_curve(pair,2)

    def test_wolfram_piecewise_lists_have_certified_values_derivatives_and_cp_ff(self):
        original, local = VectorExpressionCurve(PIECEWISE), VectorExpressionCurve(PIECEWISE_LOCAL)
        for phi in (0,.23,math.pi/2,2,math.pi,3*math.pi/2,math.tau):
            self.assertLess(math.dist(original.point(1,phi),local.point(1,phi)),1e-12)
        for low, high in ((0,.4),(1.5,1.7),(3,3.5),(4.6,4.9)):
            for derivative in (False,True):
                self.assertEqual(original._components(low,high,derivative),
                                 local._components(low,high,derivative))
        params = dict(family='ring',ringMode='origamica',sides=8,rings=2,
                      outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15],
                      offsetAngle=13,angle=36)
        actual = generate({**params,'outerVectorTemplate':PIECEWISE,'creaseVectorTemplate':PIECEWISE})
        expected = generate({**params,'outerVectorTemplate':PIECEWISE_LOCAL,'creaseVectorTemplate':PIECEWISE_LOCAL})
        self.assertEqual(tuple(actual['stats'][key] for key in ('vertices','edges','faces')),(72,136,65))
        self.assertEqual(actual['fold']['edges_assignment'],expected['fold']['edges_assignment'])
        self.assertLess(max(math.dist(a,b) for a,b in zip(actual['fold']['vertices_coords'],
                                                       expected['fold']['vertices_coords'])),1e-10)
        self.assertLess(max(math.dist(a,b) for a,b in zip(actual['source']['foldedForm'],
                                                       expected['source']['foldedForm'])),1e-10)

    def test_piecewise_priorities_default_and_guard_directions(self):
        source = 'Piecewise[{{1+.04 Cos[φ]^2,Cos[φ]>0},{1+.02 Cos[φ]^2,Cos[φ]>=0}},1]'
        function = compile_vector_component(source)
        self.assertAlmostEqual(function(0,0)[0][0],1.04)
        self.assertEqual(function(math.pi,math.pi),((1,1),(0,0)))
        self.assertEqual(compile_vector_component('Piecewise[{{Cos[φ]^2,Cos[φ]>0}}]')(math.pi,math.pi),
                         ((0,0),(0,0)))
        overlapping = compile_vector_component(
            'Piecewise[{{Cos[φ]^2 Sin[φ]^2,Cos[φ]>0},{-(Cos[φ]^2 Sin[φ]^2),Sin[φ]>0}}]')
        self.assertAlmostEqual(overlapping(math.pi/4,math.pi/4)[0][0],.25)
        self.assertAlmostEqual(overlapping(3*math.pi/4,3*math.pi/4)[0][0],-.25)
        self.assertEqual(overlapping(5*math.pi/4,5*math.pi/4),((0,0),(0,0)))
        for operator in ('<','<=','≤'):
            function=compile_vector_component(f'Piecewise[{{{{1+.04 Cos[φ]^2,0{operator}Cos[φ]}}}},1+.02 Cos[φ]^2]')
            self.assertAlmostEqual(function(0,0)[0][0],1.04)
            self.assertAlmostEqual(function(math.pi,math.pi)[0][0],1.02)
        # A later branch must also match where an earlier guard turns off.
        # Its own sin=0 continuity proof alone would miss a cos=0 jump.
        bad = (
            'Piecewise[{{1+.02 Cos[φ]^2,Cos[φ]>=0},{1+.04 Sin[φ]^2,Sin[φ]>=0}},1]',
            'Piecewise[{{1.1,Cos[φ]>=0}},1]',
            'Piecewise[{{1+.04 Cos[φ],Cos[φ]>0}},1]',
            'Piecewise[{{1,Cos[φ]==0}},1]',
            'Piecewise[{{1,0<Cos[φ]<1}},1]',
            'Piecewise[{{1,True}},1]',
            'Piecewise[{1,Cos[φ]>0},1]',
            '{Cos[φ],Sin[φ]}',
            'Cos[φ] >= 0',
        )
        for source in bad:
            with self.subTest(source=source),self.assertRaises(ValueError):
                compile_vector_component(source)
        with self.assertRaisesRegex(ValueError,'所有分支'):
            compile_vector_component(bad[0])


if __name__=='__main__':
    unittest.main()
