import math
import unittest
from tessellate import generate,validate_request
from tessellation_meshes import custom_mesh
from tessellation_prune import prune_mesh
import test_tessellation as basic


class AssemblyTests(unittest.TestCase):
    def test_original_unit_star_outline_combines_without_false_crease_seams(self):
        n=5;alpha=math.radians(36);step=math.pi/n
        ri=math.sin(alpha/2)/math.sin(step)
        ro=math.sin(math.pi-alpha/2-step)/math.sin(step)
        center=[1+ri*math.cos(alpha/2+step),ri*math.sin(alpha/2+step)]
        star=[[center[0]-(ro if i%2==0 else ri)*math.cos(i*step+alpha/2),center[1]-(ro if i%2==0 else ri)*math.sin(i*step+alpha/2)] for i in range(2*n)]
        self.assertAlmostEqual(star[0][0],0,places=12)
        self.assertAlmostEqual(star[1][0],1,places=12)
        triangle=[[1,0],[0,0],[.5,-math.sqrt(3)/2]]
        vertices=triangle+star[2:]
        params=dict(family='custom',vertices=vertices,faces=[[0,1,2],[1,0]+list(range(3,3+2*n-2))],customOutput='tiling')
        result=generate(params)
        self.assertEqual(result['source']['output'],'tiling')
        self.assertEqual(result['stats']['foldability'],'not_applicable')
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'not_applicable')
        self.assertEqual(len(result['mother']['faces_vertices']),2)
        self.assertEqual(len(result['mother']['edges_vertices']),3+2*n-1)
        self.assertEqual(result['fold']['edges_assignment'].count('F'),1)
        with self.assertRaisesRegex(ValueError,'凹形拼块'):
            generate({**params,'customOutput':'twist'})
        with self.assertRaisesRegex(ValueError,'退化|自交'):
            validate_request({**params,'vertices':[[0,0],[1,1],[0,1],[1,0]],'faces':[[0,1,2,3]]})

    def test_skew_lattice_generates_shared_geometry_and_flat_foldable_crease_pattern(self):
        vertices=[[0,0],[1,0],[1.5,1],[.5,1]]
        params={'family':'custom','vertices':vertices,'faces':[[0,1,2,3]],'repeatX':2,'repeatY':3,'lattice':[[1,0],[.5,1]]}
        result=generate(params)
        basic.TessellationTests.assert_candidate(self,result)
        self.assertEqual(result['stats']['tiles'],6)
        self.assertEqual(result['stats']['parameters']['lattice'],params['lattice'])
        mother=result['mother']
        self.assertEqual(len(mother['vertices_coords']),12)
        self.assertEqual(len(mother['edges_vertices']),17)
        self.assertIn([3.5,3.0],mother['vertices_coords'])

    def test_reflex_at_origin_stars_keep_one_concave_face_and_a_flat_join(self):
        # Origamica notes 26420–26428 explicitly allow alpha > 180 degrees:
        # the origin, rather than the next vertex, then becomes reflex.
        for n in (3,5,12):
            with self.subTest(points=n):
                alpha=math.radians(200);step=math.pi/n
                ri=math.sin(alpha/2)/math.sin(step)
                ro=math.sin(math.pi-alpha/2-step)/math.sin(step)
                center=[1+ri*math.cos(alpha/2+step),ri*math.sin(alpha/2+step)]
                star=[[center[0]-(ro if i%2==0 else ri)*math.cos(i*step+alpha/2),center[1]-(ro if i%2==0 else ri)*math.sin(i*step+alpha/2)] for i in range(2*n)]
                triangle=[[1,0],[0,0],[.5,-math.sqrt(3)/2]]
                params=dict(family='custom',vertices=triangle+star[2:],faces=[[0,1,2],[1,0]+list(range(3,3+2*n-2))],customOutput='tiling')
                result=generate(params)
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(len(result['mother']['faces_vertices']),2)
                self.assertEqual(sorted(map(len,result['mother']['faces_vertices'])),[3,2*n])
                self.assertEqual(result['fold']['edges_assignment'].count('F'),1)
                with self.assertRaisesRegex(ValueError,'凹形拼块'):
                    generate({**params,'customOutput':'twist'})

    def test_single_triangle_and_lattice_input_validation(self):
        params={'family':'custom','vertices':[[0,0],[1,0],[.5,.8660254038]],'faces':[[0,1,2]]}
        result=generate(params)
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'not_applicable')
        self.assertEqual(result['fold']['edges_assignment'],['B','B','B'])
        self.assertEqual(len(result['fold']['faces_vertices']),1)
        for lattice in ([[1,0],[2,0]],[[0,0],[0,1]],[[1,0],[0,30]],[[1,0],[0,float('nan')]],[[True,0],[0,1]]):
            with self.subTest(lattice=lattice),self.assertRaises(ValueError):validate_request({**params,'lattice':lattice})

    def test_existing_bbox_repetition_matches_explicit_axis_vectors(self):
        ps=[[0,0],[1,0],[1,1],[0,1]];faces=[[0,1,2,3]]
        self.assertEqual(custom_mesh(ps,faces,3,2),custom_mesh(ps,faces,3,2,[[1,0],[0,1]]))

    def test_tile_source_indices_and_original_corners_survive_repetition_and_prune(self):
        vertices=[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]
        faces=[[0,1,4,3],[1,2,5,4]]
        mother=custom_mesh(vertices,faces,2,1)
        self.assertEqual(mother['zhezhi_custom_face_index'],[0,1,0,1])
        self.assertEqual(mother['zhezhi_custom_polygons'][1],[[1,0],[2,0],[2,1],[1,1]])
        trimmed=prune_mesh(mother,[[1.2,.2],[1.8,.2],[1.8,.8],[1.2,.8]])
        self.assertEqual(trimmed['zhezhi_custom_face_index'],[1])
        self.assertEqual(trimmed['zhezhi_custom_polygons'],[mother['zhezhi_custom_polygons'][1]])


if __name__=='__main__':unittest.main()
