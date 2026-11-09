import math
import unittest
from collections import defaultdict

from tessellation_resch import resch_cell,resch_mesh
from tessellation_meshes import polygon_mesh
from tessellate import generate,check_geometry


class ReschTests(unittest.TestCase):
    def test_five_periods_preserve_unit_edges_and_one_tip_one_reflex(self):
        for index in range(1,6):
            for tip in (10,25,40,55):
                with self.subTest(index=index,tip=tip):
                    cell=resch_cell(index,tip);u,v=cell['lattice'];polygons=[];flags=[]
                    for i in range(3):
                        for j in range(3):
                            polygons.extend([[[x+i*u[0]+j*v[0],y+i*u[1]+j*v[1]] for x,y in p] for p in cell['polygons']])
                            flags.extend(cell['stars'])
                    mesh=polygon_mesh(polygons);coords=mesh['vertices_coords'];edges=defaultdict(int);corners=defaultdict(list)
                    for face,star in zip(mesh['faces_vertices'],flags):
                        for a,b in zip(face,face[1:]+face[:1]):
                            self.assertAlmostEqual(math.dist(coords[a],coords[b]),1,places=7)
                            edges[tuple(sorted((a,b)))]+=1
                        if not star:continue
                        for j,i in enumerate(face):
                            p=coords[face[j-1]];q=coords[i];r=coords[face[(j+1)%len(face)]]
                            a=complex(p[0]-q[0],p[1]-q[1]);b=complex(r[0]-q[0],r[1]-q[1])
                            # FOLD faces use clockwise winding in this project.
                            angle=math.degrees(math.atan2((a.conjugate()*b).imag,(a.conjugate()*b).real))%360
                            corners[i].append(angle)
                            if angle<180:self.assertAlmostEqual(angle,tip,places=5)
                    boundary={i for edge,count in edges.items() if count==1 for i in edge}
                    interior=set(range(len(coords)))-boundary
                    self.assertTrue(interior)
                    for i in interior:
                        self.assertEqual(len(corners[i]),2)
                        self.assertEqual(sum(a<180 for a in corners[i]),1)
                    self.assertEqual(len(coords)-len(mesh['edges_vertices'])+len(mesh['faces_vertices']),1)
                    self.assertEqual(check_geometry(mesh)['status'],'passed')

    def test_actual_twist_candidates_after_changing_tip_angle(self):
        for index in range(1,6):
            for angle in (25,40,55):
                with self.subTest(index=index,angle=angle):
                    r=generate(dict(family='archimedean',tiling=f'resch-catalog-{index}',starAngle=angle,rings=1))
                    self.assertEqual(r['stats']['checks']['geometry']['status'],'passed')
                    self.assertEqual(r['stats']['checks']['local']['status'],'passed')


if __name__=='__main__':unittest.main()
