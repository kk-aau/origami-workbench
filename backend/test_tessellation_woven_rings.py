import copy,json,math,unittest
from pathlib import Path
import numpy as np
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
from tessellation_woven import _topology,_face_winding
from tessellation_woven_holonomy import UnfoldClosureSystem
BASE=dict(family='woven-lines',mode='graph',graph=dict(vertices=[[.008,.008],[8,0],[0,8],[-8,0],[0,-8],[2,2],[3,2],[3,3],[2,3]],edges=[[1,2],[2,3],[3,4],[4,1],[0,1],[0,2],[0,3],[0,4],[5,6],[6,7],[7,8],[8,5]],ringHoles=[dict(face=0,component=1)]),width=.06,parity=1,minPleat=1,minBorderPleat=.01,borderInset='auto',stationaryFace=0)
class WovenRingMotherTests(unittest.TestCase):
 def test_multiple_arbitrary_rings_merit_and_old_cell_holes_use_the_actual_public_engine(self):
  saved=json.loads((Path(__file__).parents[1]/'tests/fixtures/woven-multiring-1008.json').read_text(encoding='utf-8'))
  for c in saved['cases']:
   with self.subTest(name=c['name']):
    r=generate(c['params']);self.assertEqual(r['source']['graph'],c['params']['graph']);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertLess(r['source']['closureError'],1e-8);self.assertEqual(sum(map(len,r['fold']['faces_holes'])),len(c['params']['graph']['ringHoles']))
 def test_source_rings_use_original_indices_and_join_material_through_the_face_not_a_bridge(self):
  graph=copy.deepcopy(BASE['graph']);before=copy.deepcopy(graph);d=woven_graph_data(graph,.03);self.assertEqual(graph,before);self.assertEqual(d['mesh']['vertices_coords'],graph['vertices']);self.assertEqual(d['mesh']['edges_vertices'],graph['edges']);self.assertEqual(len(d['sourceFaceCycles']),4);self.assertEqual(d['motherHoleFaceIds'],[4]);self.assertEqual(d['motherComponents'],[list(range(9))]);self.assertEqual(d['sourceFaceHoles'],[[[6,5,8,7]],[],[],[]]);self.assertEqual(d['mesh']['faces_holes'][0],[[7,8,5,6]])
 def test_public_cp_has_one_true_ring_face_and_all_ring_points_share_its_rigid_ff_map(self):
  r=generate(BASE);fold=r['fold'];ff=r['source']['foldedForm'];self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertLess(r['source']['closureError'],1e-8);self.assertEqual((len(fold['vertices_coords']),len(fold['edges_vertices']),len(fold['faces_vertices'])),(24,36,13));self.assertEqual(sum(map(len,fold['faces_holes'])),1);self.assertEqual(len(fold['vertices_coords'])-len(fold['edges_vertices'])+len(fold['faces_vertices'])-1,0)
  for f,face in enumerate(fold['faces_vertices']):
   vertices=face+[v for ring in fold['faces_holes'][f] for v in ring]
   for i,a in enumerate(vertices):
    for b in vertices[i+1:]:self.assertLess(abs(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b])-math.dist(ff[a],ff[b])),1e-8)
  self.assertEqual(r['source']['wovenMotherRingHoles']['bindings'],BASE['graph']['ringHoles'])
 def test_invalid_ring_binding_never_guesses_roles_or_mutates_the_mother(self):
  g=copy.deepcopy(BASE['graph']);before=copy.deepcopy(g)
  for bindings in ([],[True],[dict(face=True,component=1)],[dict(face=0,component=0)],[dict(face=4,component=1)],[dict(face=1,component=1)],[dict(face=0,component=1),dict(face=1,component=1)],[dict(face=0,component=99)],[dict(face=0,component=1,extra=0)]):
   with self.subTest(bindings=bindings),self.assertRaises(ValueError):woven_graph_data(dict(g,ringHoles=bindings))
  x=copy.deepcopy(g);x['edges'].append([5,7])
  with self.assertRaisesRegex(ValueError,'简单独立闭环'):woven_graph_data(x)
  x=copy.deepcopy(g);x['vertices'][7]=[5,5]
  with self.assertRaises(ValueError):woven_graph_data(x)
  self.assertEqual(g,before)
 def test_unfold_closure_counts_ring_corners_and_analytic_jacobian_matches_independent_differences(self):
  data=woven_graph_data(BASE['graph'],.03);probe=generate(BASE)['source']['topologyProbe'];g=_topology(data,1,.03,tuple(probe));x=np.ones(len(g['boundaryVariable']))*1.2;p=g['base'].copy();mask=g['variable']>=0;p[mask]+=g['directions'][mask]*x[g['variable'][mask],None];system=UnfoldClosureSystem(g,[g['mainFaces'][0]],16,p,_face_winding);value,jac=system.evaluate(x);self.assertEqual(system.row_count,2*(sum(map(len,g['faces']))+sum(len(r) for rs in g['faceHoles'] for r in rs)-len(g['base'])));self.assertTrue(np.all(np.isfinite(value)))
  numerical=np.column_stack([(system.evaluate(x+np.eye(len(x))[k]*1e-5)[0]-system.evaluate(x-np.eye(len(x))[k]*1e-5)[0])/2e-5 for k in range(len(x))]);self.assertLess(np.max(np.abs(jac-numerical)),1e-8)
if __name__=='__main__':unittest.main()
