"""Original r4 topology through the true MakeFlasher CP/static-FF route."""
import json,math,unittest
from pathlib import Path
from functools import lru_cache
from tessellate import generate,validate_request
from tessellation_flasher_solver import solve_flasher

ROOT=Path(__file__).resolve().parents[1]
SAVED=json.loads((ROOT/'tests/fixtures/flasher-r4-20261010.json').read_text(encoding='utf8'))
SEEDS=json.loads((ROOT/'src/app/flasherP46ReadonlyData.json').read_text(encoding='utf8'))
@lru_cache(None)
def cases():return [(c['name'],c['params'],generate(c['params'])) for c in SAVED['cases']]

class FlasherFourRingTests(unittest.TestCase):
 def test_public_r4_numerical_domain_generates_cp_and_actual_static_ff(self):
  for name,p,r in cases():
   with self.subTest(name=name):
    self.assertEqual(validate_request(p),p);self.assertEqual(r['stats']['parameters'],p)
    self.assertEqual(r['stats']['checks']['geometry']['status'],'passed')
    self.assertEqual(r['stats']['checks']['local']['status'],'not_applicable')
    self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
    self.assertEqual(r['stats']['foldability'],'static-spatial-state')
    s=r['source'];self.assertTrue(s['staticGlobalIsometryChecked']);self.assertFalse(s['continuousRigidPathChecked']);self.assertFalse(s['selfCollisionChecked'])
    self.assertLess(s['maximumFaceDistanceError'],1e-8);self.assertLess(s['maximumFacePlaneError'],1e-8)
    self.assertLess(s['isometryResidualSum'],1e-6)
    cp=r['fold']['vertices_coords'];ff=s['foldedForm3D']
    self.assertEqual(len(cp),len(ff))
    for face in r['fold']['faces_vertices']:
     for i,a in enumerate(face):
      for b in face[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(ff[a],ff[b])),1e-8)
    self.assertEqual(len(cp)-len(r['fold']['edges_vertices'])+len(r['fold']['faces_vertices']),1)

 def test_all_original_in4131_4132_lines_remain_isometry_constraints(self):
  for d in ('Y','Z'):
   with self.subTest(diagonal=d):
    s=solve_flasher(4,1,5,.05,d,minimum_angle_deg=10)
    # Literal In[4097]/In[4098] source alias, independent of backend _wrap.
    def alias(v):
     i,j,k=v;return (j,0,(k-1)%5) if i==-1 else (i,j,k%5)
    original={frozenset(alias(v) for v in line['labels']) for line in SEEDS['sectors'][d]['lines']}
    actual={frozenset(tuple(v) for v in edge) for edge in s['edge_references']}
    self.assertEqual(original,actual);self.assertEqual(len(actual),65)
    self.assertLess(s['maxEquationResidual'],1e-8)

 def test_capacity_invalid_source_and_paper_gates_are_not_bypassed(self):
  p=SAVED['cases'][0]['params']
  for patch in (dict(rings=10),dict(rings=4,heightOrder=3),dict(rings=9,heightOrder=1,rotationalOrder=4),dict(rings=True),dict(diagonal='W'),dict(radialIncrement=-.01),dict(rotationalOrder=17),dict(paper={'shape':'square','margin':.1}),dict(unknown=True)):
   with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request(dict(p,**patch))

 def test_r4_extended_ring5_and_m9_inputs_respect_radial_and_face_budgets(self):
  p=SAVED['cases'][0]['params']
  for patch,faces in ((dict(rings=5),301),(dict(rotationalOrder=9),361)):
   with self.subTest(patch=patch):
    params=dict(p,**patch);self.assertEqual(validate_request(params),params)
    r,h,m=params['rings'],params['heightOrder'],params['rotationalOrder']
    self.assertLessEqual(r*h,9);self.assertEqual(2*m*r*(r+1)*h+1,faces);self.assertLessEqual(faces,600)

 def test_old_saved_y_and_z_constructors_keep_frozen_geometry_and_static_source(self):
  for suffix,p in [('y',{'family':'flasher'}),('z',dict(family='flasher',rings=2,heightOrder=2,rotationalOrder=5,radialIncrement=.1,diagonal='Z',minimumAngleDeg=10))]:
   frozen=json.loads((ROOT/f'tests/fixtures/constructed_flasher_{suffix}.json').read_text(encoding='utf8'));r=generate(p)
   self.assertEqual(r['fold']['edges_vertices'],frozen['fold']['edges_vertices']);self.assertEqual(r['fold']['edges_assignment'],frozen['fold']['edges_assignment']);self.assertEqual(r['fold']['faces_vertices'],frozen['fold']['faces_vertices'])
   for field,actual,expected in [('cp',r['fold']['vertices_coords'],frozen['fold']['vertices_coords']),('ff',r['source']['foldedForm3D'],frozen['source']['foldedForm3D'])]:
    self.assertLess(max(math.dist(a,b) for a,b in zip(actual,expected)),1e-9)

if __name__=='__main__':unittest.main()
