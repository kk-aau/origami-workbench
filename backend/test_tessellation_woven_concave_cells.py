"""P42 In[931]/In[3428]: real reflex cells, source reconstruction and CP."""
import copy,json,math,unittest
from collections import defaultdict,deque
from functools import lru_cache
from pathlib import Path
from tessellate import generate
from tessellation_woven import _graph_inset_faces
from tessellation_woven_graph import woven_graph_data
from tessellation_line_groups import inset_faces
from test_tessellation_woven_boundaries import restored_cp

SAVED=json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/woven-concave-cells-20261001.json').read_text(encoding='utf8'))

@lru_cache(None)
def records():return [dict(c,response=generate(c['params'])) for c in SAVED['cases']]

def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def delta(a,b):return [a[j]-b[j] for j in (0,1)]

def literal_inset(source):
    """In[931]: move original directed lines, intersect adjacent lines.

    Use line parameters, independent of the normal-equation implementation.
    A reflex vertex does not introduce an all-half-plane intersection.
    """
    graph=source['graph'];points=graph['vertices'];lookup={tuple(sorted(e)):i for i,e in enumerate(graph['edges'])}
    hs=source.get('effectiveEdgeInsets',[source['borderInset'] if owner<0 else width/2 for owner,width in zip(source['edgeLines'],source['edgeWidths'])])
    polygons=[]
    for face in source['sourceFaceCycles']:
        shifted=[]
        for a,b in zip(face,face[1:]+face[:1]):
            p,q=points[a],points[b];dx,dy=delta(q,p);h=hs[lookup[tuple(sorted((a,b)))]];scale=h/math.hypot(dx,dy)
            shifted.append(([p[0]-scale*dy,p[1]+scale*dx],[q[0]-scale*dy,q[1]+scale*dx]))
        polygon=[]
        for (a,b),(c,d) in zip(shifted[-1:]+shifted[:-1],shifted):
            u,v=delta(b,a),delta(d,c);t=cross(delta(c,a),v)/cross(u,v)
            polygon.append([a[j]+t*u[j] for j in (0,1)])
        polygons.append(polygon)
    return polygons,hs

def literal_folded_form(params,source):
    graph=params['graph'];points=graph['vertices'];faces=source['sourceFaceCycles'];lookup={tuple(sorted(e)):i for i,e in enumerate(graph['edges'])}
    owners=defaultdict(list)
    for fi,face in enumerate(faces):
        for a,b in zip(face,face[1:]+face[:1]):owners[tuple(sorted((a,b)))].append(fi)
    colors={0:params['parity']};pending=deque([0]);adj=defaultdict(list)
    for fs in owners.values():
        if len(fs)==2:a,b=fs;adj[a].append(b);adj[b].append(a)
    while pending:
        a=pending.popleft()
        for b in adj[a]:
            if b not in colors:colors[b]=-colors[a];pending.append(b)
    polygons,hs=literal_inset(source);factors=iter(source['pleatFactors']);ff=[]
    for fi,face in enumerate(faces):
        for k,v in enumerate(face):
            prev,nex=face[k-1],face[(k+1)%len(face)];p=points[v];q=polygons[fi][k]
            ep=[x/math.dist(p,points[prev]) for x in delta(p,points[prev])];en=[x/math.dist(p,points[nex]) for x in delta(points[nex],p)]
            ie,oe=lookup[tuple(sorted((prev,v)))],lookup[tuple(sorted((v,nex)))];bp,bo=source['edgeLines'][ie]<0,source['edgeLines'][oe]<0;sine=abs(cross(ep,en))
            if bp and bo:ff.append(q);continue
            # Original branches, including the raw absolute h for each edge.
            if bp:direction=[x*hs[oe]/sine for x in ep]
            elif bo:direction=[-x*hs[ie]/sine for x in en]
            elif colors[fi]>0:direction=[-x*hs[ie]/sine for x in en]
            else:direction=[x*hs[oe]/sine for x in ep]
            factor=next(factors);ff.append([q[j]+factor*direction[j] for j in (0,1)])
            if bp or bo:ff.append(q)
    with_stop=next(factors,None);assert with_stop is None
    return ff

class WovenConcaveCellTests(unittest.TestCase):
    def test_real_reflex_face_keeps_source_points_edges_and_halfedge_ids(self):
        for case in records():
            with self.subTest(case=case['name']):
                p,r=case['params'],case['response'];data=woven_graph_data(p['graph'])
                self.assertEqual(data['concaveFaces'],[0]);self.assertEqual(data['sourceFaceCycles'],[[1,2,3,0],[3,4,5,0],[5,6,7,0],[7,8,1,0]])
                self.assertEqual(r['mother']['vertices_coords'],p['graph']['vertices']);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges'])
                self.assertEqual(r['source']['graph'],p['graph']);self.assertEqual(r['source']['sourceFaceCycles'],data['sourceFaceCycles'])
                face=data['sourceFaceCycles'][0];ps=[p['graph']['vertices'][v] for v in face]
                self.assertLess(min(cross(delta(b,a),delta(c,b)) for a,b,c in zip(ps,ps[1:]+ps[:1],ps[2:]+ps[:2])),0)

    def test_independent_literal_local_inset_is_not_all_convex_halfplanes(self):
        case=records()[0];data=woven_graph_data(case['params']['graph'],inset=.03)
        with self.assertRaisesRegex(ValueError,'内缩分区'):inset_faces(data,.03)
        expected,_=literal_inset(case['response']['source']);actual=_graph_inset_faces(data,.03)
        self.assertLess(max(math.dist(a,b) for ep,ap in zip(expected,actual) for a,b in zip(ep,ap)),1e-14)
        # The accepted inset preserves the genuine reentrant vertex.
        ps=actual[0];self.assertLess(min(cross(delta(b,a),delta(c,b)) for a,b,c in zip(ps,ps[1:]+ps[:1],ps[2:]+ps[:2])),0)

    def test_literal_affine_source_and_independent_winding_unfold(self):
        for case in records():
            with self.subTest(case=case['name']):
                p,r=case['params'],case['response'];source=r['source'];ff=source['foldedForm'];cp=r['fold']['vertices_coords']
                self.assertLess(max(math.dist(a,b) for a,b in zip(ff,literal_folded_form(p,source))),2e-12)
                rebuilt=restored_cp(r['fold'],ff,source['stationaryFoldFace'])
                self.assertLess(max(math.dist(a,b) for a,b in zip(cp,rebuilt)),2e-11)
                for face in r['fold']['faces_vertices']:
                    for a in face:
                        for b in face:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(ff[a],ff[b])),2e-11)
                self.assertLess(source['closureError'],2e-11)
                for kind in ('geometry','local','lff'):self.assertEqual(r['stats']['checks'][kind]['status'],'passed')

    def test_source_degree_four_equations_in_actual_cp_order(self):
        for case in records():
            r=case['response'];cp=r['fold']['vertices_coords'];ff=r['source']['foldedForm'];neighbors=defaultdict(list)
            for a,b in r['fold']['edges_vertices']:neighbors[a].append(b);neighbors[b].append(a)
            for v,ns in neighbors.items():
                if len(ns)!=4:continue
                ns.sort(key=lambda n:math.atan2(cp[n][1]-cp[v][1],cp[n][0]-cp[v][0]))
                angles=[math.atan2(ff[n][1]-ff[v][1],ff[n][0]-ff[v][0]) for n in ns]
                self.assertLess(abs(math.sin(angles[0]-angles[1]+angles[2]-angles[3])),1e-9)

    def test_full_source_stamps_none_and_stationary_face_are_respected(self):
        cases={c['name']:c for c in records()}
        fixed=cases['reflex-cell-fixed-F3']['response'];self.assertEqual(fixed['source']['stationaryFace'],2)
        self.assertNotEqual(fixed['fold'],cases['reflex-cell-positive']['response']['fold'])
        none=cases['reflex-cell-none'];self.assertEqual(none['response']['source']['borderInset'],0)
        full=cases['reflex-cell-full-insets'];self.assertEqual(full['response']['source']['effectiveEdgeInsets'],[e['inset'] for e in full['params']['fullEdgeInsets']['entries']])
        self.assertEqual(full['response']['fold'],generate(dict(full['params'],width=.10))['fold'])
        bad=copy.deepcopy(full['params']);bad['fullEdgeInsets']['entries'][0]['from'][0]+=.001
        with self.assertRaisesRegex(ValueError,'几何戳'):generate(bad)

    def test_collapsed_offset_and_undefined_collinear_corner_still_reject(self):
        graph=records()[0]['params']['graph'];data=woven_graph_data(graph,inset=.2)
        with self.assertRaisesRegex(ValueError,'凹面内缩边退化或反向'):_graph_inset_faces(data,.2)
        bad=copy.deepcopy(graph);bad['vertices'][2]=[.5,.5]
        with self.assertRaisesRegex(ValueError,'共线角'):woven_graph_data(bad)
        crossing=copy.deepcopy(graph);crossing['vertices'][2]=[-.2,-.2]
        with self.assertRaisesRegex(ValueError,'交叉|未拆分'):woven_graph_data(crossing)

    def test_frozen_real_responses_are_reproducible(self):
        actual=json.loads(json.dumps([c['response'] for c in records()]));expected=copy.deepcopy([c['response'] for c in SAVED['cases']])
        for responses in (actual,expected):
            for response in responses:response['stats'].pop('elapsedMs')
        self.assertEqual(actual,expected)

if __name__=='__main__':unittest.main()
