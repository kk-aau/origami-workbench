import math
import unittest
from tessellate import generate,validate_request
from tessellation_meshes import penrose_mesh
from tessellation_prune import prune_mesh


class PenroseTests(unittest.TestCase):
    def test_original_level_counts_and_border_half_rhombs(self):
        counts=[5,10,20,30,45,70,115,180]
        halves=[0,0,10,10,10,10,20,20]
        for n in range(8):
            for border in (False,True):
                with self.subTest(n=n,border=border):
                    mesh=penrose_mesh(n,'origamica',border)
                    self.assertEqual(len(mesh['faces_vertices']),counts[n]-(0 if border else halves[n]))
                    self.assertEqual(sum(len(f)==3 for f in mesh['faces_vertices']),halves[n] if border else 0)
                    for f in mesh['faces_vertices']:
                        if len(f)!=4:continue
                        points=[mesh['vertices_coords'][i] for i in f]
                        lengths=[math.dist(a,b) for a,b in zip(points,points[1:]+points[:1])]
                        self.assertLess(max(lengths)-min(lengths),2e-9)
                        a,b,c=points[:3];u=[a[k]-b[k] for k in (0,1)];v=[c[k]-b[k] for k in (0,1)]
                        angle=math.degrees(math.acos(sum(x*y for x,y in zip(u,v))/(math.hypot(*u)*math.hypot(*v))))
                        self.assertLess(min(abs(angle-x) for x in [36,72,108,144]),1e-5)

    def test_legacy_depth_maps_to_odd_original_level_with_fixed_rotation(self):
        c,s=math.cos(-math.pi/10),math.sin(-math.pi/10)
        for depth in (1,2,3):
            old=penrose_mesh(depth);new=penrose_mesh(2*depth-1,'origamica')
            def faces(mesh,rotate=False):
                def point(p):return tuple(round(v,7) for v in ([c*p[0]-s*p[1],s*p[0]+c*p[1]] if rotate else p))
                return {tuple(sorted(point(mesh['vertices_coords'][i]) for i in face)) for face in mesh['faces_vertices']}
            self.assertEqual(faces(old,True),faces(new))
            self.assertEqual(old,penrose_mesh(depth,'legacy',True))
        star=penrose_mesh(0,'origamica')
        self.assertEqual(len(star['vertices_coords']),11)
        radii=sorted(set(round(math.hypot(*p),7) for p in star['vertices_coords']))
        self.assertEqual(radii,[0,1,round((1+math.sqrt(5))/2,7)])

    def test_original_dual_positions_and_all_levels_construct(self):
        # In[3382]: Sun a1[x=(1,0),y=(0,0),z=U(-36°)] deflates to
        # a2[d,z,x], d=(GoldenRatio-1,0), whose dual point is (1/2,0).
        sun=penrose_mesh(1,'origamica')
        self.assertAlmostEqual(sun['zhezhi_penrose_dual_targets'][0][0],.5,places=12)
        self.assertAlmostEqual(sun['zhezhi_penrose_dual_targets'][0][1],0,places=12)
        star=penrose_mesh(0,'origamica')
        self.assertLess(abs(star['vertices_coords'][star['faces_vertices'][0][0]][0]-
                            (1+math.cos(2*math.pi/5))),1e-12)
        for n in range(8):
            for border in (False,True):
                with self.subTest(n=n,border=border):
                    result=generate(dict(family='nonperiodic',kind='penrose',depth=n,penroseVersion='origamica',borderTriangles=border))
                    self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                    self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                    targets=result['mother']['zhezhi_penrose_dual_targets']
                    self.assertEqual(result['dual']['vertices_coords'],targets)
                    self.assertEqual(result['source']['dual'],'Penrose source triangle coordinates')
                    owners={}
                    mother=result['mother']
                    for face_id,face in enumerate(mother['faces_vertices']):
                        for a,b in zip(face,face[1:]+face[:1]):
                            owners.setdefault(tuple(sorted((a,b))),[]).append(face_id)
                    for (a,b),adjacent in owners.items():
                        if len(adjacent)!=2:continue
                        edge=[mother['vertices_coords'][b][k]-mother['vertices_coords'][a][k] for k in (0,1)]
                        difference=[targets[adjacent[1]][k]-targets[adjacent[0]][k] for k in (0,1)]
                        self.assertLess(abs(sum(x*y for x,y in zip(edge,difference)))/math.hypot(*edge),1e-9)
        mesh=penrose_mesh(5,'origamica');window=[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]]
        pruned=prune_mesh(mesh,window)
        self.assertEqual(len(pruned['faces_vertices']),len(pruned['zhezhi_penrose_dual_targets']))
        pruned_result=generate(dict(family='nonperiodic',kind='penrose',depth=5,penroseVersion='origamica',pruneBoundary=window))
        self.assertEqual(pruned_result['dual']['vertices_coords'],pruned_result['mother']['zhezhi_penrose_dual_targets'])

    def test_invalid_versions_and_options(self):
        for extra in ({'depth':0},{'penroseVersion':'bad'},{'penroseVersion':'origamica','depth':8},{'borderTriangles':1},{'kind':'voronoi','penroseVersion':'origamica'}):
            with self.subTest(extra=extra),self.assertRaises(ValueError):validate_request(dict(family='nonperiodic',kind='penrose')|extra)
