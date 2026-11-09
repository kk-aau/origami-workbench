import json,math,unittest
from tessellate import generate
from tessellation_ring_original import ring_function_graphics_query
from tessellation_ring_vector_expression import compile_vector_component,vector_expression_curve,validate_vector_function_definitions

IF_DEF=['Radial[t_,k_]:=If[Cos[t]>=0,1+(.04+.002 k) Cos[t]^2,1+(.02+.001 k) Cos[t]^2]']
PW_DEF=['Radial[t_,k_]:=Piecewise[{{1+(.04+.002 k) Cos[t]^2,Cos[t]>=0}},1+(.02+.001 k) Cos[t]^2]']
PAIR=['Radial[phi,i] Cos[phi]','Radial[phi,i] Sin[phi]']
def request(definitions=IF_DEF,rings=2):
 return dict(family='ring',ringMode='origamica',sides=12,rings=rings,growth=1.8,scale=.3,angle=35,offsetAngle=0,
             outerRadii=[round(1+.8*i,2) for i in range(rings+1)],creaseRadii=[round(1.35+.8*i,2) for i in range(rings)],
             vectorFunctionDefinitions=definitions,outerVectorTemplate=PAIR,creaseVectorTemplate=PAIR)

class RingAngularIfTests(unittest.TestCase):
 def test_actual_original_cp_ff_and_all_source_fields_equal_existing_piecewise(self):
  a,b=generate(request()),generate(request(PW_DEF))
  for k in ('fold','mother','source'):self.assertEqual(json.loads(json.dumps(a[k])),json.loads(json.dumps(b[k])))
  self.assertEqual(a['stats']['parameters']['vectorFunctionDefinitions'],IF_DEF)
  self.assertEqual(a['stats']['vertices'],108);self.assertEqual(a['stats']['edges'],204);self.assertEqual(a['stats']['faces'],97)
  for k in ('geometry','local','lff'):self.assertEqual(a['stats']['checks'][k]['status'],'passed')
  self.assertEqual(a['stats']['checks']['layerOrder']['status'],'not_checked')
  self.assertEqual(ring_function_graphics_query(request()),ring_function_graphics_query(request(PW_DEF)))
  for face in a['fold']['faces_vertices']:
   for i,u in enumerate(face):
    for v in face[i+1:]:self.assertLess(abs(math.dist(a['fold']['vertices_coords'][u],a['fold']['vertices_coords'][v])-math.dist(a['source']['foldedForm'][u],a['source']['foldedForm'][v])),2e-6)

 def test_all_comparators_reversed_operands_nonzero_gate_and_c1_interval_derivatives_match(self):
  for comparator in ('>','>=','<','<='):
   for condition,gate in [(f'Cos[phi]{comparator}0','Cos[phi]'),(f'0{comparator}Cos[phi]','Cos[phi]'),(f'Cos[phi]{comparator}.2','(Cos[phi]-.2)')]:
    a,b=f'1+.04 {gate}^2',f'1+.02 {gate}^2';direct=compile_vector_component(f'If[{condition},{a},{b}]',2)
    expected=compile_vector_component(f'Piecewise[{{{{{a},{condition}}}}},{b}]',2)
    for lo,hi in ((0,.01),(.1,.7),(1,2),(math.pi/2-1e-5,math.pi/2+1e-5),(math.acos(.2)-1e-5,math.acos(.2)+1e-5),(3*math.pi/2-1e-5,3*math.pi/2+1e-5)):
     self.assertEqual(direct(lo,hi),expected(lo,hi))
  for t in (math.pi/2,3*math.pi/2):
   f=compile_vector_component('If[Cos[phi]>=0,1+.04 Cos[phi]^2,1+.02 Cos[phi]^2]')
   self.assertAlmostEqual(f(t,t)[0][0],1,places=14);self.assertAlmostEqual(f(t,t)[1][0],0,places=14)

 def test_formal_alias_module_and_index_constant_outer_if_propagate_exact_c1(self):
  defs=['Radial[t_,k_]:=Module[{g=Cos[t]},If[g>=0,1+.04 g^2,1+.02 g^2]]']
  fixed=['Radial[t_,k_]:=Piecewise[{{1+.04 Cos[t]^2,Cos[t]>=0}},1+.02 Cos[t]^2]']
  for i in range(3):
   actual,expected=vector_expression_curve(PAIR,i,defs),vector_expression_curve(PAIR,i,fixed)
   for t in (0,.4,1.2,math.pi/2,math.pi,3*math.pi/2,math.tau):self.assertEqual(actual.point(1,t),expected.point(1,t))
  nested='If[i<1,1,If[Cos[phi]>=0,1+.04 Cos[phi]^2,1+.02 Cos[phi]^2]]'
  self.assertEqual(compile_vector_component(nested,0)(0,math.tau),((1,1),(0,0)))
  with self.assertRaisesRegex(ValueError,'一阶连续'):compile_vector_component('If[i<1,1,If[Cos[phi]>=0,1,2]]',1)
  private=compile_vector_component('If[Cos[phi]>=0,Module[{a=1},a],1]')
  self.assertEqual(private(0,math.tau),((1,1),(0,0)))

 def test_held_branches_cannot_write_external_module_state_and_fake_a_c1_source(self):
  for formula in ('Module[{a=1},If[Cos[phi]>=0,Module[{},a=2;1],1] a]',
                  'Module[{a=1},If[i<1,1,Module[{},a=2;1]] a]',
                  'Module[{a=1},Piecewise[{{If[Cos[phi]>=0,Module[{},a=2;1],1],Sin[phi]>=0}},1] a]'):
   with self.subTest(formula=formula),self.assertRaises(ValueError):compile_vector_component(formula,0)
  with self.assertRaises(ValueError):validate_vector_function_definitions(['R[t_]:=Module[{a=1},If[Cos[t]>=0,Module[{},a=2;1],1] a]'])
  # Existing unconditional Module ordering/writes keep their original result.
  self.assertEqual(compile_vector_component('Module[{a=1},a+Module[{},a=2;a]]')(0,1),((3,3),(0,0)))

 def test_non_c1_all_active_branch_seams_and_periodic_gate_reject_without_sampling(self):
  for formula in ('If[Cos[phi]>=0,1,2]','If[Cos[phi]>=0,1+.04 Cos[phi],1+.02 Cos[phi]]',
                  'If[Cos[phi]>=0,1+.04 Sin[phi]^2,1+.02 Sin[phi]^2]',
                  'If[phi<1,1+.04 (phi-1)^2,1+.02 (phi-1)^2]',
                  'If[Cos[phi]>=0,If[Sin[phi]>=0,1,2],1]',
                  'Piecewise[{{If[Cos[phi]>=0,1,2],Sin[phi]>=0}},1]'):
   with self.subTest(formula=formula),self.assertRaises(ValueError):compile_vector_component(formula,0)

 def test_unknown_dangerous_and_recursive_unselected_source_is_rejected_before_conversion(self):
  for formula in ('If[i<1,Cos[phi],Unknown[phi]]','If[i<1,Cos[phi],__import__[phi]]',
                  'If[Cos[phi]>=0,Cos[phi],Cos[phi].x]','If[Cos[phi]>=0,1,Print[phi]]',
                  'If[Cos[phi]==0,1,2]','If[Cos[phi]>=0,1,1/0]'):
   with self.subTest(formula=formula),self.assertRaises(ValueError):compile_vector_component(formula,0)
  for defs in (['F[t_]:=If[1<2,Cos[t],F[t]]'],['F[t_]:=If[Cos[t]>=0,1,Unknown[t]]'],['F[t_]:=If[1<2,Cos[t],1/0]']):
   with self.subTest(defs=defs),self.assertRaises(ValueError):validate_vector_function_definitions(defs)

 def test_existing_norm_winding_nesting_and_first_exit_certificates_still_reject_invalid_curves(self):
  for pair in (['If[Cos[phi]>=0,0,0]','If[Cos[phi]>=0,0,0]'],
               ['If[Cos[phi]>=0,Cos[phi],Cos[phi]]','-Sin[phi]'],
               ['If[Cos[phi]>=0,Cos[2phi],Cos[2phi]]','Sin[2phi]'],
               ['If[Cos[phi]>=0,10 Cos[phi],10 Cos[phi]]','10 Sin[phi]']):
   with self.subTest(pair=pair),self.assertRaises(ValueError):vector_expression_curve(pair,0)
  bad=request();bad.update(outerVectorTemplate=['2 Cos[phi]','2 Sin[phi]'])
  with self.assertRaises(ValueError):generate(bad)

if __name__=='__main__':unittest.main()
