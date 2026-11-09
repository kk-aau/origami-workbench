import copy,json,math,unittest
from pathlib import Path
from tessellate import generate,check_geometry,validate_request
from tessellation_gore import validate_gore_paper,query_gore_data

FIXTURE=Path(__file__).parents[1]/'tests/fixtures/multiple-gore-cp-source-20261010.json'

class MultipleGoreMaterialTests(unittest.TestCase):
 def test_actual_public_fixture_every_original_rotated_vertex_and_face_metric(self):
  fixture=json.loads(FIXTURE.read_text(encoding='utf8'))
  for c in fixture['cases']:
   p=c['params'];r=generate(p);expected=c['response'];self.assertEqual(r['fold'],expected['fold']);self.assertEqual(r['source'],expected['source'])
   cp=r['fold']['vertices_coords'];ff=r['source']['foldedForm3D'];s=r['source'];f=r['fold'];single=generate({k:v for k,v in p.items() if k!='petals'});single_cp=single['fold']['vertices_coords'];single_ff=single['source']['foldedForm3D']
   self.assertEqual(s['originalGoreData'],query_gore_data(s['originalGoreData']['query']));self.assertEqual(len(s['independentMaterials']),p['sectors'])
   self.assertFalse(s['standardSingleSheetFold']);self.assertFalse(s['coordinateWeldingApplied']);self.assertFalse(s['gluingApplied']);self.assertFalse(s['continuousRigidPathChecked']);self.assertFalse(s['selfCollisionChecked']);self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
   used=set()
   for j,material in enumerate(s['independentMaterials']):
    self.assertEqual(material['petalIndex'],j);self.assertEqual(material['id'],f'gore-petal-{j}');self.assertTrue(used.isdisjoint(material['vertices']));used.update(material['vertices']);a=2*math.pi*j/p['sectors']
    for k,v in enumerate(material['vertices']):
     for base,actual in [(single_cp[k],cp[v]),(single_ff[k],ff[v])]:
      rot=[math.cos(a)*base[0]-math.sin(a)*base[1],math.sin(a)*base[0]+math.cos(a)*base[1],*base[2:]]
      self.assertEqual(actual,rot)
    local={**single['fold'],'vertices_coords':[cp[v] for v in material['vertices']]}
    self.assertEqual(check_geometry(local)['status'],'passed')
    for fi in material['faces']:
     face=f['faces_vertices'][fi];self.assertTrue(set(face)<=set(material['vertices']))
     for i,v in enumerate(face):
      for w in face[i+1:]:self.assertAlmostEqual(math.dist(cp[v],cp[w]),math.dist(ff[v],ff[w]),places=10)
   self.assertEqual(used,set(range(len(cp))))

 def test_same_coordinate_poles_and_seams_preserve_distinct_material_indices(self):
  p=json.loads(FIXTURE.read_text(encoding='utf8'))['cases'][0]['params'];r=generate(p);f=r['fold'];s=r['source']
  self.assertEqual((len(f['vertices_coords']),len(f['edges_vertices']),len(f['faces_vertices'])),(24,30,12))
  poles=[m['radialRowVertices'][0][0] for m in s['independentMaterials']]
  self.assertEqual(len(set(poles)),6)
  self.assertTrue(all(f['vertices_coords'][v]==[0.,0.] for v in poles))
  self.assertTrue(all(s['foldedForm3D'][v]==[0.,0.,0.] for v in poles))
  self.assertNotEqual(check_geometry(f)['status'],'passed') # global single-sheet check correctly rejects contacts
  for edge in f['edges_vertices']:
   self.assertEqual(edge[0]//4,edge[1]//4)

 def test_strict_multi_input_budgets_and_degenerate_material_reject_without_mutation(self):
  p=dict(family='gore-paper',profile='sphere',sectors=24,divisions=25,typeMinimumAngleDeg=.5,petals='multiple')
  self.assertEqual(generate(p)['stats']['faces'],600)
  for bad in [dict(p,divisions=26),dict(p,sectors=32,divisions=64),dict(p,petals=True),dict(p,petals='single'),dict(p,glue=True),dict(p,sectors=4.),dict(p,typeMinimumAngleDeg=True),dict(p,profile='points',divisions=None,crossSection=[[0,0],[0,1]])]:
   before=copy.deepcopy(bad)
   with self.subTest(bad=bad),self.assertRaises(ValueError):generate(bad)
   self.assertEqual(bad,before)
  degenerate=dict(family='gore-paper',profile='points',sectors=6,crossSection=[[0,0],[0,1]],petals='multiple')
  with self.assertRaises(ValueError):generate(degenerate)

 def test_old_single_paper_and_all_raw_data_contracts_are_unchanged(self):
  old=json.loads((Path(__file__).parents[1]/'tests/fixtures/gore-source-20261010.json').read_text(encoding='utf8'))
  for c in old['papers']:
   r=generate(c['params']);self.assertEqual(r['fold'],c['response']['fold']);self.assertEqual(r['source'],c['response']['source']);self.assertNotIn('petals',validate_request(c['params']))
  for c in old['helpers']:self.assertEqual(query_gore_data(c['query']),c['response'])

if __name__=='__main__':unittest.main()
