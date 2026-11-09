import unittest
from collections import Counter, defaultdict
import math

from tessellate import check_geometry, generate
from tessellation_paper import envelope_paper, paper_local_conditions, paper_polygon, validate_paper_spec


def area(points):
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(points,points[1:]+points[:1])))/2


class PaperEnvelopeTests(unittest.TestCase):
    def test_independent_outline_is_one_closed_sheet_and_original_faces_remain(self):
        original=generate(dict(family='periodic',tiling='square',rows=2,columns=2))['fold']
        old_boundary={tuple(sorted(edge)) for edge,assignment in zip(original['edges_vertices'],original['edges_assignment'])
                      if assignment=='B'}
        for shape,options in (('square',{}),('rectangle',{'aspect':1.7}),('regular',{'sides':6})):
            with self.subTest(shape=shape):
                wrapped=envelope_paper(original,shape,**options)
                self.assertEqual(check_geometry(wrapped)['status'],'passed')
                self.assertEqual(paper_local_conditions(wrapped)['status'],'passed')
                self.assertGreater(len(wrapped['faces_vertices']),len(original['faces_vertices']))
                self.assertEqual(wrapped['vertices_coords'][:len(original['vertices_coords'])],original['vertices_coords'])
                self.assertEqual(wrapped['edges_vertices'][:len(original['edges_vertices'])],original['edges_vertices'])
                self.assertEqual(wrapped['edges_assignment'][:len(original['edges_assignment'])],
                                 ['F' if kind=='B' else kind for kind in original['edges_assignment']])
                assignments={tuple(sorted(edge)):assignment for edge,assignment in zip(wrapped['edges_vertices'],wrapped['edges_assignment'])}
                self.assertTrue(all(assignments[edge]=='F' for edge in old_boundary))
                recipe=wrapped['zhezhi_paper_recipe']
                old_count=recipe['originalVertices'];outline_count=recipe['outlineVertices']
                self.assertEqual(recipe['originalEdges'],len(original['edges_vertices']))
                self.assertEqual(set(recipe['originalBoundaryVertices']),
                                 {v for edge,kind in zip(original['edges_vertices'],original['edges_assignment']) if kind=='B' for v in edge})
                old_assignment={tuple(sorted(edge)):kind for edge,kind in zip(original['edges_vertices'],original['edges_assignment'])}
                for extension in recipe['rayExtensions']:
                    vertex,other,target=extension['boundaryVertex'],extension['interiorVertex'],extension['targetVertex']
                    self.assertLess(vertex,old_count)
                    self.assertGreaterEqual(target,old_count)
                    self.assertLess(extension['paperSide'],outline_count)
                    kind=old_assignment[tuple(sorted((vertex,other)))]
                    self.assertIn(kind,('M','V'))
                    self.assertEqual(assignments[tuple(sorted((vertex,target)))],kind)
                    a,b,c=[wrapped['vertices_coords'][i] for i in (other,vertex,target)]
                    direction=[b[j]-a[j] for j in (0,1)];continued=[c[j]-b[j] for j in (0,1)]
                    self.assertLess(abs(direction[0]*continued[1]-direction[1]*continued[0]),1e-8)
                    self.assertGreater(direction[0]*continued[0]+direction[1]*continued[1],0)
                self.assertEqual({frozenset(face) for face in original['faces_vertices']}-
                                 {frozenset(face) for face in wrapped['faces_vertices']},set())
                owners=Counter(tuple(sorted((a,b))) for face in wrapped['faces_vertices']
                               for a,b in zip(face,face[1:]+face[:1]))
                self.assertTrue(all(owners[tuple(sorted(edge))]==(1 if assignment=='B' else 2)
                                    for edge,assignment in zip(wrapped['edges_vertices'],wrapped['edges_assignment'])))
                boundary=defaultdict(list)
                for (a,b),assignment in zip(wrapped['edges_vertices'],wrapped['edges_assignment']):
                    if assignment=='B':boundary[a].append(b);boundary[b].append(a)
                self.assertTrue(all(len(neighbors)==2 for neighbors in boundary.values()))
                self.assertEqual(len(boundary),sum(a=='B' for a in wrapped['edges_assignment']))
                self.assertEqual(recipe['originalVertices'],len(original['vertices_coords']))
                self.assertEqual(recipe['outlineVertices'],len(wrapped['zhezhi_paper_outline']))
                self.assertTrue(math.isclose(area(wrapped['zhezhi_paper_outline']),
                    sum(area([wrapped['vertices_coords'][i] for i in face]) for face in wrapped['faces_vertices']),rel_tol=1e-8))
                self.assertEqual(wrapped.get('zhezhi_preview'),original.get('zhezhi_preview'))

    def test_default_primal_and_archimedean_preserve_exact_old_geometry(self):
        for params in (dict(family='primal-dual',tiling='square',rings=2),
                       dict(family='archimedean',tiling='4.8.8',rings=2)):
            with self.subTest(params=params):
                original=generate(params)['fold']
                wrapped=envelope_paper(original)
                self.assertEqual(check_geometry(wrapped)['status'],'passed')
                self.assertEqual(paper_local_conditions(wrapped)['status'],'passed')
                self.assertEqual(wrapped['vertices_coords'][:len(original['vertices_coords'])],original['vertices_coords'])
                self.assertGreater(sum(a=='B' for a in wrapped['edges_assignment']),0)

    def test_branching_fold_terminals_and_invalid_paper_shapes_fail_closed(self):
        goldberg=generate(dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',
                               goldbergOrder=8,goldbergRings=2,goldbergOutput='twist'))['fold']
        with self.assertRaisesRegex(ValueError,'多条山谷线'):
            envelope_paper(goldberg)
        voronoi=generate(dict(family='nonperiodic',kind='voronoi'))['fold']
        with self.assertRaisesRegex(ValueError,'相交'):
            envelope_paper(voronoi,'rectangle',aspect=1.5)
        coords=[[0,0],[2,0],[2,1],[0,1]]
        for kwargs in ({'shape':'circle'},{'shape':'rectangle','aspect':0},
                       {'shape':'regular','sides':2},{'margin':0}):
            with self.subTest(kwargs=kwargs),self.assertRaises(ValueError):
                paper_polygon(coords,**kwargs)

    def test_paper_request_validation_matches_three_ui_shapes(self):
        for spec,expected in (
            ({'shape':'square','margin':.1},{'shape':'square','margin':.1}),
            ({'shape':'rectangle','margin':.25,'aspect':1.5},{'shape':'rectangle','margin':.25,'aspect':1.5}),
            ({'shape':'regular','margin':.2,'sides':6},{'shape':'regular','margin':.2,'sides':6}),
            ({'shape':'rectangle','margin':.1},{'shape':'rectangle','margin':.1}),
            ({'shape':'regular','margin':.1},{'shape':'regular','margin':.1}),
        ):
            with self.subTest(spec=spec):self.assertEqual(validate_paper_spec(spec),expected)
        for spec in (None,{},[],{'shape':'circle','margin':.1},
                     {'shape':'square','margin':True},{'shape':'square','margin':float('nan')},
                     {'shape':'square','margin':10**1000},{'shape':'square','margin':.01},
                     {'shape':'square','margin':.1,'extra':1},{'shape':'square','margin':.1,'aspect':1},
                     {'shape':'rectangle','margin':.1,'sides':4},
                     {'shape':'rectangle','margin':.1,'aspect':True},
                     {'shape':'regular','margin':.1,'aspect':1},
                     {'shape':'regular','margin':.1,'sides':4.5}):
            with self.subTest(spec=spec),self.assertRaises(ValueError):validate_paper_spec(spec)


if __name__=='__main__':unittest.main()
