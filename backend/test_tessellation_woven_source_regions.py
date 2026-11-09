"""Explicit post-Intersectify region choices retain original primitive provenance."""
import copy,json,math,unittest
from pathlib import Path
from tessellate import generate
from tessellation_woven_graph_source import recompute_graph_source,match_graph_source,read_graph_source,in3437_source,woven_graph_preprocess_query
from tessellation_woven_graph import woven_graph_data

def cycles(graph):
 p,e=graph['vertices'],graph['edges'];neighbors=[[] for _ in p]
 for a,b in e:neighbors[a].append(b);neighbors[b].append(a)
 for v,ns in enumerate(neighbors):ns.sort(key=lambda n:math.atan2(p[n][1]-p[v][1],p[n][0]-p[v][0]))
 seen=set();faces=[]
 for first in [tuple(e) for e in e]+[tuple(reversed(e)) for e in e]:
  if first in seen:continue
  a,b=first;ring=[]
  while (a,b) not in seen:
   seen.add((a,b));ring.append(a);ns=neighbors[b];a,b=b,ns[(ns.index(a)-1)%len(ns)]
  if sum(p[a][0]*p[b][1]-p[a][1]*p[b][0] for a,b in zip(ring,ring[1:]+ring[:1]))>0:faces.append(ring)
 return faces

def component_ids(graph):
 groups=[];seen=set()
 for v in range(len(graph['vertices'])):
  if v in seen:continue
  q=[v];seen.add(v)
  for a in q:
   for x,y in graph['edges']:
    b=y if x==a else x if y==a else -1
    if b>=0 and b not in seen:seen.add(b);q.append(b)
  groups.append(sorted(q))
 return groups

def region_fixtures():
 root=Path(__file__).parents[1];saved=json.loads((root/'tests/fixtures/woven-multiring-1008.json').read_text(encoding='utf8'))['cases']
 saved=[c for c in saved if c['name'] in ('one-ring','two-rings','cell-and-ring-hole')]
 saved+=json.loads((root/'tests/fixtures/woven-nested-sheets-1008.json').read_text(encoding='utf8'))['cases'][:1]
 items=[]
 for c in saved:
  params=copy.deepcopy(c['params']);g=params['graph'];raw={k:copy.deepcopy(g[k]) for k in ('vertices','edges')}
  query=dict(family='woven-graph-preprocess-native',inputGraph=raw,intersectionTolerance=0,samePtTolerance=1e-6,invertFoldType=False)
  primitive=woven_graph_preprocess_query(query);source=copy.deepcopy(primitive['source']);derived=copy.deepcopy(primitive['graph'])
  vertex_map=[next(i for i,q in enumerate(derived['vertices']) if math.dist(p,q)<1e-9) for p in g['vertices']]
  fs=cycles(derived);old_fs=cycles(g);cs=component_ids(derived);old_cs=component_ids(g)
  face_map=lambda f:next(i for i,r in enumerate(fs) if set(r)=={vertex_map[v] for v in old_fs[f]})
  component_map=lambda k:next(i for i,r in enumerate(cs) if set(r)=={vertex_map[v] for v in old_cs[k]})
  if 'ringHoles' in g:derived['ringHoles']=[dict(face=face_map(b['face']),component=component_map(b['component'])) for b in g['ringHoles']]
  if 'holeFaces' in g:derived['holeFaces']=[face_map(f) for f in g['holeFaces']]
  if 'nestedSheets' in g:derived['nestedSheets']=True
  source['motherSelection']=dict(geometry=copy.deepcopy(primitive['graph']),**{k:copy.deepcopy(derived[k]) for k in ('holeFaces','ringHoles','nestedSheets') if k in derived})
  params.update(graph=derived,graphSource=source)
  items.append(dict(name=c['name'],query=query,primitive=primitive,params=params,response=generate(params)))
 return items

class WovenSourceRegionsTests(unittest.TestCase):
 def test_actual_public_constructions_replay_geometry_and_roles_without_new_edges(self):
  for c in region_fixtures():
   with self.subTest(name=c['name']):
    p=c['params'];g,info=recompute_graph_source(p['graphSource']);self.assertEqual(g,p['graph']);self.assertEqual(info['originalEdgeForSegment'],c['primitive']['originalEdgeForSegment']);self.assertEqual(g['vertices'],c['primitive']['graph']['vertices']);self.assertEqual(g['edges'],c['primitive']['graph']['edges']);self.assertEqual(match_graph_source(p['graphSource'],g),info)
    self.assertEqual(c['response']['source']['graphSource'],p['graphSource']);self.assertLess(c['response']['source']['closureError'],1e-8);self.assertEqual(c['response']['stats']['checks']['geometry']['status'],'passed')
 def test_missing_or_forged_role_and_changed_split_geometry_are_rejected(self):
  c=region_fixtures()[0];s=c['params']['graphSource'];g=c['params']['graph'];before=copy.deepcopy(s)
  for change in (lambda g:g.pop('ringHoles'),lambda g:g['ringHoles'][0].update(face=1),lambda g:g.update(nestedSheets=True),lambda g:g['vertices'][0].__setitem__(0,g['vertices'][0][0]+.01),lambda g:g['edges'].reverse()):
   bad=copy.deepcopy(g);change(bad)
   with self.assertRaises(ValueError):match_graph_source(s,bad)
  for change in (lambda s:s['inputGraph']['vertices'][0].__setitem__(0,7),lambda s:s['motherSelection']['geometry']['vertices'][0].__setitem__(0,7),lambda s:s['inputGraph']['edges'].reverse(),lambda s:s.update(samePtTolerance=10)):
   bad=copy.deepcopy(s);change(bad)
   with self.assertRaises(ValueError):recompute_graph_source(bad)
  self.assertEqual(s,before)
 def test_strict_selection_contract_and_original_frozen_example_are_preserved(self):
  s=region_fixtures()[0]['params']['graphSource']
  for change in (lambda s:s['motherSelection'].update(extra=1),lambda s:s['motherSelection'].update(ringHoles=[]),lambda s:s['motherSelection'].update(holeFaces=[True]),lambda s:s['motherSelection'].update(nestedSheets=False),lambda s:s['motherSelection']['geometry'].update(ringHoles=[dict(face=0,component=1)]),lambda s:s['motherSelection'].update(ringHoles=[dict(face=True,component=1)])):
   bad=copy.deepcopy(s);change(bad)
   with self.assertRaises(ValueError):read_graph_source(bad)
  old=in3437_source();old['motherSelection']=s['motherSelection']
  with self.assertRaises(ValueError):read_graph_source(old)
 def test_geometrically_impossible_role_does_not_bypass_original_generation_validation(self):
  p=region_fixtures()[0]['params'];p['graph']['ringHoles'][0]['face']=1;p['graphSource']['motherSelection']['ringHoles'][0]['face']=1
  with self.assertRaises(ValueError):woven_graph_data(p['graph'],.03,p['graphSource'])
if __name__=='__main__':unittest.main()
