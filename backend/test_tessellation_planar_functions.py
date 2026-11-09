import copy,math,unittest
from tessellation_planar_functions import PRESET,query_planar_functions,validate_planar_function_query
from tessellate import dispatch_request

def query(mode='planarize',fn=None,args=None):return {'family':'planar-functions-native','mode':mode,'input':fn or copy.deepcopy(PRESET['input']),'arguments':args if args is not None else [[0.],[.5],[1.]]}

class PlanarFunctions(unittest.TestCase):
 def test_original_pure_slot_function_drops_third_before_evaluation(self):
  q=query(args=[[0.],[math.pi/2],[2.]])
  r=query_planar_functions(q);self.assertEqual(r['convertedFunction'],{'form':'slots','arity':1,'body':['Cos[#]','Sin[#]']})
  for row in r['sample']['rows']:
   s=row['arguments'][0];self.assertEqual(row['error'],None);self.assertEqual(row['values'],[math.cos(s),math.sin(s)])
  self.assertEqual(r['source']['definitionCell'],'In[3844]');self.assertFalse(r['source']['originalDirectVectorOverload'])
 def test_discarded_identically_zero_denominator_and_large_exp_are_not_evaluated(self):
  for dropped in ['1/(#-#)','exp(1000)','sqrt(-1)','Tan[Pi/2]']:
   r=query_planar_functions(query(fn={'form':'slots','arity':1,'body':['#','2#',dropped]}));self.assertTrue(all(row['values']==[row['arguments'][0],2*row['arguments'][0]] for row in r['sample']['rows']))
 def test_explicit_parameter_list_preserved_with_multiple_and_unused_arguments(self):
  fn={'form':'parameters','parameters':['x','y','unused'],'body':['2 x+y','x^2-y','1/(x-x)']};q=query(fn=fn,args=[[2,3,9],[-1,4,0]])
  r=query_planar_functions(q);self.assertEqual(r['convertedFunction']['parameters'],fn['parameters']);self.assertEqual([row['values'] for row in r['sample']['rows']],[[7.,1.],[2.,-3.]])
 def test_unplanarize_appends_exact_zero_to_original_function_form(self):
  for fn in [{'form':'slots','arity':2,'body':['#2','#1+#2']},{'form':'parameters','parameters':['x','y'],'body':['y','x+y']}]:
   r=query_planar_functions(query('unplanarize',fn,[[2,3]]));self.assertEqual(r['convertedFunction']['body'],fn['body']+['0']);self.assertEqual(r['sample']['rows'][0]['values'],[3.,5.,0.]);self.assertEqual(r['source']['definitionCell'],'In[3849]')
 def test_zero_argument_and_stationary_function_need_no_frame_regularity(self):
  r=query_planar_functions(query('unplanarize',{'form':'parameters','parameters':[],'body':['0','sqrt(0)']},[[]]));self.assertEqual(r['sample']['rows'][0]['values'],[0.,0.,0.])
 def test_retained_undefined_components_preserve_each_point_and_never_invent_coordinates(self):
  r=query_planar_functions(query('unplanarize',{'form':'slots','arity':1,'body':['sqrt(#)','1/#']},[[-1],[0],[1],[4]]))
  self.assertEqual([row['arguments'] for row in r['sample']['rows']],[[-1.],[0.],[1.],[4.]])
  self.assertEqual([row['values'] for row in r['sample']['rows']],[None,None,[1.,1.,0.],[2.,.25,0.]])
  self.assertTrue(all(row['error'] for row in r['sample']['rows'][:2]));self.assertFalse(r['certification']['continuousDomainCertified'])
 def test_two_way_embedding_identity_and_loss_of_original_z(self):
  first=query_planar_functions(query('unplanarize',{'form':'slots','arity':1,'body':['#','#^2']},[[.5]]));second=query_planar_functions(query('planarize',first['convertedFunction'],[[.5]]));self.assertEqual(second['convertedFunction']['body'],['#','#^2']);self.assertEqual(second['sample']['rows'][0]['values'],[.5,.25])
  first=query_planar_functions(query(fn={'form':'slots','arity':1,'body':['#','#^2','7']},args=[[.5]]));second=query_planar_functions(query('unplanarize',first['convertedFunction'],[[.5]]));self.assertEqual(second['sample']['rows'][0]['values'],[.5,.25,0.])
 def test_any_unsafe_component_is_rejected_including_discarded_component(self):
  for bad in ['__import__(#)','x.__class__','open(#)','[1,2]','##','#0','#2','zzslot1','__unused_parameter__','True']:
   fn={'form':'slots','arity':1,'body':['#','0',bad]}
   with self.subTest(bad=bad),self.assertRaises(ValueError):validate_planar_function_query(query(fn=fn))
 def test_wrong_dimension_direct_vector_and_bad_parameter_contract_are_atomic(self):
  for fn in [[1,2,3],{'form':'slots','arity':True,'body':['#','0','0']},{'form':'slots','arity':1,'body':['#','0']},{'form':'parameters','parameters':['x','x'],'body':['x','0','0']},{'form':'parameters','parameters':['Sin'],'body':['1','0','0']},{'form':'parameters','parameters':[['x']],'body':['1','0','0']}]:
   with self.subTest(fn=fn),self.assertRaises(ValueError):validate_planar_function_query(query(fn=fn))
  for args in [[[1,2]],[[True]],[[math.inf]],[[1e13]],[[0]]*130]:
   with self.subTest(args=args),self.assertRaises(ValueError):validate_planar_function_query(query(args=args))
 def test_new_public_dispatch_returns_function_data_and_preserves_query(self):
  q=query();r=dispatch_request({**q,'operation':'planar-functions'});self.assertEqual(r,query_planar_functions(q));self.assertEqual(q,query())

if __name__=='__main__':unittest.main()
