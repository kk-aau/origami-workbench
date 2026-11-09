"""Explicit inner paper keeps real topology, source provenance and true FF."""
from copy import deepcopy
import math
import unittest

from tessellate import generate,validate_request,check_geometry
from tessellation_flat_embedding import flat_face_embedding
from tessellation_paper import validate_paper_spec
from tessellation_paper_clip import map_vertex_values,_on_segment,inscribed_paper_polygon
from tessellation_paper_inscribed import generate_inscribed_paper,_paper_root
from tessellation_patterns import make_fold


PAPER=dict(shape='square',fit='inscribed',margin=.1)
CUSTOM=dict(family='custom',vertices=[[0,0],[1,0],[1,1],[0,1]],faces=[[0,1,2,3]],repeatX=2,repeatY=2)


class InscribedPaperTests(unittest.TestCase):
    def assert_provenance(self,core,result):
        fold=result['fold'];source=result['source'];old=core['fold']
        self.assertIsNone(result['preview'])
        self.assertEqual(source['paperMethod'],'inscribed-pattern-clip-v1')
        self.assertEqual(len(source['sourceVertexMap']),len(fold['vertices_coords']))
        self.assertEqual(len(source['sourceFaceMap']),len(fold['faces_vertices']))
        mapped=map_vertex_values(source['sourceVertexMap'],old['vertices_coords'])
        span=max(max(p[k] for p in fold['vertices_coords'])-min(p[k] for p in fold['vertices_coords']) for k in (0,1))
        self.assertLessEqual(max(math.dist(a,b) for a,b in zip(mapped,fold['vertices_coords'])),span*1e-8)
        paper=source['paperPolygon'];tolerance=span*1e-7
        for (a,b),kind in zip(fold['edges_vertices'],fold['edges_assignment']):
            p,q=fold['vertices_coords'][a],fold['vertices_coords'][b]
            if kind=='B':
                self.assertTrue(any(_on_segment(p,u,v,tolerance) and _on_segment(q,u,v,tolerance)
                                    for u,v in zip(paper,paper[1:]+paper[:1])))
            else:
                matches=[old_kind for (i,j),old_kind in zip(old['edges_vertices'],old['edges_assignment'])
                         if _on_segment(p,old['vertices_coords'][i],old['vertices_coords'][j],tolerance)
                         and _on_segment(q,old['vertices_coords'][i],old['vertices_coords'][j],tolerance)]
                self.assertEqual(matches,[kind])
        root=source['paperStartingFace']
        self.assertTrue(type(root) is int and 0<=root<len(fold['faces_vertices']))
        for key in ('stationaryFoldFace','foldedFormStationaryFace','paperClipPreview'):
            self.assertNotIn(key,source)
        if 'foldedForm' in source:
            expected,closure=flat_face_embedding(fold,root)
            self.assertLess(closure,span*1e-7)
            self.assertLess(max(math.dist(a,b) for a,b in zip(expected,source['foldedForm'])),span*1e-7)
            for v in fold['faces_vertices'][root]:
                self.assertLess(math.dist(source['foldedForm'][v],fold['vertices_coords'][v]),span*1e-7)

    def test_two_dimensional_families_clip_actual_faces_and_keep_provenance(self):
        requests=[dict(family='woven'),dict(family='woven-lines'),dict(family='polygon-tile'),
                  dict(family='split'),dict(family='brocard'),dict(family='nonperiodic',kind='voronoi'),
                  dict(family='periodic',tiling='square',rows=3,columns=3),dict(family='flagstone'),CUSTOM]
        for params in requests:
            with self.subTest(family=params['family']):
                core=generate(params);result=generate(dict(**params,paper=PAPER))
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                self.assert_provenance(core,result)

    def test_all_shapes_and_large_inset_are_explicit_real_crops(self):
        for shape,extra in (('square',{}),('rectangle',{'aspect':1.5}),('regular',{'sides':6})):
            for margin in (.02,.45):
                for phase in (0,1):
                    with self.subTest(shape=shape,margin=margin,phase=phase):
                        params=dict(family='woven',phase=phase)
                        core=generate(params)
                        result=generate(dict(**params,paper=dict(shape=shape,fit='inscribed',margin=margin,**extra)))
                        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                        self.assert_provenance(core,result)
        # Existing direct helper keeps its old 20% area contract.
        with self.assertRaisesRegex(ValueError,'过小'):
            inscribed_paper_polygon(generate(dict(family='woven'))['fold'],dict(shape='square',margin=.45))

    def test_tiny_precise_polygons_keep_original_scale(self):
        for scale in (1e-8,1e-14):
            params=dict(family='polygon-tile',polygon=[[0,0],[scale,0],[scale,scale],[0,scale]])
            core=generate(params);result=generate(dict(**params,paper=PAPER))
            self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
            self.assertEqual(result['stats']['parameters']['polygon'],params['polygon'])
            self.assertLess(max(abs(v) for p in result['fold']['vertices_coords'] for v in p),scale*2)
            self.assert_provenance(core,result)

    def test_rectangular_extremes_keep_small_real_corner_faces(self):
        for weave in ('plain','basket','twill'):
            for phase in (0,1):
                params=dict(family='woven',weave=weave,phase=phase)
                core=generate(params)
                for aspect in (.2,.5,1,2,5):
                    for margin in (.02,.1,.45):
                        with self.subTest(weave=weave,phase=phase,aspect=aspect,margin=margin):
                            result=generate(dict(**params,paper=dict(shape='rectangle',aspect=aspect,margin=margin,fit='inscribed')))
                            self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                            self.assert_provenance(core,result)

    def test_surviving_anchor_and_face_tile_arrays_are_remapped(self):
        params=dict(family='periodic',tiling='square',rows=3,columns=3)
        core=generate(params)
        paper={**PAPER,'margin':.3}
        first=generate(dict(**params,paper=paper))
        kept=first['source']['sourceFaceMap'][5]
        removed=next(i for i in range(len(core['fold']['faces_vertices'])) if i not in first['source']['sourceFaceMap'])
        stable=_paper_root(first['fold'],first['source']['paperPolygon'])
        for anchor,expected in ((kept,5),(removed,stable)):
            fake=deepcopy(core)
            fake['source'].update(stationaryFoldFace=anchor,foldedForm=flat_face_embedding(core['fold'],anchor)[0],
                                  paperClipPreview={'stale':True},tileFaceIndices=[0,1])
            fake['fold']['zhezhi_face_tile_instance']=list(range(len(core['fold']['faces_vertices'])))
            fake['fold']['zhezhi_face_tile_cell']=[[i,0] for i in range(len(core['fold']['faces_vertices']))]
            result=generate_inscribed_paper(dict(**params,paper=paper),lambda _:fake)
            self.assertEqual(result['source']['paperStartingFace'],expected)
            ids=result['source']['sourceFaceMap']
            self.assertEqual(result['fold']['zhezhi_face_tile_instance'],ids)
            self.assertEqual(result['fold']['zhezhi_face_tile_cell'],[[i,0] for i in ids])
            self.assertNotIn('tileFaceIndices',result['source'])
            self.assert_provenance(fake,result)

    def test_missing_anchor_uses_same_geometric_face_when_source_order_changes(self):
        params=dict(family='periodic',tiling='square',rows=3,columns=3)
        core=generate(params);answers=[]
        for reverse in (False,True):
            fake=deepcopy(core)
            if reverse:fake['fold']['faces_vertices'].reverse()
            result=generate_inscribed_paper(dict(**params,paper=PAPER),lambda _:fake)
            answers.append(result)
        a,b=answers
        points=lambda r:sorted(tuple(round(x,9) for x in p) for p in r['source']['foldedForm'])
        self.assertEqual(points(a),points(b))
        roots=lambda r:sorted(tuple(round(x,9) for x in r['fold']['vertices_coords'][v])
                              for v in r['fold']['faces_vertices'][r['source']['paperStartingFace']])
        self.assertEqual(roots(a),roots(b))

    def test_tiling_outputs_do_not_reflect_flat_auxiliary_edges(self):
        params=dict(**CUSTOM,customOutput='tiling')
        core=generate(params);result=generate(dict(**params,paper=PAPER))
        self.assertEqual(result['source']['output'],'tiling')
        self.assertEqual(result['source']['foldedFormStatus'],'not_applicable')
        self.assertNotIn('foldedForm',result['source'])
        self.assertEqual(result['stats']['checks']['local']['status'],'not_applicable')
        self.assertIn('F',result['fold']['edges_assignment'])
        self.assert_provenance(core,result)

    def test_existing_extend_and_explicit_extend_keep_the_same_cp(self):
        legacy=dict(shape='square',margin=.1)
        self.assertEqual(validate_paper_spec(legacy),legacy)
        params=dict(family='periodic',tiling='square',rows=3,columns=3)
        old=generate(dict(**params,paper=legacy))
        explicit=generate(dict(**params,paper=dict(**legacy,fit='extend')))
        self.assertEqual(old['fold'],explicit['fold'])
        self.assertEqual(old['source']['paperMethod'],'extended-pattern-clip-v1')
        with self.assertRaisesRegex(ValueError,'沿用原边界'):
            generate(dict(family='woven',paper=dict(**legacy,fit='extend')))

    def test_invalid_fit_spatial_inputs_and_concave_faces_fail_closed(self):
        for patch in ({'fit':'automatic'},{'fit':True},{'fit':'inscribed','margin':.451},
                      {'fit':'extend','margin':1.01}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_paper_spec({**PAPER,**patch})
        for family in ('radial-pot','flasher','twist-joined-tube','curved-circle-polyhedral'):
            with self.subTest(family=family),self.assertRaisesRegex(ValueError,'二维内切'):
                validate_request(dict(family=family,paper=PAPER))
        coords=[[0,0],[3,0],[3,3],[2,2.5],[0,3]]
        bad=make_fold(coords,[[i,(i+1)%5] for i in range(5)],['B']*5,[[0,1,2,3,4]])
        fake=dict(fold=bad,source=dict(output='tiling'),stats=dict(parameters=CUSTOM,checks=dict(geometry=check_geometry(bad)),tiles=1))
        with self.assertRaisesRegex(ValueError,'严格凸'):
            generate_inscribed_paper(dict(**CUSTOM,paper=PAPER),lambda _:fake)

    def test_non_string_family_is_rejected_before_paper_dispatch(self):
        for family in ([],{},None,True,1):
            for fit in ('inscribed','extend'):
                with self.subTest(family=family,fit=fit),self.assertRaisesRegex(ValueError,'family 无效'):
                    validate_request(dict(family=family,paper={**PAPER,'fit':fit}))


if __name__=='__main__':unittest.main()
