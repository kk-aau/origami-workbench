import unittest,json,math
from pathlib import Path
from collections import Counter
from tessellate import generate,validate_request
from tessellation_discrete_curve_cp import source_preset,internal_edges
from tessellation_curved_discretization_generic import query_discretization_generic

ROOT=Path(__file__).resolve().parents[1]
CASES=json.loads((ROOT/'tests/fixtures/discrete-curve-npoints-20261010.json').read_text(encoding='utf-8'))['cases']
OLD=json.loads((ROOT/'tests/fixtures/discrete-curve-cp-20261010.json').read_text(encoding='utf-8'))['cases']
def semantic(value):
 if isinstance(value,dict):return {k:semantic(v) for k,v in value.items() if k!='elapsedMs'}
 if isinstance(value,(list,tuple)):return [semantic(v) for v in value]
 return value

class FiniteNPointTests(unittest.TestCase):
 def test_all_finite_sample_counts_indexes_incidence_boundary_euler_and_native_source(self):
  for n in range(3,17):
   with self.subTest(n=n):
    q=source_preset(n);r=generate({'family':'discrete-curve-cp','source':q});g=r['fold'];stats=r['stats']
    self.assertEqual([stats[k] for k in ('vertices','edges','faces')],[3*n,5*n-3,2*n-2])
    self.assertEqual(g['vertices_coords'][:n],q['foldPoints'])
    self.assertEqual(stats['boundaryEdges'],2*n+2);self.assertEqual(stats['unassignedEdges'],3*n-5)
    self.assertEqual(stats['checks']['geometry']['status'],'passed');self.assertEqual(stats['checks']['local']['status'],'incomplete')
    self.assertEqual(r['source']['internalEdgeOrder'],[list(e) for e in internal_edges(n)])
    self.assertEqual(r['source']['nativeDiscretization'],query_discretization_generic(q))
    counts=Counter(tuple(sorted((a,b))) for f in g['faces_vertices'] for a,b in zip(f,f[1:]+f[:1]))
    self.assertEqual(len(g['vertices_coords'])-len(g['edges_vertices'])+len(g['faces_vertices']),1)
    self.assertTrue(all(counts[(i,i+1)]==2 for i in range(n-1)))
    self.assertTrue(all(counts[(i,n+i)]==2 and counts[(i,2*n+i)]==2 for i in range(1,n-1)))
    self.assertTrue(all(len(face)==4 for face in g['faces_vertices']))
    for f,es in zip(g['faces_vertices'],g['faces_edges']):
     for a,b,e in zip(f,f[1:]+f[:1],es):self.assertEqual(tuple(sorted((a,b))),tuple(g['edges_vertices'][e]))

 def test_authentic_original_six_chord_inputs_keep_raw_vectors_second_cross_curves_and_undefined_mv(self):
  row=next(c for c in CASES if c['name']=='original-six-unassigned');p=row['params'];r=generate(p)
  self.assertEqual([r['stats'][k] for k in ('vertices','edges','faces')],[18,27,10])
  self.assertEqual(r['stats']['boundaryEdges'],14);self.assertEqual(r['stats']['unassignedEdges'],13)
  self.assertEqual(p['leftWidth'],1);self.assertEqual(p['rightWidth'],1)
  self.assertAlmostEqual(math.hypot(*p['source']['leftRulings'][0]),1.5)
  self.assertEqual(r['source']['nativeDiscretization'],query_discretization_generic(p['source']))
  sample=r['source']['nativeDiscretization']['sample']
  self.assertEqual([a['vertex'] for a in sample['kawasaki']],[2,3,4,5]);self.assertTrue(all(a['choppedAngle']==0 for a in sample['kawasaki']))
  self.assertTrue(all(abs(v+5.13933129892938)<2e-13 for v in sample['multipliers']))
  self.assertEqual(r['source']['assignmentOrigin'],'unspecified');self.assertFalse(r['source']['continuousCurveEquivalent'])
  self.assertNotIn('foldedForm3D',r['source']);self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')

 def test_explicit_multiple_stars_are_checked_per_vertex_and_never_certify_layer_order(self):
  for row in CASES:
   if not row['name'].endswith('explicit-user'):continue
   with self.subTest(name=row['name']):
    r=generate(row['params']);self.assertEqual(r['stats']['checks']['local']['status'],'passed');self.assertEqual(r['stats']['checks']['lff']['status'],'passed')
    self.assertEqual(r['stats']['checks']['local']['interiorVertices'],len(row['params']['source']['foldPoints'])-2)
    self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
  q=source_preset(4);r=generate({'family':'discrete-curve-cp','source':q,'assignments':['M']*7})
  self.assertEqual(r['stats']['checks']['local']['status'],'failed');self.assertEqual(r['stats']['checks']['lff']['status'],'failed')

 def test_original_in4093_equal_parameter_substitution_is_not_uniform_and_aborts(self):
  points=[];left=[];right=[]
  for i in range(6):
   t=math.pi*i/10;c=math.cos(t);s=math.sin(t);radius=4/(3-c)
   p=[-2+radius*c,radius*s];cl=[-2+c/2,s/2]
   v=[p[0]+1,p[1]];length=math.hypot(*v);cr=[-1+2*v[0]/length,2*v[1]/length]
   points.append(p);left.append([a-b for a,b in zip(cl,p)]);right.append([a-b for a,b in zip(cr,p)])
  q={'family':'discretization-generic-native','mode':'multipliers','foldPoints':points,'leftRulings':left,'rightRulings':right}
  with self.assertRaisesRegex(ValueError,'original-kawasaki-abort'):
   generate({'family':'discrete-curve-cp','source':q,'leftWidth':1,'rightWidth':1})

 def test_invalid_domains_collapse_crossing_original_abort_and_zero_denominator_never_fill_gaps(self):
  for n in (2,17):
   q=source_preset(16 if n==17 else 3)
   for key in ('foldPoints','leftRulings','rightRulings'):
    q[key]=q[key]+[q[key][-1]] if n==17 else q[key][:2]
   with self.subTest(n=n),self.assertRaises(ValueError):validate_request({'family':'discrete-curve-cp','source':q})
  variants=[]
  q=source_preset(4);q['foldPoints'][1][0]=.1;variants.append(q)
  q=source_preset(5);q['foldPoints'][2]=q['foldPoints'][1][:];variants.append(q)
  q=source_preset(4);q['leftRulings'][0]=[0,-1];variants.append(q)
  q=source_preset(4);q['foldPoints'][-1]=q['foldPoints'][0][:];variants.append(q)
  q=source_preset(4);q['leftRulings'][1]=[0,0];variants.append(q)
  for q in variants:
   with self.subTest(query=q),self.assertRaises(ValueError):generate({'family':'discrete-curve-cp','source':q})
  for value in (None,False,'U',{},['U']*4):
   with self.subTest(assignments=value),self.assertRaises(ValueError):validate_request({'family':'discrete-curve-cp','source':source_preset(4),'assignments':value})

 def test_previous_four_three_point_complete_native_outputs_keep_all_semantic_values(self):
  for row in OLD:
   with self.subTest(name=row['name']):self.assertEqual(semantic(generate(row['params'])),semantic(row['response']))

if __name__=='__main__':unittest.main()
