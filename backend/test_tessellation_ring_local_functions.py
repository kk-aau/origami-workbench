"""Section 31 local pure functions expand into the existing certified geometry."""
import math
import unittest

from tessellate import generate, validate_request
from tessellation_ring_original import ring_function_graphics_query
from tessellation_ring_signed_power import SignedPowerSuperellipse
from tessellation_ring_vector_expression import (
    compile_vector_component, validate_vector_function_definitions, vector_expression_curve,
)

ORIGINAL = ['F[x_,i_]:=Sign[x] Abs[x]^(1/(1+i))']
OVERLOADED = ORIGINAL+['F[0,i_]:=0','F[x_,0]:=x']
CALLS = ['F[Cos[φ],i]', 'F[Sin[φ],i]']
INLINE = ['Sign[Cos[φ]] Abs[Cos[φ]]^(1/(1+i))',
          'Sign[Sin[φ]] Abs[Sin[φ]]^(1/(1+i))']


def saved_request():
    return dict(family='ring',ringMode='origamica',sides=20,rings=3,angle=45,
                offsetAngle=6,outerRadii=[.75,1.75,2.75,3.75],creaseRadii=[1,2,3],
                vectorFunctionDefinitions=ORIGINAL,outerVectorTemplate=CALLS,creaseVectorTemplate=CALLS)


class LocalRingFunctionTests(unittest.TestCase):
    def test_actual_in2681_f_definition_call_cp_ff_and_input_graphics(self):
        request=saved_request()
        self.assertEqual(validate_request(request)['vectorFunctionDefinitions'],ORIGINAL)
        expected={**request,'outerVectorTemplate':INLINE,'creaseVectorTemplate':INLINE}
        expected.pop('vectorFunctionDefinitions')
        actual,inline=generate(request),generate(expected)
        self.assertEqual(tuple(actual['stats'][key] for key in ('vertices','edges','faces')),(260,500,241))
        self.assertEqual(actual['stats']['parameters']['vectorFunctionDefinitions'],ORIGINAL)
        self.assertEqual(actual['fold']['edges_assignment'],inline['fold']['edges_assignment'])
        self.assertLess(max(math.dist(a,b) for a,b in zip(actual['fold']['vertices_coords'],inline['fold']['vertices_coords'])),1e-12)
        self.assertLess(max(math.dist(a,b) for a,b in zip(actual['source']['foldedForm'],inline['source']['foldedForm'])),1e-12)
        self.assertEqual(ring_function_graphics_query(request),ring_function_graphics_query(expected))
        for index in range(4):
            curve=vector_expression_curve(CALLS,index,ORIGINAL)
            self.assertIsInstance(curve,SignedPowerSuperellipse)
            self.assertEqual(curve.power,index+1)
        per_ring={key:value for key,value in request.items()
                  if key not in ('outerVectorTemplate','creaseVectorTemplate')}
        rows=lambda count: [[part.replace(',i]',f',{index}]') for part in CALLS]
                            for index in range(count)]
        per_ring.update(outerVectorExpressions=rows(4),creaseVectorExpressions=rows(3))
        expanded=generate(per_ring)
        self.assertEqual(expanded['fold']['vertices_coords'],actual['fold']['vertices_coords'])
        self.assertEqual(expanded['source']['foldedForm'],actual['source']['foldedForm'])
        self.assertEqual(ring_function_graphics_query(per_ring),ring_function_graphics_query(request))

    def test_definitions_and_parameters_are_not_hardcoded_to_f_or_x_i(self):
        definitions=['PowerMap[t_,order_]=Sign[t] Abs[t]^(1/(1+order))']
        pair=['PowerMap[Cos[φ],i]','PowerMap[Sin[φ],i]']
        self.assertEqual(vector_expression_curve(pair,3,definitions).power,4)
        for index in range(4):
            self.assertEqual(vector_expression_curve(
                [part.replace(',i]',f',{index}]') for part in pair],
                function_definitions=definitions).power,index+1)
        swapped=compile_vector_component('Swap[i,phi]',3,['Swap[phi_,i_]:=Sin[phi+2i]'])
        value,derivative=swapped(.4,.4)
        self.assertAlmostEqual(value[0],math.sin(3+.8),places=12)
        self.assertAlmostEqual(derivative[0],2*math.cos(3+.8),places=12)
        squared=compile_vector_component('Square[2+3]',None,['Square[z_]:=z^2'])
        self.assertEqual(squared(0,1),((25,25),(0,0)))

    def test_forward_acyclic_functions_reach_real_smooth_cp_and_preserve_curve_identity(self):
        definitions=['Component[t_,c_]:=Radial[t] c','Radial[t_]:=1+.02 Cos[3t]']
        pair=['Component[φ,Cos[φ]]','Component[φ,Sin[φ]]']
        inline=['(1+.02 Cos[3φ]) Cos[φ]','(1+.02 Cos[3φ]) Sin[φ]']
        actual_curve=vector_expression_curve(pair,None,definitions)
        expected_curve=vector_expression_curve(inline)
        for phi in (0,.23,1.57,math.pi,math.tau):
            self.assertLess(math.dist(actual_curve.point(1,phi),expected_curve.point(1,phi)),1e-12)
        changed=vector_expression_curve(pair,None,[definitions[0],'Radial[t_]:=1+.03 Cos[3t]'])
        self.assertNotEqual(actual_curve.harmonics,changed.harmonics)
        request=dict(family='ring',ringMode='origamica',sides=8,rings=2,angle=36,offsetAngle=13,
                     outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15],
                     vectorFunctionDefinitions=definitions,outerVectorTemplate=pair,creaseVectorTemplate=pair)
        actual=generate(request)
        expected={**request,'outerVectorTemplate':inline,'creaseVectorTemplate':inline}
        expected.pop('vectorFunctionDefinitions')
        expected=generate(expected)
        self.assertEqual(tuple(actual['stats'][key] for key in ('vertices','edges','faces')),(72,136,65))
        self.assertEqual(actual['fold']['vertices_coords'],expected['fold']['vertices_coords'])
        self.assertEqual(actual['source']['foldedForm'],expected['source']['foldedForm'])

    def test_invalid_unused_definitions_free_names_recursion_and_side_effects_fail_closed(self):
        bad=(
            [],None,['F[x_]:=F[x]'],['F[x_]:=G[x]','G[x_]:=F[x]'],
            ['F[x_]:=x','F[y_]:=y'],['Cos[x_]:=x'],['F[x_,x_]:=x'],
            ['F[Pi_]:=Pi'],['F[G_]:=G','G[x_]:=x'],['F[x_]:=x+i'],
            ['F[x_]:=x+phi'],['F[x_]:=Unknown[x]'],['F[x_]:=Sin[x,x]'],
            ['F[x_]:=G[x]','G[x_,y_]:=x+y'],['F[x_]:=1e999'],['F[x_]:=1000001'],
            ['F[x_]:=1/0'],['F[x_]:=0^0'],['F[x_]:=Exp[1000]'],
            ['F[x_]:=x;1'],['F[x_]:=x=1'],['F[x_]:=While[x>0,x]'],
            ['F[x_]:=x.__class__'],['F[x_]:=x[x]'],['F[x_]:=x/;x>0'],
            ['F[x_]:={x,x}'],['F[x_]:=x>0'],['F[x_]:=Cos'],
            ['F[0,x_]:=0'],['F[x_]:=x']*9,
        )
        for definitions in bad:
            with self.subTest(definitions=definitions),self.assertRaises(ValueError):
                # Invalid declarations are rejected even without a call.
                validate_vector_function_definitions(definitions)
        with self.assertRaisesRegex(ValueError,'展开'):
            compile_vector_component('D[D[D[D[D[D[Cos[φ]]]]]]]',0,['D[x_]:=x+x'])
        with self.assertRaises(ValueError):
            vector_expression_curve(['F[Cos[φ]]',CALLS[1]],2,ORIGINAL)

    def test_function_definitions_require_numeric_vector_mode_and_all_expanded_geometry_checks(self):
        for request in (
            dict(family='ring',vectorFunctionDefinitions=ORIGINAL),
            {**saved_request(),'outerVectorTemplate':None},
            {key:value for key,value in saved_request().items() if key not in ('outerVectorTemplate','creaseVectorTemplate')},
        ):
            with self.subTest(request=request),self.assertRaises(ValueError):
                validate_request(request)
        with self.assertRaises(ValueError):
            vector_expression_curve(['Radial[φ] Cos[φ]','Radial[φ] Sin[φ]'],0,
                                    ['Radial[x_]:=Sqrt[1-Cos[x]]'])

    def test_source_three_f_patterns_dispatch_to_identical_cp_ff_and_per_ring_curves(self):
        expected=generate(saved_request())
        request={**saved_request(),'vectorFunctionDefinitions':OVERLOADED}
        actual=generate(request)
        self.assertEqual(actual['stats']['parameters']['vectorFunctionDefinitions'],OVERLOADED)
        self.assertEqual(actual['fold'],expected['fold'])
        self.assertEqual(actual['source']['foldedForm'],expected['source']['foldedForm'])
        self.assertEqual(ring_function_graphics_query(request),ring_function_graphics_query(saved_request()))
        for definitions in (OVERLOADED,list(reversed(OVERLOADED))):
            for index in range(4):
                self.assertEqual(vector_expression_curve(CALLS,index,definitions).power,index+1)
                literal=[part.replace(',i]',f',{index}]') for part in CALLS]
                self.assertEqual(vector_expression_curve(literal,None,definitions).power,index+1)

    def test_finite_literal_modes_select_real_discrete_indices_without_tolerance(self):
        definitions=['Radius[k_]:=1','Radius[2]:=1.1']
        self.assertEqual(compile_vector_component('Radius[i]',2,definitions)(0,1)[0],(1.1,1.1))
        self.assertEqual(compile_vector_component('Radius[2+.0000001]',None,definitions)(0,1)[0],(1,1))
        pair=['Radius[i] Cos[φ]','Radius[i] Sin[φ]']
        request=dict(family='ring',ringMode='origamica',sides=8,rings=2,angle=36,offsetAngle=13,
                     outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15],
                     vectorFunctionDefinitions=definitions,outerVectorTemplate=pair,creaseVectorTemplate=pair)
        result=generate(request)
        expanded={key:value for key,value in request.items() if key not in ('vectorFunctionDefinitions','outerVectorTemplate','creaseVectorTemplate')}
        rows=lambda n:[[f'{1.1 if i==2 else 1} Cos[φ]',f'{1.1 if i==2 else 1} Sin[φ]'] for i in range(n)]
        expanded.update(outerVectorExpressions=rows(3),creaseVectorExpressions=rows(2))
        expected=generate(expanded)
        self.assertEqual(result['fold']['vertices_coords'],expected['fold']['vertices_coords'])
        self.assertEqual(result['source']['foldedForm'],expected['source']['foldedForm'])

    def test_module_initializers_are_outer_lexical_and_nested_locals_cannot_capture(self):
        definitions=['Scoped[t_]:=Module[{t=Cos[t]},Module[{t=t+.02},t]]']
        function=compile_vector_component('Scoped[φ]',function_definitions=definitions)
        for phi in (.2,.7,2.):
            value,derivative=function(phi,phi)
            self.assertAlmostEqual(value[0],math.cos(phi)+.02,places=12)
            self.assertAlmostEqual(derivative[0],-math.sin(phi),places=12)
        # u=t reads the outer formal, not the other initializer t=2.
        function=compile_vector_component('Scope[φ]',function_definitions=['Scope[t_]:=Module[{t=2,u=t},Cos[u]+.01t]'])
        self.assertAlmostEqual(function(.4,.4)[0][0],math.cos(.4)+.02,places=12)
        swapped=compile_vector_component('Swap[i,φ]',3,['Swap[phi_,i_]:=Module[{phi=Cos[phi]},phi Sin[i]]'])
        self.assertAlmostEqual(swapped(.4,.4)[0][0],math.cos(3)*math.sin(.4),places=12)

    def test_module_numeric_helpers_reach_existing_analytic_and_smooth_certificates(self):
        definitions=['Basis[t_,order_]:=Module[{power=1/(1+order)},Sign[t] Abs[t]^power]',
                     'Basis[0,order_]:=0','Basis[t_,0]:=t']
        calls=['Basis[Cos[φ],i]','Basis[Sin[φ],i]']
        request={**saved_request(),'vectorFunctionDefinitions':definitions,'outerVectorTemplate':calls,'creaseVectorTemplate':calls}
        result=generate(request);expected=generate(saved_request())
        self.assertEqual(result['fold'],expected['fold'])
        self.assertEqual(result['source']['foldedForm'],expected['source']['foldedForm'])
        smooth=['Component[t_,c_,k_]:=Module[{r=1+.015 k Cos[3t]},r c]','Component[t_,c_,0]:=c']
        pair=['Component[φ,Cos[φ],i]','Component[φ,Sin[φ],i]']
        for index in range(3):
            actual=vector_expression_curve(pair,index,smooth)
            expected=vector_expression_curve(['(1+.015 i Cos[3φ]) Cos[φ]','(1+.015 i Cos[3φ]) Sin[φ]'],index)
            for phi in (0,.37,1.5,3.,math.tau):
                self.assertLess(math.dist(actual.point(1,phi),expected.point(1,phi)),1e-12)
        base=dict(family='ring',ringMode='origamica',sides=8,rings=2,angle=36,offsetAngle=13,
                  outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15])
        actual=generate(dict(**base,vectorFunctionDefinitions=smooth,outerVectorTemplate=pair,creaseVectorTemplate=pair))
        inline=['(1+.015 i Cos[3φ]) Cos[φ]','(1+.015 i Cos[3φ]) Sin[φ]']
        expected=generate(dict(**base,outerVectorTemplate=inline,creaseVectorTemplate=inline))
        self.assertEqual(tuple(actual['stats'][key] for key in ('vertices','edges','faces')),(72,136,65))
        self.assertEqual(actual['fold']['edges_assignment'],expected['fold']['edges_assignment'])
        self.assertLess(max(math.dist(a,b) for a,b in zip(actual['fold']['vertices_coords'],expected['fold']['vertices_coords'])),1e-12)
        self.assertLess(max(math.dist(a,b) for a,b in zip(actual['source']['foldedForm'],expected['source']['foldedForm'])),1e-12)

    def test_ambiguous_discontinuous_modes_and_invalid_unused_modules_fail_closed(self):
        for definitions in (
            ['F[x_]:=x','F[x_,0]:=x'],['F[x_]:=x','F[0]:=0','F[0.0]:=0'],
            ['F[x_]:=x','F[0]:=F[1]'],['F[x_]:=x','F[1e999]:=0'],
            ['Module[x_]:=x'],['F[x_]:=Module[{a},x]'],
            ['F[x_]:=Module[{a=1,b=2,c=3,d=4,e=5},x]'],
            ['F[x_]:=Module[{a=1,a=2},x]'],['F[x_]:=Module[{a=1/0},x]'],
            ['F[x_]:=Module[{a=0^0},x]'],['F[x_]:=Module[{a=1e999},x]'],
            ['F[x_]:=Module[{a=Sin[x,x]},x]'],['F[x_]:=Module[{a=Unknown[x]},x]'],
            ['F[x_]:=Module[{a=x},a=1]'],['F[x_]:=Module[{a=x},a;1]'],
            ['F[x_]:=Module[{a=x},While[a>0,a]]'],['F[x_]:=Module[{a=1,b=a},b]'],
        ):
            with self.subTest(definitions=definitions),self.assertRaises(ValueError):
                validate_vector_function_definitions(definitions)
        for expression,definitions in (
            ('Bad[Cos[φ]]',['Bad[x_]:=x','Bad[0]:=1']),
            ('Bad[0,0]',['Bad[x_,k_]:=x+k','Bad[0,k_]:=1+k','Bad[x_,0]:=x']),
            ('Bad[φ]',['Bad[x_]:=Module[{unused=Sqrt[1-Cos[x]]},Cos[x]]']),
        ):
            with self.subTest(expression=expression),self.assertRaises(ValueError):
                compile_vector_component(expression,0,definitions)


if __name__=='__main__':
    unittest.main()
