import copy
import math
import unittest

from tessellate import generate, validate_request, check_geometry
from tessellation_advanced import MIXED
import test_tessellation as basic


CUSTOM = {'family':'custom','vertices':[[0,0],[.5,0],[1,0],[0,.5],[.5,.5],[1,.5],[0,1],[.5,1],[1,1]],'faces':[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]]}


class AdvancedTests(unittest.TestCase):
    def assert_candidate(self, result):
        basic.TessellationTests.assert_candidate(self, result)

    def test_all_archimedean_types(self):
        for tiling in MIXED:
            for rings in (1,2):
                with self.subTest(tiling=tiling,rings=rings):
                    self.assert_candidate(generate({'family':'archimedean','tiling':tiling,'rings':rings,**({'cairoOutput':'twist'} if tiling in ('cairo','double-cairo') else {})}))

    def test_nonperiodic_defaults_and_seeds(self):
        for kind in ('voronoi','delaunay','penrose'):
            for seed in (1,17):
                with self.subTest(kind=kind,seed=seed):
                    self.assert_candidate(generate({'family':'nonperiodic','kind':kind,'seed':seed}))
        for kind,depth in (('penrose',3),('goldberg',1),('goldberg',2)):
            with self.subTest(kind=kind,depth=depth):self.assert_candidate(generate({'family':'nonperiodic','kind':kind,'depth':depth}))

    def test_custom_repeat_and_winding(self):
        for x,y in ((1,1),(2,3)):
            params={**CUSTOM,'repeatX':x,'repeatY':y}
            r=generate(params);self.assert_candidate(r)
            self.assertEqual(r['stats']['tiles'],4*x*y)
            reverse={**params,'faces':[face[::-1] for face in params['faces']]}
            self.assertEqual(r['fold'],generate(reverse)['fold'])

    def test_two_face_custom_patch_without_interior_vertices(self):
        result=generate({'family':'custom','vertices':[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],'faces':[[0,1,4,3],[1,2,5,4]]})
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'not_applicable')
        self.assertEqual(result['stats']['checks']['local']['interiorVertices'],0)
        self.assertNotIn('U',result['fold']['edges_assignment'])

    def test_offset_and_split_twists(self):
        for sides in (3,4,6,8):
            for count in (2,4):
                with self.subTest(sides=sides,count=count):
                    self.assert_candidate(generate({'family':'twist','sides':sides,'splitCount':count,'offsetX':.15,'offsetY':-.1}))

    def test_rings(self):
        for sides,rings,growth in ((3,1,1.5),(8,2,1.8),(16,4,2.5)):
            with self.subTest(sides=sides,rings=rings):
                r=generate({'family':'ring','sides':sides,'rings':rings,'growth':growth})
                self.assert_candidate(r);self.assertEqual(r['stats']['tiles'],1+sides*rings)

    def test_flagstone_width_aspect_and_size(self):
        for width,aspect,rows in ((.1,.5,2),(.25,1,3),(.45,2,6)):
            with self.subTest(width=width,aspect=aspect,rows=rows):
                self.assert_candidate(generate({'family':'flagstone','width':width,'aspect':aspect,'rows':rows,'columns':rows}))
        for tiling in ('triangle','hexagon'):
            with self.subTest(tiling=tiling):self.assert_candidate(generate({'family':'flagstone','tiling':tiling}))

    def test_custom_convex_twist(self):
        self.assert_candidate(generate({'family':'twist','polygon':[[1,0],[0,.8],[-1,0],[0,-.8]],'splitCount':2}))

    def test_weave_patterns_and_reverse(self):
        for weave in ('plain','basket','twill'):
            a=generate({'family':'woven','weave':weave,'phase':0})
            b=generate({'family':'woven','weave':weave,'phase':1})
            self.assert_candidate(a);self.assert_candidate(b)
            self.assertEqual(a['fold']['vertices_coords'],b['fold']['vertices_coords'])
            self.assertEqual([{'M':'V','V':'M','B':'B'}[x] for x in a['fold']['edges_assignment']],b['fold']['edges_assignment'])

    def test_reciprocal_edit_is_projected_perpendicular(self):
        p={'family':'nonperiodic','kind':'voronoi'};r=generate(p)
        edited=copy.deepcopy(r['dual']['vertices_coords']);edited[0][0]+=.02
        result=generate({**p,'dualTargets':edited});self.assert_candidate(result)
        self.assertNotEqual(result['fold']['vertices_coords'],r['fold']['vertices_coords'])
        mother=result['mother'];centers=result['dual']['vertices_coords'];incident={}
        for i,face in enumerate(mother['faces_vertices']):
            for a,b in zip(face,face[1:]+face[:1]):incident.setdefault(tuple(sorted((a,b))),[]).append(i)
        for (a,b),fs in incident.items():
            if len(fs)!=2:continue
            v=[mother['vertices_coords'][b][k]-mother['vertices_coords'][a][k] for k in (0,1)]
            d=[centers[fs[1]][k]-centers[fs[0]][k] for k in (0,1)]
            self.assertAlmostEqual(sum(x*y for x,y in zip(v,d)),0,places=7)

    def test_reproducibility(self):
        for p in ({'family':'archimedean'},{'family':'nonperiodic'},{'family':'nonperiodic','kind':'penrose'},CUSTOM,{'family':'ring'},{'family':'flagstone'},{'family':'woven'}):
            with self.subTest(p=p):self.assertEqual(generate(p)['fold'],generate(p)['fold'])

    def test_invalid_requests(self):
        cases=[{'family':'nonperiodic','kind':'unknown'},{'family':'nonperiodic','count':10000},{'family':'nonperiodic','seed':True},
               {'family':'nonperiodic','points':[[0,0]]*4},{'family':'nonperiodic','points':[[0,0],[1,0],[1,1],[math.inf,1]]},
               {'family':'nonperiodic','kind':'penrose','points':[[0,0],[1,0],[1,1],[0,1]]},
               {'family':'archimedean','tiling':[]},{'family':'ring','growth':1},{'family':'flagstone','width':.9},
               {'family':'woven','weave':'fake'},{'family':'woven','angle':36},{'family':'twist','offsetX':.6,'scale':.5},
               {**CUSTOM,'faces':[[0,1,99],[0,1,4]]},{**CUSTOM,'repeatX':4},{**CUSTOM,'vertices':[[0,0],[0,0],[1,1],[0,1]]}]
        for p in cases:
            with self.subTest(p=p),self.assertRaises(ValueError):validate_request(p)

    def test_bad_custom_topology(self):
        for faces in ([[0,1,4,3],[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]],[[0,2,8,6],[1,5,7,3],[0,1,4,3]]):
            with self.subTest(faces=faces),self.assertRaises(ValueError):generate({**CUSTOM,'faces':faces})


if __name__=='__main__':unittest.main()
