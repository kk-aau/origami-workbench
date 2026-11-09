import unittest
import math
from tessellate import generate,validate_request,check_geometry
from tessellation_meshes import site_mesh,seeded_points

BOUND=[[-2,-1],[2,-1],[1.5,2],[-1.5,2]]
SEEDS=[[-1,-.5],[1,-.5],[.8,.9],[-.7,.8],[0,0]]

def area(points):
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(points,points[1:]+points[:1])))/2

class SiteBoundaryTests(unittest.TestCase):
    def test_voronoi_covers_requested_convex_boundary_and_cells_are_nearest(self):
        mesh=site_mesh('voronoi',SEEDS,BOUND)
        total=0
        for face in mesh['faces_vertices']:
            poly=[mesh['vertices_coords'][i] for i in face];total+=area(poly)
            center=[sum(p[k] for p in poly)/len(poly) for k in (0,1)]
            seed=min(SEEDS,key=lambda q:math.dist(center,q))
            for p in poly:
                self.assertLessEqual(math.dist(p,seed),min(math.dist(p,q) for q in SEEDS)+1e-7)
        self.assertAlmostEqual(total,area(BOUND),places=7)
        self.assertEqual(check_geometry(mesh)['status'],'passed')
        result=generate(dict(family='nonperiodic',kind='voronoi',points=SEEDS,boundary=BOUND))
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        self.assertEqual(result['stats']['parameters']['boundary'],BOUND)

    def test_hull_uses_only_supplied_seeds_and_legacy_square_is_unchanged(self):
        hull=site_mesh('delaunay',SEEDS,boundary_mode='hull')
        self.assertEqual(set(map(tuple,hull['vertices_coords'])),set(map(tuple,SEEDS)))
        self.assertEqual(len(hull['faces_vertices']),4)
        square=site_mesh('delaunay',SEEDS)
        self.assertEqual(square,site_mesh('delaunay',SEEDS,boundary_mode='square'))
        self.assertIn([0,1],square['vertices_coords'])
        result=generate(dict(family='nonperiodic',kind='delaunay',points=SEEDS,boundaryMode='hull'))
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        # In[3375] requires the reciprocal vertex of each Delaunay triangle
        # to be its circumcenter, rather than an arbitrary perpendicular dual.
        for face,center in zip(result['mother']['faces_vertices'],result['dual']['vertices_coords']):
            distances=[math.dist(center,result['mother']['vertices_coords'][i]) for i in face]
            self.assertLess(max(distances)-min(distances),1e-8)
        triangle=generate(dict(family='nonperiodic',kind='delaunay',points=SEEDS[:3],boundaryMode='hull'))
        self.assertEqual(triangle['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(triangle['stats']['checks']['local']['status'],'not_applicable')

    def test_custom_boundary_random_points_are_repeatable_and_inside(self):
        points=seeded_points(36,17,BOUND)
        self.assertEqual(points,seeded_points(36,17,BOUND))
        self.assertTrue(all((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>=-1e-8 for a,b in zip(BOUND,BOUND[1:]+BOUND[:1]) for p in points))
        result=generate(dict(family='nonperiodic',kind='voronoi',boundary=BOUND))
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')

    def test_invalid_boundary_and_outside_or_degenerate_seeds_are_rejected(self):
        for patch in [dict(boundary=[[0,0],[1,1],[1,0],[0,1]]),dict(boundary=BOUND,points=[[8,8],[0,0],[1,0]]),dict(boundaryMode='hull')]:
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request(dict(family='nonperiodic',kind='voronoi',**patch))
        with self.assertRaises(ValueError):generate(dict(family='nonperiodic',kind='delaunay',points=[[0,0],[1,1],[2,2]],boundaryMode='hull'))
        self.assertEqual(validate_request(dict(family='nonperiodic',kind='voronoi',boundary=BOUND[::-1]))['boundary'],BOUND)

if __name__=='__main__':unittest.main()
