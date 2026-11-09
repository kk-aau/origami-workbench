import copy,json,math,unittest,ast
from pathlib import Path
from functools import lru_cache
import mpmath as mp
from tessellate import generate
from tessellation_ring_vector_expression import compile_vector_component,ring_log_numeric_domain
from tessellation_ring_log_interval import argument_bounds
ROOT=Path(__file__).parents[1]
FIX=json.loads((ROOT/'tests/fixtures/ring-log-20261010.json').read_text(encoding='utf8'))
@lru_cache(None)
def actual():return [(c,generate(c['params'])) for c in FIX['cases']]
class RingLogTests(unittest.TestCase):
 def test_three_original_function_inputs_really_construct_all_original_vertices_edges_faces(self):
  for c,r in actual():
   self.assertEqual([r['stats'][k] for k in ['vertices','edges','faces']],[108,204,97]);self.assertEqual(r['stats']['checks']['geometry']['crossingCount'],0);self.assertEqual(r['stats']['checks']['local']['interiorVertices'],84);self.assertEqual(r['stats']['checks']['local']['status'],'passed');self.assertEqual(r['stats']['checks']['lff']['status'],'passed');self.assertLess(r['source']['closureError'],1e-10);d=r['source']['logNumericDomain'];self.assertFalse(d['wolframExecuted']);self.assertFalse(d['machineCheckedRealArithmetic']);self.assertEqual(d['roundingModel'],'binary64-outward-2ulp/libm-endpoints-2ulp-assumed');self.assertEqual(r['stats']['parameters'],c['params'])
 def test_independent_90_digit_values_and_derivatives_in_outward_log_intervals(self):
  mp.mp.dps=90;f=compile_vector_component('Log[2+Sin[phi]]');g=compile_vector_component('Log[Log[3+Sin[phi]]]')
  for k in range(64):
   a,b=math.tau*k/64,math.tau*(k+1)/64
   for function,oracle,derivative in [(f,lambda t:mp.log(2+mp.sin(t)),lambda t:mp.cos(t)/(2+mp.sin(t))),(g,lambda t:mp.log(mp.log(3+mp.sin(t))),lambda t:mp.cos(t)/((3+mp.sin(t))*mp.log(3+mp.sin(t))))]:
    value,d=function(a,b)
    for j in range(9):
     t=mp.mpf(a)+(mp.mpf(b)-a)*j/8;v,w=oracle(t),derivative(t);self.assertLessEqual(mp.mpf(value[0]),v);self.assertLessEqual(v,mp.mpf(value[1]));self.assertLessEqual(mp.mpf(d[0]),w);self.assertLessEqual(w,mp.mpf(d[1]))
 def test_native_point_value_derivative_and_periodicity_are_not_sample_interpolation(self):
  f=compile_vector_component('Log[2+Sin[phi]]')
  for t in [0,.12,math.pi/2,math.pi,1.5*math.pi,math.tau]:
   v,d=f(t,t);self.assertEqual(v,(math.log(2+math.sin(t)),)*2);self.assertEqual(d,(math.cos(t)/(2+math.sin(t)),)*2)
  for t in [0,.3,2.]:self.assertAlmostEqual(f(t,t)[0][0],f(t+math.tau,t+math.tau)[0][0],places=14)
 def test_log_zero_negative_cross_zero_unproved_positive_overflow_and_wrong_arity_rejected(self):
  for source in ['Log[0]','Log[-1]','Log[1+Sin[phi]]','Log[.1+Sin[8phi]]','Log[(1000000+1e-12 Sin[phi])-1000000+2e-12]','Log[Exp[1000]]','Log[2,3]','_ring_log(2)']:
   with self.subTest(source=source),self.assertRaises(ValueError):
    f=compile_vector_component(source);f(0,math.tau)
  f=compile_vector_component('Log[1e-320+0*Sin[phi]]');self.assertTrue(math.isfinite(f(.3,.3)[0][0]));self.assertEqual(f(.3,.3)[1],(0.,0.))
 def test_explicit_same_name_legacy_definitions_keep_priority_no_fake_intrinsic_descriptor(self):
  for source,defs,expected in [('Log[Cos[phi]]',['Log[x_]:=x+2'],2+math.cos(.1)),('log[Sin[phi]]',['log[x_]:=x+2'],2+math.sin(.1))]:self.assertEqual(compile_vector_component(source,0,defs)(.1,.1)[0],(expected,expected))
  p=copy.deepcopy(FIX['cases'][0]['params']);p.update(vectorFunctionDefinitions=['Log[t_,k_]:=1+.03 Sin[t]'],outerVectorTemplate=['Log[phi,i] Cos[phi]','Log[phi,i] Sin[phi]'],creaseVectorTemplate=['Log[phi,i] Cos[phi]','Log[phi,i] Sin[phi]']);self.assertIsNone(ring_log_numeric_domain(p));self.assertNotIn('logNumericDomain',generate(p)['source'])
 def test_original_nonlog_complete_responses_stay_identical(self):
  for c in FIX['unchangedControls']:
   r=json.loads(json.dumps(generate(c['params'])));expected=copy.deepcopy(c['response']);r['stats'].pop('elapsedMs');expected['stats'].pop('elapsedMs');self.assertEqual(r,expected,c['name'])
if __name__=='__main__':unittest.main()
