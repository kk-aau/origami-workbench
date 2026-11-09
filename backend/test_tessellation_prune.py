import unittest
from tessellation_patterns import regular_patch
from tessellation_prune import intersects,prune_mesh
from tessellate import generate,validate_request,check_geometry


class PruneTests(unittest.TestCase):
    def test_whole_tiles_survive_and_new_edges_are_boundaries(self):
        mesh=regular_patch('square',3,3)
        window=[[.2,.2],[1.8,.2],[1.8,1.8],[.2,1.8]]
        result=prune_mesh(mesh,window)
        self.assertEqual(len(result['faces_vertices']),4)
        self.assertEqual(len(result['vertices_coords']),9)
        self.assertEqual(sum(a=='B' for a in result['edges_assignment']),8)
        self.assertIn([2,2],result['vertices_coords'])  # Whole tile, not clipped at 1.8.
        self.assertEqual(check_geometry(result)['status'],'passed')
        self.assertEqual(len(mesh['faces_vertices']),9)
        self.assertEqual(prune_mesh(mesh,[[.2,.2],[.8,.2],[.8,.8],[.2,.8]])['vertices_coords'],[[0,0],[1,0],[1,1],[0,1]])

    def test_intersections_include_crossing_containment_and_contact(self):
        horizontal=[[-2,-.1],[2,-.1],[2,.1],[-2,.1]]
        vertical=[[-.1,-2],[.1,-2],[.1,2],[-.1,2]]
        self.assertTrue(intersects(horizontal,vertical))
        self.assertTrue(intersects(horizontal,[[2,0],[3,0],[3,1],[2,1]]))
        self.assertFalse(intersects(horizontal,[[2.01,0],[3,0],[3,1],[2.01,1]]))
        with self.assertRaisesRegex(ValueError,'没有接触'):
            prune_mesh(regular_patch('square',2,2),[[5,5],[6,5],[6,6],[5,6]])

    def test_concave_tile_notch_is_not_a_false_positive(self):
        tile=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]]
        notch=[[1.5,1.5],[2,1.5],[2,2],[1.5,2]]
        self.assertFalse(intersects(tile,notch))
        self.assertTrue(intersects(tile,[[.5,1.5],[1,1.5],[1,2],[.5,2]]))
        self.assertTrue(intersects(tile,[[1,1],[1.5,1],[1.5,1.5],[1,1.5]]))
        params=dict(family='custom',vertices=tile,faces=[[0,1,2,3,4,5]],repeatX=1,repeatY=1,customOutput='tiling')
        with self.assertRaisesRegex(ValueError,'没有接触'):
            generate({**params,'pruneBoundary':notch})
        kept=generate({**params,'pruneBoundary':[[.5,1.5],[1,1.5],[1,2],[.5,2]]})
        self.assertEqual(kept['stats']['tiles'],1)
        self.assertEqual(kept['source']['output'],'tiling')

    def test_construction_and_parameter_changes_reapply_prune(self):
        p=dict(family='periodic',tiling='square',rows=3,columns=3,pruneBoundary=[[.2,.2],[1.8,.2],[1.8,1.8],[.2,1.8]])
        a=generate(p);b=generate({**p,'rows':4,'angle':40})
        self.assertEqual(a['mother'],b['mother'])
        self.assertNotEqual(a['fold'],b['fold'])
        self.assertEqual(a['stats']['tiles'],4)
        self.assertEqual(a['stats']['checks']['local']['status'],'passed')
        one=generate({**p,'pruneBoundary':[[.2,.2],[.8,.2],[.8,.8],[.2,.8]]})
        self.assertEqual(one['stats']['tiles'],1)
        self.assertEqual(one['stats']['checks']['local']['status'],'not_applicable')
        for family,extra in [('primal-dual',{}),('archimedean',{'tiling':'4.8.8'}),('nonperiodic',{'kind':'voronoi'}),('ring',{})]:
            with self.subTest(family=family):
                result=generate(dict(family=family,pruneBoundary=[[-.2,-.2],[.6,-.2],[.6,.6],[-.2,.6]],**extra))
                self.assertGreater(result['stats']['tiles'],0)
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')

    def test_validation_rejects_nonconvex_and_unsupported(self):
        with self.assertRaises(ValueError):validate_request(dict(family='twist',pruneBoundary=[[0,0],[1,0],[1,1]]))
        with self.assertRaises(ValueError):validate_request(dict(family='periodic',pruneBoundary=[[0,0],[1,0],[.2,.2],[0,1]]))
        window=[[0,0],[1,0],[1,1],[0,1]]
        self.assertEqual(validate_request(dict(family='periodic',pruneBoundary=window[::-1]))['pruneBoundary'],window)
