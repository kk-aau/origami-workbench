import copy,math,unittest
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
from tessellation_woven_holes import without_hole_faces
from tessellation_patterns import planar_faces

GRAPH=dict(vertices=[[-2,-2],[2,-2],[2,2],[-2,2],[-1,-1],[1,-1],[1,1],[-1,1]],edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],holeFaces=[4])
BASE=dict(family='woven-lines',mode='graph',graph=GRAPH,width=.08,parity=1,minPleat=1,minBorderPleat=.01,borderInset='auto',stationaryFace=0)

class WovenMotherHolesTests(unittest.TestCase):
    def test_explicit_hole_preserves_points_edges_ids_and_all_rim_insets(self):
        original=copy.deepcopy(GRAPH);data=woven_graph_data(GRAPH)
        self.assertEqual(GRAPH,original);self.assertEqual(data['mesh']['vertices_coords'],GRAPH['vertices']);self.assertEqual(data['mesh']['edges_vertices'],GRAPH['edges'])
        self.assertEqual(data['motherHoleCycles'],[[4,5,6,7]]);self.assertEqual(data['motherRetainedFaceIds'],[0,1,2,3])
        self.assertEqual(data['mesh']['edges_assignment'],['B']*8+['U']*4)
        self.assertEqual(len(GRAPH['vertices'])-len(GRAPH['edges'])+len(data['sourceFaceCycles']),0)

    def test_real_public_engine_cp_has_actual_void_and_full_face_isometry(self):
        result=generate(BASE);fold=result['fold'];ff=result['source']['foldedForm']
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['source']['graph'],GRAPH);self.assertEqual(result['source']['wovenMotherHoles']['faceIds'],[4])
        self.assertEqual(len(fold['vertices_coords'])-len(fold['edges_vertices'])+len(fold['faces_vertices']),0)
        actual={tuple(sorted(f)) for f in fold['faces_vertices']}
        missing=[f for f in planar_faces(fold['vertices_coords'],fold['edges_vertices']) if tuple(sorted(f)) not in actual]
        self.assertEqual(len(missing),1)
        lookup={tuple(sorted(e)):i for i,e in enumerate(fold['edges_vertices'])}
        for a,b in zip(missing[0],missing[0][1:]+missing[0][:1]):self.assertEqual(fold['edges_assignment'][lookup[tuple(sorted((a,b)))]],'B')
        for face in fold['faces_vertices']:
            for i,a in enumerate(face):
                for b in face[i+1:]:self.assertLess(abs(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b])-math.dist(ff[a],ff[b])),1e-8)

    def test_invalid_hole_ids_outer_contact_and_touching_holes_reject(self):
        for ids in ([],[True],[4,4],[-1],[5],[0],['4'],[4.0]):
            with self.subTest(ids=ids),self.assertRaises(ValueError):woven_graph_data(dict(GRAPH,holeFaces=ids))
        with self.assertRaises(ValueError):woven_graph_data(dict(GRAPH,holeFaces=[3,4]))

    def test_void_binding_uses_source_cycles_not_coordinate_centroid(self):
        data=dict(motherHoleCycles=[[4,5,6,7]])
        corners={(0,v):v for v in range(8)};anchors={(1,4):8}
        kept=[[0,1,5,4]];hole=[4,8,5,6,7]
        self.assertEqual(without_hole_faces(kept+[hole],data,corners,anchors),kept)
        for faces in (kept,kept+[hole,hole]):
            with self.assertRaises(ValueError):without_hole_faces(faces,data,corners,anchors)

    def test_edited_asymmetric_ring_enforces_global_unfold_closure(self):
        graph=copy.deepcopy(GRAPH);graph['vertices'][0][0]= -2.01
        result=generate(dict(BASE,graph=graph))
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertLess(result['source']['closureError'],1e-8)
        self.assertEqual(result['source']['graph']['vertices'][0][0],-2.01)

    def test_source_order_reordered_edges_binds_new_original_face_id(self):
        graph=copy.deepcopy(GRAPH);graph['edges']=graph['edges'][4:]+graph['edges'][:4]
        # The original half-edge walk starts with the newly first CCW inner
        # edge. Generic planar_faces has a different start order and must not
        # be used to stamp original face IDs.
        graph['holeFaces']=[0]
        result=generate(dict(BASE,graph=graph));self.assertEqual(result['mother']['edges_vertices'],graph['edges']);self.assertEqual(result['source']['wovenMotherHoles']['faceIds'],graph['holeFaces'])

if __name__=='__main__':unittest.main()
