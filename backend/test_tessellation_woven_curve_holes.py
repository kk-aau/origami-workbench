"""Analytic mother holes: real public generation, provenance and material voids."""
import copy,json,math,unittest
from pathlib import Path
from tessellate import generate
from tessellation_woven_graph import woven_graph_data

SAVED=json.loads((Path(__file__).parents[1]/'tests/fixtures/woven-curve-holes-1010.json').read_text(encoding='utf-8'))

class WovenCurveHoleTests(unittest.TestCase):
 def test_ellipse_sources_keep_submitted_points_edges_and_every_original_parameter(self):
  for c in SAVED['cases']:
   with self.subTest(name=c['name']):
    g=copy.deepcopy(c['params']['graph']);before=copy.deepcopy(g);d=woven_graph_data(g,.03)
    self.assertEqual(g,before);self.assertEqual(d['mesh']['vertices_coords'],g['vertices']);self.assertEqual(d['mesh']['edges_vertices'],g['edges']);self.assertEqual(d['curveHoleInfo']['records'],g['curveHoles'])
    self.assertEqual(sum(map(len,d['sourceFaceHoles'])),len(g['curveHoles']));self.assertEqual(d['curveHoleInfo']['cpBoundary'],'explicit-chords')
 def test_six_public_cases_really_generate_holes_with_one_rigid_isometry_per_source_face(self):
  for c in SAVED['cases']:
   with self.subTest(name=c['name']):
    p=copy.deepcopy(c['params']);before=copy.deepcopy(p);r=generate(p);self.assertEqual(p,before);self.assertEqual(r['source']['graph'],p['graph']);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertLess(r['source']['closureError'],1e-8)
    cp,ff,fold=r['fold']['vertices_coords'],r['source']['foldedForm'],r['fold'];self.assertEqual(sum(map(len,fold['faces_holes'])),len(p['graph']['curveHoles']))
    for f,face in enumerate(fold['faces_vertices']):
     vertices=face+[v for ring in fold['faces_holes'][f] for v in ring]
     for i,a in enumerate(vertices):
      for b in vertices[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(ff[a],ff[b])),1e-8)
 def test_forged_parameters_samples_id_and_insufficient_chord_bound_reject_without_resampling(self):
  base=SAVED['cases'][0]['params']['graph']
  mutations=[lambda g:g['curveHoles'][0]['curve']['radii'].__setitem__(0,.5),lambda g:g['vertices'][5].__setitem__(0,g['vertices'][5][0]+.0001),lambda g:g['curveHoles'][0].__setitem__('component',0),lambda g:g['curveHoles'][0].__setitem__('segments',True),lambda g:g['curveHoles'][0].__setitem__('maxError',.000001),lambda g:g['curveHoles'].append(g['curveHoles'][0]),lambda g:g.pop('ringHoles')]
  for mutate in mutations:
   g=copy.deepcopy(base);mutate(g);before=copy.deepcopy(g)
   with self.assertRaises(ValueError):woven_graph_data(g)
   self.assertEqual(g,before)
 def test_forged_extra_fields_unknown_analytic_function_and_nonfinite_controls_reject(self):
  for kind in ('extra','unknown','nonfinite'):
   g=copy.deepcopy(SAVED['cases'][0]['params']['graph'])
   if kind=='extra':g['curveHoles'][0]['extra']=0
   elif kind=='unknown':g['curveHoles'][0]['curve']['kind']='arbitrary-wolfram-function'
   else:g['curveHoles'][0]['curve']['center'][0]=math.inf
   with self.subTest(kind=kind),self.assertRaises(ValueError):woven_graph_data(g)
 def test_unmarked_straight_ring_retains_existing_original_behavior(self):
  g=copy.deepcopy(SAVED['cases'][0]['params']['graph']);g.pop('curveHoles');d=woven_graph_data(g);self.assertNotIn('curveHoleInfo',d);r=generate(dict(SAVED['cases'][0]['params'],graph=g));self.assertNotIn('wovenMotherCurveHoles',r['source']);self.assertEqual(json.loads(json.dumps(r['fold'])),SAVED['cases'][0]['response']['fold'])

if __name__=='__main__':unittest.main()
