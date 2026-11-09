"""P31 deterministic numeric Modules: lexical semantics and real CP/FF."""
import math
import unittest

from tessellate import generate, validate_request
from tessellation_ring_original import ring_function_graphics_query
from tessellation_ring_vector_expression import (
    compile_vector_component, validate_vector_function_definitions, vector_expression_curve,
)


ORIGINAL = ['F[x_,i_]:=Sign[x] Abs[x]^(1/(1+i))', 'F[0,i_]:=0', 'F[x_,0]:=x']
LOCAL_ORIGINAL = ['Basis[x_,i_]:=Module[{g},g[t_,k_]:=Sign[t] Abs[t]^(1/(1+k));g[0,k_]:=0;g[t_,0]:=t;g[x,i]]']
SMOOTH = ['Component[t_,c_,k_]:=Module[{r,g},r=1+.015 k Cos[3t];g[x_]:=r x;g[c]]',
          'Component[t_,c_,0]:=c']


class NumericModuleBodyTests(unittest.TestCase):
    def scalar(self, body, call='H[Cos[phi]]', extra=()):
        return compile_vector_component(call,2,['H[x_]:='+body]+list(extra))

    def test_sequence_assignment_and_reassignment_keep_nonlinear_value_and_derivative(self):
        function=self.scalar('Module[{a},a=Exp[.02 x];a=a Sqrt[1+.04 x];a]')
        for phi in (0,.3,1.7,math.tau):
            x=math.cos(phi);expected=math.exp(.02*x)*math.sqrt(1+.04*x)
            derivative=-math.sin(phi)*expected*(.02+.02/(1+.04*x))
            value,slope=function(phi,phi)
            self.assertAlmostEqual(value[0],expected,places=12)
            self.assertAlmostEqual(slope[0],derivative,places=12)

    def test_set_and_setdelayed_capture_different_scalar_values(self):
        immediate=self.scalar('Module[{a=1,g},g[t_]=a t;a=2;g[x]]')
        delayed=self.scalar('Module[{a=1,g},g[t_]:=a t;a=2;g[x]]')
        for phi in (.4,2.):
            self.assertAlmostEqual(immediate(phi,phi)[0][0],math.cos(phi),places=12)
            self.assertAlmostEqual(delayed(phi,phi)[0][0],2*math.cos(phi),places=12)
            self.assertAlmostEqual(immediate(phi,phi)[1][0],-math.sin(phi),places=12)
            self.assertAlmostEqual(delayed(phi,phi)[1][0],-2*math.sin(phi),places=12)

    def test_initializers_outer_scope_and_nested_assignment_order_are_lexical(self):
        function=self.scalar('Module[{x=2,a=x},a Cos[x]]')
        self.assertAlmostEqual(function(.4,.4)[0][0],math.cos(.4)*math.cos(2),places=12)
        for body,expected in (
            ('Module[{a=1},a+Module[{},a=2;a]]',3),
            ('Module[{a=1,b},b=Module[{},a=2;a];a+b]',4),
            ('Module[{a=1,b},b=Module[{a=3},a=4;a];a+b]',5),
        ):
            self.assertEqual(self.scalar(body)(0,1)[0],(expected,expected))
        with self.assertRaises(ValueError):
            self.scalar('Module[{a,b},b=a+Module[{},a=1;a];b]')

    def test_function_parameters_closures_and_nested_shadow_do_not_capture_caller(self):
        function=self.scalar('Module[{a=1,g},g[t_]:=a t;Module[{a=2},g[x]]]')
        self.assertAlmostEqual(function(.4,.4)[0][0],math.cos(.4),places=12)
        function=self.scalar('Module[{t=2,g},g[t_]:=t+1;g[x]]')
        self.assertAlmostEqual(function(.4,.4)[0][0],math.cos(.4)+1,places=12)
        function=self.scalar('Module[{g},g[t_]:=Cos[t];Module[{g},g[t_]:=Sin[t];g[x]]+g[x]]','H[phi]')
        self.assertAlmostEqual(function(.4,.4)[0][0],math.sin(.4)+math.cos(.4),places=12)

    def test_local_global_function_conflicts_preserve_each_lexical_call(self):
        function=self.scalar('Module[{g},g[t_]:=t;g[x]]',extra=['g[t_]:=2t'])
        self.assertAlmostEqual(function(.4,.4)[0][0],math.cos(.4),places=12)
        # External B is defined outside the Module. It keeps its external g,
        # even when the invocation of B occurs under another local g.
        function=self.scalar('Module[{g},g[t_]:=t;B[x]+g[x]]',extra=['g[t_]:=2t','B[t_]:=g[t]'])
        self.assertAlmostEqual(function(.4,.4)[0][0],3*math.cos(.4),places=12)
        # Initializer g[1] uses the outer g before the new scalar g exists.
        function=self.scalar('Module[{g=g[1]},g x]',extra=['g[t_]:=2t'])
        self.assertAlmostEqual(function(.4,.4)[0][0],2*math.cos(.4),places=12)

    def test_forward_acyclic_local_functions_and_pure_nested_modules_are_supported(self):
        function=self.scalar('Module[{g,h},g[t_]:=h[t];h[t_]:=Module[{a},a=Cos[t];a];g[x]]','H[phi]')
        self.assertAlmostEqual(function(.4,.4)[0][0],math.cos(.4),places=12)

    def test_full_original_three_modes_inside_module_make_same_actual_cp_ff(self):
        base=dict(family='ring',ringMode='origamica',sides=20,rings=3,angle=45,offsetAngle=6,
                  outerRadii=[.75,1.75,2.75,3.75],creaseRadii=[1,2,3])
        original={**base,'vectorFunctionDefinitions':ORIGINAL,
                  'outerVectorTemplate':['F[Cos[phi],i]','F[Sin[phi],i]'],
                  'creaseVectorTemplate':['F[Cos[phi],i]','F[Sin[phi],i]']}
        pair=['Basis[Cos[phi],i]','Basis[Sin[phi],i]']
        request={**base,'vectorFunctionDefinitions':LOCAL_ORIGINAL,
                 'outerVectorTemplate':pair,'creaseVectorTemplate':pair}
        actual,expected=generate(request),generate(original)
        self.assertEqual(tuple(actual['stats'][key] for key in ('vertices','edges','faces')),(260,500,241))
        self.assertEqual(actual['fold'],expected['fold'])
        self.assertEqual(actual['source']['foldedForm'],expected['source']['foldedForm'])
        self.assertEqual(ring_function_graphics_query(request),ring_function_graphics_query(original))
        self.assertEqual(validate_request(request)['vectorFunctionDefinitions'],LOCAL_ORIGINAL)
        for index in range(4):
            self.assertEqual(vector_expression_curve(pair,index,LOCAL_ORIGINAL).power,index+1)

    def test_nonconstant_local_helper_and_assignment_generate_real_smooth_cp_ff(self):
        base=dict(family='ring',ringMode='origamica',sides=8,rings=2,angle=36,offsetAngle=13,
                  outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15])
        pair=['Component[phi,Cos[phi],i]','Component[phi,Sin[phi],i]']
        inline=['(1+.015 i Cos[3phi]) Cos[phi]','(1+.015 i Cos[3phi]) Sin[phi]']
        request={**base,'vectorFunctionDefinitions':SMOOTH,'outerVectorTemplate':pair,'creaseVectorTemplate':pair}
        actual=generate(request);expected=generate({**base,'outerVectorTemplate':inline,'creaseVectorTemplate':inline})
        self.assertEqual(tuple(actual['stats'][key] for key in ('vertices','edges','faces')),(72,136,65))
        self.assertEqual(actual['fold']['edges_assignment'],expected['fold']['edges_assignment'])
        for a,b in ((actual['fold']['vertices_coords'],expected['fold']['vertices_coords']),
                    (actual['source']['foldedForm'],expected['source']['foldedForm'])):
            self.assertLess(max(math.dist(x,y) for x,y in zip(a,b)),1e-12)
        rows=lambda count:[[part.replace(',i]',f',{index}]') for part in pair] for index in range(count)]
        per_ring=generate({**base,'vectorFunctionDefinitions':SMOOTH,
                           'outerVectorExpressions':rows(3),'creaseVectorExpressions':rows(2)})
        self.assertEqual(actual['fold'],per_ring['fold'])
        self.assertEqual(actual['source']['foldedForm'],per_ring['source']['foldedForm'])

    def test_all_rhs_and_unused_definitions_fail_closed_without_external_state(self):
        bad=(
            'Module[{a},a=x;outside=1;a]', 'Module[{a},x=1;a=x;a]',
            'Module[{a},a=x;Print[a];a]', 'Module[{a},a=x;While[a>0,a];a]',
            'Module[{a},a=x;a+=1;a]', 'Module[{a},a:=x;a]',
            'Module[{a},a=1/0;a=x;a]', 'Module[{a},a=0^0;a=x;a]',
            'Module[{a},a=1e999;a=x;a]', 'Module[{a},a=Sin[x,x];a=x;a]',
            'Module[{g},g[t_]:=t+free;g[x]]', 'Module[{g},g[t_]:=g[t];x]',
            'Module[{g,h},g[t_]:=h[t];h[t_]:=g[t];x]',
            'Module[{g},g[t_]:={t,t};x]', 'Module[{g},g[t_]:=t>0;x]',
            'Module[{g},g[t_]:=Cos;x]', 'Module[{g},g[t_]:=1/0;x]',
            'Module[{g},g[t_]:=Module[{bad=1/0},t];x]',
            'Module[{a=1,g},g[t_]:=Module[{},a=2;t];g[x]]',
            'Module[{g},g[0]:=0;x]', 'Module[{g},g[t_]:=t;g[0]:=0;g[0.0]:=0;x]',
            'Module[{g},g[t_]:=t;g[t_,k_]:=t;x]',
            'Module[{g},g[t_]:=t;g=1;x]', 'Module[{g=1},g[t_]:=t;x]',
            'Module[{g},outside[t_]:=t;x]', 'Module[{a},a=free;a]',
        )
        for body in bad:
            with self.subTest(body=body),self.assertRaises(ValueError):
                validate_vector_function_definitions(['H[x_]:='+body])
        # These execute despite being overwritten or unused; their actual
        # phi-domain must still be proved with the unchanged interval gate.
        for body in ('Module[{a},a=Sqrt[1-Cos[x]];a=1;a]',
                     'Module[{a},a=1/(1-Cos[x]);a=1;a]'):
            with self.subTest(body=body),self.assertRaises(ValueError):self.scalar(body,'H[phi]')
        with self.assertRaises(ValueError):
            self.scalar('Module[{g},g[t_]:=t;g[0]:=1;g[x]]')
        with self.assertRaises(ValueError):
            compile_vector_component('Module[{g},g[t_]:=B[t,t];Cos[phi]]',2,['B[t_]:=t'])

    def test_existing_complexity_budget_applies_after_lexical_elimination(self):
        # More than four safe declarations are accepted; there was no semantic
        # reason for the old capacity limit. Scalar initialization is still
        # charged to the executable AST budget.
        self.assertEqual(self.scalar('Module[{a=1,b=2,c=3,d=4,f=5,h=6},a+b+c+d+f+h]')(0,1)[0],(21,21))
        letters='abcdfghjklmnopqrstuvwxyzABCDEFGHIJ'
        initializers=','.join(name+'=0' for name in letters[:20])
        self.assertAlmostEqual(self.scalar('Module[{'+initializers+'},x]')(.4,.4)[0][0],math.cos(.4),places=12)
        variables=','.join(letters[:33])
        with self.assertRaisesRegex(ValueError,'32'):
            validate_vector_function_definitions(['H[x_]:=Module[{'+variables+'},x]'])
        with self.assertRaisesRegex(ValueError,'展开|复杂'):
            self.scalar('Module[{g},g[t_]:=t+t;g[g[g[g[g[g[x]]]]]]]')


if __name__=='__main__':unittest.main()
