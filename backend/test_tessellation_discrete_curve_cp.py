import copy
import json
import math
from pathlib import Path
import unittest
from tessellate import generate,validate_request
from tessellation_curved_discretization_generic import query_discretization_generic
from tessellation_discrete_curve_cp import source_preset


class DiscreteCurveCPTests(unittest.TestCase):
 def test_default_is_true_closed_four_face_cp_and_preserves_original_multiplier_result(self):
  result=generate({'family':'discrete-curve-cp'});fold=result['fold'];checks=result['stats']['checks']
  self.assertEqual([result['stats'][k] for k in ('vertices','edges','faces')],[9,12,4])
  self.assertEqual(fold['edges_assignment'].count('B'),8);self.assertEqual(fold['edges_assignment'].count('U'),4)
  for face,edge_ids in zip(fold['faces_vertices'],fold['faces_edges']):
   for a,b,edge in zip(face,face[1:]+face[:1],edge_ids):self.assertEqual(tuple(sorted((a,b))),tuple(fold['edges_vertices'][edge]))
  self.assertEqual(checks['geometry']['status'],'passed');self.assertEqual(checks['local']['status'],'incomplete')
  self.assertEqual(checks['lff']['status'],'incomplete');self.assertEqual(checks['layerOrder']['status'],'not_checked')
  self.assertEqual(result['source']['nativeDiscretization'],query_discretization_generic(source_preset()))
  expected=math.cos(math.pi/18)/math.sin(math.pi/9)
  for value,sign in zip(result['source']['nativeDiscretization']['sample']['multipliers'],(1,-1,1)):
   self.assertAlmostEqual(value,sign*expected,places=12)
  self.assertEqual(result['source']['assignmentOrigin'],'unspecified')
  self.assertFalse(result['source']['staticGlobalIsometryChecked']);self.assertNotIn('foldedForm3D',result['source'])

 def test_manual_assignment_is_explicit_and_never_bypasses_local_or_lff(self):
  for assignments,local,lff in ((['M','M','V','M'],'passed','passed'),
                                (['M','M','M','V'],'passed','failed'),
                                (['M']*4,'failed','failed'),(['M','U','V','M'],'incomplete','incomplete')):
   with self.subTest(assignments=assignments):
    r=generate({'family':'discrete-curve-cp','assignments':assignments})
    self.assertEqual(r['source']['assignmentOrigin'],'explicit-user')
    self.assertEqual(r['stats']['checks']['local']['status'],local)
    self.assertEqual(r['stats']['checks']['lff']['status'],lff)
    self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')

 def test_affine_coordinate_units_translation_rotation_and_raw_vector_magnitude(self):
  base=generate({'family':'discrete-curve-cp'})
  for scale,angle,offset in ((.01,.3,[3,-2]),(2.,-1.,[-4,5]),(5.,0,[0,0])):
   q=source_preset();c,s=math.cos(angle),math.sin(angle)
   for key in ('foldPoints','leftRulings','rightRulings'):
    q[key]=[[scale*(c*x-s*y)+(offset[0] if key=='foldPoints' else 0),
              scale*(s*x+c*y)+(offset[1] if key=='foldPoints' else 0)] for x,y in q[key]]
   r=generate({'family':'discrete-curve-cp','source':q})
   for p,b in zip(r['fold']['vertices_coords'],base['fold']['vertices_coords']):
    self.assertAlmostEqual(p[0],scale*(c*b[0]-s*b[1])+offset[0],places=12)
    self.assertAlmostEqual(p[1],scale*(s*b[0]+c*b[1])+offset[1],places=12)
   self.assertEqual(r['stats']['checks']['geometry']['status'],'passed')
   self.assertEqual(r['stats']['parameters']['source'],q)

 def test_input_contract_refuses_null_wrong_types_and_out_of_scope_data(self):
  for key in ('source','leftWidth','rightWidth','assignments'):
   for value in (None,False,'0.4',{}):
    with self.subTest(key=key,value=value),self.assertRaises(ValueError):validate_request({'family':'discrete-curve-cp',key:value})
  for patch in ({'leftWidth':0},{'rightWidth':1001},{'assignments':['B']*4},{'assignments':['U']*3},
                {'paper':{'shape':'square','margin':.1}},{'source':{'family':'discretization-generic-native','mode':'system','rules':[],'parameters':[]}}):
   with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({'family':'discrete-curve-cp',**patch})
  q=source_preset();q['foldPoints'].append([2,0]);q['leftRulings'].append([0,1]);q['rightRulings'].append([0,-1])
  validated=validate_request({'family':'discrete-curve-cp','source':q})
  self.assertEqual(len(validated['assignments']),7)
  with self.assertRaises(ValueError):generate(validated)

 def test_rejects_crossing_flipped_degenerate_and_original_undefined_sources(self):
  variants=[]
  q=source_preset();q['leftRulings'][0]=[0,-1];variants.append(q)
  q=source_preset();q['foldPoints'][0]=[0,0];variants.append(q)
  q=source_preset();q['leftRulings'][1]=[0,0];variants.append(q)
  q=source_preset();q['rightRulings'][1]=[1,0];variants.append(q)
  for q in variants:
   with self.subTest(q=q),self.assertRaises(ValueError):generate({'family':'discrete-curve-cp','source':q})
  self.assertEqual(generate({'family':'discrete-curve-cp'})['stats']['checks']['geometry']['status'],'passed')

if __name__=='__main__':unittest.main()
