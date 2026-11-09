import unittest
import math
from tessellate import generate,validate_request
from tessellation_flagstone import maxmin_flagstone_centers
from tessellation_meshes import custom_mesh, reciprocal_centers

SAVED_3390_VERTICES=[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-.5,1],[.5,1]]
SAVED_3390_FACES=[[0,1,4,3],[1,2,5,4],[3,4,6],[4,7,6],[4,5,7]]


class FlagstoneSourceTests(unittest.TestCase):
    def test_saved_in3390_maxmin_reciprocal_opens_the_narrow_pleats(self):
        # Origamica P04 In[3390]: five mixed triangular/quadrilateral stones.
        # Its original MaxMinPleat normal constraints have minimum dual edge
        # length 2/3; centroid projection leaves two at ~0.56647 instead.
        vertices=SAVED_3390_VERTICES
        faces=SAVED_3390_FACES
        mother=custom_mesh(vertices,faces,1,1)
        old,old_dual=reciprocal_centers(mother)
        new,new_dual=maxmin_flagstone_centers(mother)
        old_widths=[math.dist(old[a],old[b]) for a,b in old_dual['edges_vertices']]
        new_widths=[math.dist(new[a],new[b]) for a,b in new_dual['edges_vertices']]
        self.assertLess(min(old_widths),.57)
        self.assertAlmostEqual(min(new_widths),2/3,places=7)
        # MaxMinPleat constrains edge-normal displacement; rotating the whole
        # mother must rotate the reciprocal, unlike a world-axis tuck sweep.
        theta=.37;cs,sn=math.cos(theta),math.sin(theta)
        rotated=[[cs*x-sn*y+2,sn*x+cs*y-3] for x,y in mother['vertices_coords']]
        rotated_centers,_=maxmin_flagstone_centers({'vertices_coords':rotated,'faces_vertices':mother['faces_vertices']})
        for (x,y),got in zip(new,rotated_centers):
            self.assertLess(math.dist([cs*x-sn*y+2,sn*x+cs*y-3],got),1e-7)
        result=generate(dict(family='flagstone',motherParams=dict(family='custom',vertices=vertices,faces=faces),shrinkage=.5))
        self.assertEqual(result['source']['junctionAssignment'],'original')
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        self.assertEqual(result['fold']['edges_assignment'].count('U'),0)

    def test_valid_input_reciprocal_is_preserved_for_saved_flagstone_source(self):
        # In[3393] explicitly replaces DualVertices before constructing the
        # flagstone. The already perpendicular, positive targets are source
        # coordinates, not an invitation to rerun MaxMinPleat.
        mother=custom_mesh(SAVED_3390_VERTICES,SAVED_3390_FACES,1,1)
        targets,_=reciprocal_centers(mother)
        optimized,_=maxmin_flagstone_centers(mother)
        self.assertGreater(max(math.dist(a,b) for a,b in zip(targets,optimized)),.05)
        result=generate(dict(family='flagstone',motherParams=dict(family='custom',
            vertices=SAVED_3390_VERTICES,faces=SAVED_3390_FACES),
            dualTargets=targets,shrinkage=.5))
        self.assertIn('feasible input reciprocal or max-min fallback',
                      result['source']['algorithm'])
        for actual,source in zip(result['dual']['vertices_coords'],targets):
            self.assertLess(math.dist(actual,source),1e-9)
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        perturbed=[point[:] for point in targets]
        perturbed[0][0]+=.1
        repaired,_=maxmin_flagstone_centers(mother,perturbed)
        self.assertGreater(math.dist(repaired[0],perturbed[0]),.01)

    def test_legacy_tuck_keeps_projected_dual_and_explicit_default_is_original(self):
        legacy=generate(dict(family='flagstone',junctionAssignment='tuck'))
        original=generate(dict(family='flagstone'))
        explicit=generate(dict(family='flagstone',junctionAssignment='original'))
        self.assertEqual(original['fold'],explicit['fold'])
        self.assertEqual(legacy['source']['junctionAssignment'],'tuck')
        self.assertNotEqual(original['fold']['edges_assignment'],legacy['fold']['edges_assignment'])
        mother=legacy['mother']
        projected,_=reciprocal_centers(mother)
        for got,want in zip(legacy['dual']['vertices_coords'],projected):
            self.assertLess(math.dist(got,want),1e-9)

    def test_original_shrinkage_is_exact_and_uniform_assignment_preserves_geometry(self):
        for tiling in ('square','triangle','hexagon'):
            old=generate(dict(family='flagstone',tiling=tiling,width=.25,junctionAssignment='tuck'))
            scaled=generate(dict(family='flagstone',tiling=tiling,shrinkage=.8,junctionAssignment='tuck'))
            original=generate(dict(family='flagstone',tiling=tiling,shrinkage=.8,junctionAssignment='original'))
            for a,b in zip(old['fold']['vertices_coords'],scaled['fold']['vertices_coords']):
                self.assertLess(math.dist([.8*x for x in a],b),2e-9)
            self.assertEqual(old['fold']['edges_assignment'],scaled['fold']['edges_assignment'])
            self.assertEqual(scaled['fold']['vertices_coords'],original['fold']['vertices_coords'])
            self.assertEqual(scaled['fold']['edges_vertices'],original['fold']['edges_vertices'])
            self.assertNotEqual(scaled['fold']['edges_assignment'],original['fold']['edges_assignment'])
            self.assertEqual(original['stats']['checks']['local']['status'],'passed')
            self.assertEqual(original['source']['junctionAssignment'],'original')

    def test_shrinkage_extremes_and_single_tile(self):
        for rho in (.6,.95,.99):
            result=generate(dict(family='flagstone',shrinkage=rho,junctionAssignment='original',rows=2,columns=2))
            self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
            self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        result=generate(dict(family='flagstone',shrinkage=.05,junctionAssignment='original',rows=2,columns=2))
        self.assertEqual(result['stats']['checks']['geometry']['status'],'failed')
        with self.assertRaisesRegex(ValueError,'退化'):
            generate(dict(family='flagstone',shrinkage=.2,junctionAssignment='original',rows=2,columns=2))
        result=generate(dict(family='flagstone',shrinkage=.6,motherParams=dict(family='custom',vertices=[[0,0],[1,0],[0,1]],faces=[[0,1,2]])))
        self.assertEqual(result['stats']['checks']['local']['status'],'not_applicable')
        self.assertAlmostEqual(max(p[0] for p in result['fold']['vertices_coords'])-min(p[0] for p in result['fold']['vertices_coords']),.6)
        for extra in ({'shrinkage':0},{'shrinkage':1},{'shrinkage':True},{'junctionAssignment':'invalid'}):
            with self.assertRaises(ValueError):validate_request(dict(family='flagstone',**extra))

    def test_existing_regular_output_and_external_source_are_identical(self):
        old=generate(dict(family='flagstone'))
        new=generate(dict(family='flagstone',motherParams=dict(family='periodic',tiling='square',rows=3,columns=3)))
        self.assertEqual(old['fold'],new['fold'])
        self.assertEqual(old['mother'],new['mother'])
        self.assertEqual(old['dual'],new['dual'])

    def test_arbitrary_mesh_sources_and_parameterized_pruning(self):
        cases=[dict(family='custom',vertices=[[0,0],[2,0],[2,1],[0,1],[0,2],[2,2]],faces=[[0,1,2,3],[3,2,5,4]]),
               dict(family='nonperiodic',kind='delaunay',boundaryMode='hull'),
               dict(family='archimedean',tiling='3.6.3.6'),dict(family='ring',sides=6,radii=[1,1.8,3.2]),
               dict(family='periodic',rows=3,columns=3,pruneBoundary=[[.2,.2],[1.8,.2],[1.8,1.8],[.2,1.8]])]
        for source in cases:
            with self.subTest(source=source):
                a=generate(dict(family='flagstone',motherParams=source,width=.2,junctionAssignment='tuck'));b=generate(dict(family='flagstone',motherParams=source,width=.3,junctionAssignment='tuck'))
                self.assertEqual(a['mother'],b['mother'])
                self.assertNotEqual(a['fold'],b['fold'])
                self.assertEqual(a['stats']['checks']['geometry']['status'],'passed')
                local=a['stats']['checks']['local']
                self.assertEqual(local['status'],'passed' if local['interiorVertices'] else 'not_applicable')
        self.assertEqual(a['stats']['tiles'],4)

    def test_invalid_nonflat_sources_are_rejected_not_returned_as_valid(self):
        with self.assertRaisesRegex(ValueError,'双褶'):
            generate(dict(family='flagstone',motherParams=dict(family='nonperiodic',kind='voronoi')))
        for source in (dict(family='flagstone'),dict(family='twist'),None):
            with self.assertRaises(ValueError):validate_request(dict(family='flagstone',motherParams=source))
        with self.assertRaises(ValueError):validate_request(dict(family='flagstone',aspect=2,motherParams=dict(family='periodic')))
