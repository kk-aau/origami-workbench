"""Discrete original pfn[i]/rfn[i] dispatch must keep the certified CP kernel."""
import math
import unittest
from tessellate import generate, validate_request
from tessellation_ring_vector_expression import compile_vector_component, vector_expression_curve, validate_vector_function_definitions

DEFINITIONS=['Shape[t_,c_,k_]:=If[k<1,c,(1+.02 k Cos[3t])c]']
PAIR=['Shape[phi,Cos[phi],i]','Shape[phi,Sin[phi],i]']

def request(definitions=None,rings=2):
    return dict(family='ring',ringMode='origamica',sides=12,rings=rings,angle=35,
                offsetAngle=0,outerRadii=[round(1+.8*i,2) for i in range(rings+1)],
                creaseRadii=[round(1.35+.8*i,2) for i in range(rings)],
                vectorFunctionDefinitions=definitions or DEFINITIONS,
                outerVectorTemplate=PAIR,creaseVectorTemplate=PAIR)

def expanded_request(original):
    result={k:v for k,v in original.items() if k not in ('vectorFunctionDefinitions','outerVectorTemplate','creaseVectorTemplate')}
    rows=lambda n:[[f'(1+.02*{i}*Cos[3phi])*Cos[phi]',f'(1+.02*{i}*Cos[3phi])*Sin[phi]'] for i in range(n)]
    result.update(outerVectorExpressions=rows(original['rings']+1),creaseVectorExpressions=rows(original['rings']))
    return result

class RingIndexConditionalTests(unittest.TestCase):
    def test_original_numeric_input_produces_complete_cp_ff_equal_to_existing_expansion(self):
        for definitions in [DEFINITIONS,['Shape[t_,c_,k_]:=Piecewise[{{c,k<1}},(1+.02 k Cos[3t])c]'],
                            ['Shape[t_,c_,k_]:=Module[{index=k},If[index<1,c,(1+.02 index Cos[3t])c]]']]:
            for rings in (2,3):
                with self.subTest(definitions=definitions,rings=rings):
                    q=request(definitions,rings);actual=generate(q);expected=generate(expanded_request(q))
                    self.assertEqual(validate_request(q)['vectorFunctionDefinitions'],definitions)
                    self.assertEqual(actual['stats']['parameters']['vectorFunctionDefinitions'],definitions)
                    for field in ('edges_vertices','edges_assignment','faces_vertices'):
                        self.assertEqual(actual['fold'][field],expected['fold'][field])
                    for field in ('fold','source'):
                        a=actual['fold']['vertices_coords'] if field=='fold' else actual['source']['foldedForm']
                        b=expected['fold']['vertices_coords'] if field=='fold' else expected['source']['foldedForm']
                        self.assertEqual(len(a),len(b));self.assertLess(max(math.dist(x,y) for x,y in zip(a,b)),2e-11)
                    for key in ('geometry','local','lff'):self.assertEqual(actual['stats']['checks'][key]['status'],'passed')
                    self.assertEqual(actual['stats']['checks']['layerOrder']['status'],'not_checked')
                    self.assertEqual(actual['stats']['vertices'],12*(4*rings+1))

    def test_boundaries_and_lazy_numeric_branch_keep_original_if_and_piecewise_order(self):
        for comparator,yes in [('<',False),('<=',True),('>',False),('>=',True)]:
            self.assertEqual(compile_vector_component(f'If[i{comparator}1,2,3]',1)(0,1)[0],(2,2) if yes else (3,3))
        for formula in ('If[i<1,Cos[phi],Cos[phi]/i]',
                        'Piecewise[{{Cos[phi],i<1},{Cos[phi]/i,i>=1}},Sin[phi]]'):
            fn=compile_vector_component(formula,0);self.assertAlmostEqual(fn(.3,.3)[0][0],math.cos(.3),places=12)
        first=compile_vector_component('Piecewise[{{2,i>=1},{3,i>=0}},4]',1)
        self.assertEqual(first(0,1)[0],(2,2))
        fallback=compile_vector_component('Piecewise[{{2,i<0}},3]',1)
        self.assertEqual(fallback(0,1)[0],(3,3))
        nested=compile_vector_component('If[i<1,1,If[i<2,2,3]]',2)
        self.assertEqual(nested(0,1)[0],(3,3))

    def test_formal_alias_and_lexical_scope_do_not_bind_a_parameter_called_i_incorrectly(self):
        f=compile_vector_component('Swap[i,phi]',2,['Swap[phi_,i_]:=If[phi>=2,Cos[i],Sin[i]]'])
        self.assertAlmostEqual(f(.4,.4)[0][0],math.cos(.4),places=12)
        f=compile_vector_component('S[phi,i]',2,['S[t_,k_]:=Module[{k=k-1},If[k<1,Sin[t],Cos[t]]]'])
        self.assertAlmostEqual(f(.4,.4)[0][0],math.cos(.4),places=12)

    def test_angular_if_unsafe_syntax_recursion_and_unselected_declarations_fail_closed(self):
        for formula in ('If[Cos[phi]>=0,Cos[phi],Sin[phi]]','If[phi<1,1,2]',
                        'If[i<1<2,1,2]','If[i<1,1]','If[i<1,1,2,3]','If[i==1,1,2]',
                        'If[i<1,1,Unknown[phi]]','If[i<1,1,__import__[phi]]'):
            with self.subTest(formula=formula),self.assertRaises(ValueError):compile_vector_component(formula,0)
        for defs in (['F[x_]:=If[x<1,1,F[x]]'],['If[x_]:=x'],['F[x_]:=If[x<1,1,Print[x]]'],
                     ['F[x_]:=If[x<1,1,1/0]']):
            with self.subTest(defs=defs),self.assertRaises(ValueError):validate_vector_function_definitions(defs)

    def test_angular_piecewise_c1_and_all_original_curve_certificates_remain_required(self):
        with self.assertRaisesRegex(ValueError,'一阶连续'):
            compile_vector_component('Piecewise[{{2,Cos[phi]>=0}},1]',0)
        safe=compile_vector_component('Piecewise[{{1+.04 Cos[phi]^2,Cos[phi]>=0}},1+.02 Cos[phi]^2]',0)
        self.assertAlmostEqual(safe(math.pi/2,math.pi/2)[0][0],1,places=12)
        for pair in (['If[i<1,0,Cos[phi]]','If[i<1,0,Sin[phi]]'],
                     ['If[i<1,Cos[phi],Cos[phi]]','If[i<1,-Sin[phi],Sin[phi]]'],
                     ['If[i<1,Cos[2phi],Cos[phi]]','If[i<1,Sin[2phi],Sin[phi]]']):
            with self.subTest(pair=pair),self.assertRaises(ValueError):vector_expression_curve(pair,0)

if __name__=='__main__':unittest.main()
