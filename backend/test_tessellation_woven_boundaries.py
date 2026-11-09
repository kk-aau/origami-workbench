"""Original global BoundaryVertices, internal B incidence and FF winding."""
import copy,json,math,unittest
from pathlib import Path
from functools import lru_cache
from collections import defaultdict,Counter,deque
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
from test_tessellation_woven_even_degree import literal_ff
from tessellation_woven import _edge_face_restoration
import numpy as np

SAVED=json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/woven-original-boundaries-20261001.json').read_text(encoding='utf8'))

@lru_cache(None)
def cases():return [dict(name=c['name'],params=c['params'],response=generate(c['params'])) for c in SAVED['cases']]

def incidence(fold):
    found=defaultdict(list)
    for i,face in enumerate(fold['faces_vertices']):
        for a,b in zip(face,face[1:]+face[:1]):found[tuple(sorted((a,b)))].append(i)
    return [found[tuple(sorted(edge))] for edge in fold['edges_vertices']]

def literal_winding(ff,face):
    directions=[math.atan2(ff[b][1]-ff[a][1],ff[b][0]-ff[a][0]) for a,b in zip(face,face[1:]+face[:1])]
    return round(sum((a-b+math.pi)%(2*math.pi)-math.pi for a,b in zip(directions,directions[-1:]+directions[:-1]))/(2*math.pi))

def restored_cp(fold,ff,start):
    """Independent scalar reflection / identity traversal of source FF."""
    faces=fold['faces_vertices'];owners=incidence(fold);winding=[literal_winding(ff,f) for f in faces]
    links=defaultdict(list)
    for edge,fs in zip(fold['edges_vertices'],owners):
        if len(fs)==2:
            a,b=fs;links[a].append((b,edge));links[b].append((a,edge))
    transforms={start:(1.,0.,0.,1.,0.,0.)};points={};queue=deque([start])
    def apply(t,p):a,b,c,d,x,y=t;return [a*p[0]+b*p[1]+x,c*p[0]+d*p[1]+y]
    while queue:
        face=queue.popleft();t=transforms[face]
        for v in faces[face]:points.setdefault(v,apply(t,ff[v]))
        for other,(i,j) in links[face]:
            if other in transforms:continue
            if winding[face]==winding[other]:transforms[other]=t
            else:
                x,y=apply(t,ff[i]),apply(t,ff[j]);dx,dy=y[0]-x[0],y[1]-x[1];norm=math.hypot(dx,dy);dx/=norm;dy/=norm
                r,s,z=2*dx*dx-1,2*dx*dy,2*dy*dy-1
                a,b,c,d,tx,ty=t
                transforms[other]=(r*a+s*c,r*b+s*d,s*a+z*c,s*b+z*d,r*tx+s*ty+x[0]-r*x[0]-s*x[1],s*tx+z*ty+x[1]-s*x[0]-z*x[1])
            queue.append(other)
    assert len(transforms)==len(faces)
    return [points[v] for v in range(len(ff))]

class WovenBoundaryTests(unittest.TestCase):
    def test_independent_original_affine_vertices_and_winding_unfold_isometry(self):
        for c in cases():
            with self.subTest(c=c['name']):
                p,r=c['params'],c['response'];fold=r['fold'];source=r['source'];ff=source['foldedForm']
                self.assertEqual(r['mother']['vertices_coords'],p['graph']['vertices']);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges'])
                self.assertEqual(source['graph'],p['graph']);self.assertEqual(source['sourceFaceCycles'],woven_graph_data(p['graph'])['sourceFaceCycles'])
                self.assertLess(max(math.dist(a,b) for a,b in zip(ff,literal_ff(p,source))),2e-12)
                restored=restored_cp(fold,ff,source['stationaryFoldFace'])
                self.assertLess(max(math.dist(a,b) for a,b in zip(restored,fold['vertices_coords'])),2e-11)
                for face in fold['faces_vertices']:
                    for a in face:
                        for b in face:self.assertLess(abs(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b])-math.dist(ff[a],ff[b])),2e-11)
                self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertLess(source['closureError'],2e-11)

    def test_internal_b_keeps_literal_assignment_two_face_incidence_and_zero_restore(self):
        for c in cases():
            if not c['name'].startswith('internal-diagonal'):continue
            with self.subTest(c=c['name']):
                r=c['response'];fold=r['fold'];ff=r['source']['foldedForm'];cut=r['source']['wovenCutTopology'];owners=incidence(fold)
                self.assertEqual((len(ff),len(fold['edges_vertices'])),(10,14));self.assertEqual(Counter(fold['edges_assignment']),dict(B=12,V=2))
                self.assertEqual(cut['schema'],'origamica-woven-internal-boundary-v1');self.assertIs(cut['standardSingleSheetFold'],False);self.assertIs(cut['boundaryAssignmentIsFaceIncidence'],False)
                self.assertEqual(cut['edgeFaceIncidence'],owners)
                self.assertEqual(cut['internalBoundaryEdges'],[i for i,(kind,fs) in enumerate(zip(fold['edges_assignment'],owners)) if kind=='B' and len(fs)==2])
                self.assertTrue(cut['internalBoundaryEdges']);winding=[literal_winding(ff,f) for f in fold['faces_vertices']]
                self.assertEqual(cut['foldedFaceWinding'],winding)
                angles=[180 if len(fs)==2 and winding[fs[0]]!=winding[fs[1]] else 0 for fs in owners]
                self.assertEqual(cut['edgeRestoreAnglesDeg'],angles)
                # These four actual roots have opposite winding on every
                # shared edge. B alone does not force a zero restore angle.
                self.assertTrue(all(angles[i]==180 for i,fs in enumerate(owners) if len(fs)==2))
                # B and V alone do not carry this original embedding. All
                # degree-four original reflection equations still hold.
                ns=defaultdict(list)
                for a,b in fold['edges_vertices']:ns[a].append(b);ns[b].append(a)
                for v,neighbors in ns.items():
                    if len(neighbors)!=4:continue
                    neighbors.sort(key=lambda n:math.atan2(fold['vertices_coords'][n][1]-fold['vertices_coords'][v][1],fold['vertices_coords'][n][0]-fold['vertices_coords'][v][0]))
                    angles=[math.atan2(ff[n][1]-ff[v][1],ff[n][0]-ff[v][0]) for n in neighbors]
                    self.assertLess(abs(math.sin(angles[0]-angles[1]+angles[2]-angles[3])),1e-10)
                self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
        points=np.asarray([[0.,0.],[1.,0.],[1.,1.],[0.,1.]])
        edges=[[0,1],[1,2],[0,2],[2,3],[0,3]]
        for faces,angle in [([[0,1,2],[0,2,3]],0),([[0,1,2],[3,2,0]],180)]:
            owners,winding,restore=_edge_face_restoration(points,edges,faces)
            self.assertEqual(owners[2],[0,1]);self.assertEqual(restore[2],angle)

    def test_true_reentrant_six_face_border_is_not_the_old_misnamed_convex_probe(self):
        for c in cases():
            if not c['name'].startswith('concave-six'):continue
            with self.subTest(c=c['name']):
                p,r=c['params'],c['response'];data=woven_graph_data(p['graph']);border=data['boundary']
                self.assertTrue(data['concaveBoundary'])
                turns=[(b[0]-a[0])*(d[1]-b[1])-(b[1]-a[1])*(d[0]-b[0]) for a,b,d in zip(border,border[1:]+border[:1],border[2:]+border[:2])]
                self.assertLess(min(turns),0);self.assertGreater(max(turns),0)
                self.assertNotIn('wovenCutTopology',r['source']);self.assertEqual(r['source']['topologyProbeBudget'],170)
                for key in ('geometry','local','lff'):self.assertEqual(r['stats']['checks'][key]['status'],'passed')
                self.assertEqual(r['source']['stationaryFace'],p['stationaryFace'])

    def test_difficult_convex_four_face_original_negative_chart_is_now_reachable(self):
        for c in cases():
            if not c['name'].startswith('difficult-convex'):continue
            self.assertFalse(woven_graph_data(c['params']['graph'])['concaveBoundary'])
            self.assertGreater(c['response']['source']['topologyProbeAttempts'],1)
            self.assertEqual(c['response']['stats']['checks']['geometry']['status'],'passed')

    def test_unsolved_true_concave_four_face_reports_actual_budget_not_convex_ban(self):
        graph=dict(vertices=[[-.45,-.25],[-1.,-1.],[1.,-1.],[-.1,-.1],[-1.,1.]],edges=[[1,2],[2,3],[3,4],[4,1],[0,1],[0,2],[0,3],[0,4]])
        p=dict(cases()[0]['params'],graph=graph)
        self.assertTrue(woven_graph_data(graph)['concaveBoundary'])
        with self.assertRaisesRegex(ValueError,'拓扑／内缩阶段失败.*170 轮.*不构成数学无解证明'):generate(p)

if __name__=='__main__':unittest.main()
