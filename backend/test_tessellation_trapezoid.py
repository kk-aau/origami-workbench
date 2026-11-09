import unittest
import math
from collections import defaultdict,deque
from tessellation_meshes import rotational_trapezoid_mesh,ring_mesh
from tessellate import generate,validate_request,check_geometry


class TrapezoidTests(unittest.TestCase):
    def test_rotational_radii_cyclic_faces_and_center_topology(self):
        radii=[.4,1.3,2,3.7]
        for center in (False,True):
            mesh=rotational_trapezoid_mesh(7,radii,center)
            self.assertEqual(len(mesh['faces_vertices']),21+(7 if center else 1))
            self.assertEqual(sum(len(f)==3 for f in mesh['faces_vertices']),7 if center else 0)
            self.assertEqual(sum(math.hypot(*p)<1e-8 for p in mesh['vertices_coords']),int(center))
            for p in mesh['vertices_coords']:
                self.assertLess(min(abs(math.hypot(*p)-r) for r in ([0]+radii if center else radii)),1e-8)
            for f in mesh['faces_vertices']:
                if len(f)!=4:continue
                ps=[mesh['vertices_coords'][i] for i in f]
                # Every trapezoid is cyclic: opposite interior angles sum to pi.
                def angle(i):
                    p=ps[i];a=[x-y for x,y in zip(ps[(i-1)%4],p)];b=[x-y for x,y in zip(ps[(i+1)%4],p)]
                    return math.acos(sum(x*y for x,y in zip(a,b))/(math.hypot(*a)*math.hypot(*b)))
                self.assertAlmostEqual(angle(0)+angle(2),math.pi,places=7)
            self.assertEqual(check_geometry(mesh)['status'],'passed')
        self.assertEqual(ring_mesh(8,2,1.8),rotational_trapezoid_mesh(8,[1,1.8,3.24]))

    def test_full_construction_has_perpendicular_dual_and_local_conditions(self):
        for center in (False,True):
            result=generate(dict(family='ring',sides=6,radii=[.4,1.3,2.2],includeCenter=center))
            self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
            self.assertEqual(result['stats']['checks']['local']['status'],'passed')
            mesh=result['mother'];dual=result['dual'];owners={}
            for j,f in enumerate(mesh['faces_vertices']):
                for a,b in zip(f,f[1:]+f[:1]):owners.setdefault(tuple(sorted((a,b))),[]).append(j)
            for (a,b),faces in owners.items():
                if len(faces)!=2:continue
                p,q=[mesh['vertices_coords'][i] for i in (a,b)];u,v=[dual['vertices_coords'][i] for i in faces]
                self.assertAlmostEqual(sum((y-x)*(w-z) for x,y,z,w in zip(p,q,u,v)),0,places=7)

    def test_source_face_circumcenters_are_final_dual_vertices(self):
        # In[3385] uses m=11, rvals={1,2,4}, and assigns
        # Circumcenter /@ Faces directly to DualVertices.
        sides=11
        radii=[1,2,4]
        bisector=math.pi/sides
        unit=(math.cos(bisector),math.sin(bisector))
        for center in (False,True):
            with self.subTest(include_center=center):
                result=generate(dict(family='ring',sides=sides,radii=radii,
                                     includeCenter=center,angle=20,scale=.65))
                mother=result['mother']
                dual=result['dual']['vertices_coords']
                self.assertEqual(result['source']['dual'],'rotational trapezoid face circumcenters')
                self.assertEqual(len(dual),sides*(len(radii)-1)+(sides if center else 1))
                first_radius=radii[0]/(2*math.cos(bisector)) if center else 0
                self.assertLess(math.dist(dual[0],[first_radius*x for x in unit]),1e-10)
                annular_radius=(radii[0]+radii[1])/(2*math.cos(bisector))
                first_annular=sides if center else 1
                self.assertLess(math.dist(dual[first_annular],[annular_radius*x for x in unit]),1e-10)
                for face,point in zip(mother['faces_vertices'],dual):
                    distances=[math.dist(point,mother['vertices_coords'][i]) for i in face]
                    self.assertLess(max(distances)-min(distances),1e-10)
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')

    def test_edited_dual_targets_override_source_circumcenters(self):
        base=dict(family='ring',sides=8,radii=[1,1.8,3.24],includeCenter=False)
        original=generate(base)
        edited=[[x+.2,y-.1] for x,y in original['dual']['vertices_coords']]
        result=generate({**base,'dualTargets':edited})
        self.assertNotEqual(result['source'].get('dual'),'rotational trapezoid face circumcenters')
        for expected,actual in zip(edited,result['dual']['vertices_coords']):
            self.assertLess(math.dist(expected,actual),1e-8)

    def test_center_fan_uses_radial_axial_order_and_preserves_lff(self):
        # In[1132] orders dual edges outward first and CCW on equal-radius
        # layers; In[3386] applies that ordering to this rotational family.
        for sides in (11,16):
            with self.subTest(sides=sides):
                result=generate(dict(family='ring',sides=sides,radii=[1,2,4],
                                     includeCenter=True,angle=20,scale=.65))
                checks=result['stats']['checks']
                self.assertEqual(checks['geometry']['status'],'passed')
                self.assertEqual(checks['local']['status'],'passed')
                self.assertEqual(checks['lff']['status'],'passed')
                self.assertEqual(checks['lff']['assignmentViolations'],[])
                self.assertEqual(checks['layerOrder']['status'],'not_checked')
                self.assertIn('radial-major outward',result['source']['assignmentMethod'])

    def test_three_sector_center_fan_is_not_falsely_marked_lff(self):
        result=generate(dict(family='ring',sides=3,radii=[.4,1.3,2.2],
                             includeCenter=True,angle=20,scale=.65))
        lff=result['stats']['checks']['lff']
        self.assertEqual(lff['status'],'failed')
        # An odd-parity cycle in the necessary LFF relation graph rules out
        # every M/V assignment, independently of the chosen ordering.
        graph=defaultdict(list)
        for (a,b),sign in zip(lff['graphEdges'],lff['edgeTypes']):
            parity=int(sign==-1)
            graph[a].append((b,parity))
            graph[b].append((a,parity))
        values={}
        contradiction=False
        for start in graph:
            if start in values:continue
            values[start]=0
            queue=deque([start])
            while queue:
                a=queue.popleft()
                for b,parity in graph[a]:
                    expected=values[a]^parity
                    if b not in values:
                        values[b]=expected
                        queue.append(b)
                    elif values[b]!=expected:
                        contradiction=True
        self.assertTrue(contradiction)

    def test_invalid_radii_and_center_rejected(self):
        for radii in ([],[1,1],[2,1],[0,1],[1,float('nan')],[1,True],[11]):
            with self.subTest(radii=radii),self.assertRaises(ValueError):validate_request(dict(family='ring',radii=radii))
        with self.assertRaises(ValueError):validate_request(dict(family='ring',includeCenter=True))
