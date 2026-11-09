import copy
import math
import unittest
from unittest.mock import patch

import numpy as np

from tessellate import generate
from tessellation_line_groups import arrangement, apply_full_edge_insets, inset_faces
from tessellation_woven import validate_woven


BASE=dict(family='woven-lines',mode='lines',width=.06,lines=[[0,-.4,1],[0,.4,1],[90,-.4,1],[90,.4,1]],
          boundary=[[-1,-1],[1,-1],[1,1],[-1,1]],parity=1,minPleat=1,minBorderPleat=.01,borderInset='auto',stationaryFace=0)

def full_source(data, mixed=False):
    entries=[]
    for edge,((a,b),owner) in enumerate(zip(data['mesh']['edges_vertices'],data['edgeLines'])):
        p,q=data['mesh']['vertices_coords'][a],data['mesh']['vertices_coords'][b]
        h=.03
        if owner<0:
            h=.01 if abs(p[1]+1)<1e-8 and abs(q[1]+1)<1e-8 else .02 if abs(p[0]-1)<1e-8 and abs(q[0]-1)<1e-8 else .03 if abs(p[1]-1)<1e-8 and abs(q[1]-1)<1e-8 else .04
            if mixed and h in (.01,.03):h=0.
        entries.append(dict(edge=edge,line=owner,**{'from':p.copy()},to=q.copy(),inset=h))
    return dict(edgeCount=len(entries),entries=entries)

def mother():
    return arrangement([[a,d,BASE['width']*r] for a,d,r in BASE['lines']],BASE['boundary'])


class WovenFullEdgeInsetTests(unittest.TestCase):
    def test_all_boundary_values_enter_independent_literal_insetpoly_intersections(self):
        data=mother();source=full_source(data);apply_full_edge_insets(data,source)
        actual=inset_faces(data,.03);mesh=data['mesh'];edge_ids={tuple(sorted(e)):i for i,e in enumerate(mesh['edges_vertices'])}
        for face,polygon in zip(mesh['faces_vertices'],actual):
            vertices=mesh['vertices_coords'];face=face[::-1];shifted=[]
            for a,b in zip(face,face[1:]+face[:1]):
                p,q=np.array(vertices[a]),np.array(vertices[b]);subtract=p-q
                # In[931]: -h Rotate90[NormalizeReal[Subtract@@edge]], then
                # LineInt2D1[current translated line, previous translated line].
                normalized=subtract/np.linalg.norm(subtract)
                offset=-source['entries'][edge_ids[tuple(sorted((a,b)))]]['inset']*np.array([-normalized[1],normalized[0]])
                shifted.append((p+offset,q+offset))
            for i,p in enumerate(polygon):
                a,b=shifted[i];c,d=shifted[i-1]
                t,_=np.linalg.solve(np.column_stack((b-a,c-d)),c-a)
                expected=a+t*(b-a)
                self.assertLess(math.dist(p,expected),1e-12)
        self.assertNotEqual(actual,inset_faces(mother(),.03))

    def test_different_positive_four_sides_and_mixed_zero_have_true_cp_ff_isometry(self):
        for mixed in (False,True):
            params={**BASE,'fullEdgeInsets':full_source(mother(),mixed)}
            result=generate(params);self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
            self.assertEqual(result['stats']['checks']['local']['status'],'passed')
            self.assertEqual(result['source']['fullEdgeInsets'],params['fullEdgeInsets'])
            self.assertEqual(result['source']['effectiveEdgeInsets'],[e['inset'] for e in params['fullEdgeInsets']['entries']])
            cp,ff=result['fold']['vertices_coords'],result['source']['foldedForm']
            for face in result['fold']['faces_vertices']:
                for i,a in enumerate(face):
                    for b in face[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(ff[a],ff[b])),1e-7)

    def test_none_and_periodic_force_boundary_zero_preserving_requested_source(self):
        data=mother();points=data['mesh']['vertices_coords'];pairs=[[i,j] for i,p in enumerate(points) for j,q in enumerate(points)
          if abs(p[0]+1)<1e-8 and abs(q[0]-1)<1e-8 and abs(p[1]-q[1])<1e-8 and abs(p[1])<.9]
        for patch in ({'borderInset':'none'},{'periodicity':pairs},{'periodicityEnabled':True,'periodicity':[]}):
            params={**BASE,**patch,'fullEdgeInsets':full_source(data)};result=generate(params)
            self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
            self.assertEqual(result['source']['requestedEdgeInsets'],[e['inset'] for e in params['fullEdgeInsets']['entries']])
            self.assertTrue(all(h==0 for h,line in zip(result['source']['effectiveEdgeInsets'],data['edgeLines']) if line<0))
            original=generate({**BASE,**patch});self.assertEqual(result['fold']['vertices_coords'],original['fold']['vertices_coords'])

    def test_explicit_empty_periodicity_matches_source_list_but_legacy_empty_is_none(self):
        source=full_source(mother())
        legacy=generate({**BASE,'periodicity':[],'fullEdgeInsets':source})
        disabled=generate({**BASE,'periodicityEnabled':False,'periodicity':[],'fullEdgeInsets':source})
        empty=generate({**BASE,'periodicityEnabled':True,'periodicity':[],'fullEdgeInsets':source})
        none=generate({**BASE,'borderInset':'none','fullEdgeInsets':source})
        self.assertEqual(legacy['fold'],disabled['fold']);self.assertEqual(empty['fold'],none['fold'])
        self.assertNotEqual(empty['fold'],legacy['fold']);self.assertTrue(empty['source']['periodicityEnabled'])
        self.assertEqual(empty['source']['requestedEdgeInsets'],legacy['source']['requestedEdgeInsets'])
        for bad in (1,None,'true'):
            with self.assertRaisesRegex(ValueError,'启用标志'):validate_woven({**BASE,'periodicityEnabled':bad})
        with self.assertRaisesRegex(ValueError,'关闭周期'):validate_woven({**BASE,'periodicityEnabled':False,'periodicity':[[0,1]]})

    def test_all_values_remain_absolute_when_width_changes(self):
        source=full_source(mother());a=generate({**BASE,'fullEdgeInsets':source});b=generate({**BASE,'width':.08,'fullEdgeInsets':source})
        self.assertEqual(a['fold'],b['fold']);self.assertEqual(a['source']['effectiveEdgeInsets'],b['source']['effectiveEdgeInsets'])

    def test_source_length_index_owner_endpoint_and_conflict_reject(self):
        source=full_source(mother())
        variants=[]
        bad=copy.deepcopy(source);bad['entries'].pop();variants.append(bad)
        bad=copy.deepcopy(source);bad['edgeCount']-=1;variants.append(bad)
        bad=copy.deepcopy(source);bad['entries'][0]['edge']=1;variants.append(bad)
        bad=copy.deepcopy(source);bad['entries'][0]['line']=20;variants.append(bad)
        bad=copy.deepcopy(source);bad['entries'][0]['from'][0]+=.0001;variants.append(bad)
        for bad in variants:
            with self.subTest(source=bad),self.assertRaises(ValueError):generate({**BASE,'fullEdgeInsets':bad})
        with self.assertRaisesRegex(ValueError,'不能'):validate_woven({**BASE,'fullEdgeInsets':source,'segmentInsets':[]})
        reversed_source=copy.deepcopy(source)
        for e in reversed_source['entries']:e['from'],e['to']=e['to'],e['from']
        self.assertEqual(generate({**BASE,'fullEdgeInsets':source})['fold'],generate({**BASE,'fullEdgeInsets':reversed_source})['fold'])

    def test_zero_interior_is_valid_list_and_insetpoly_but_degenerate_woven_molecule(self):
        data=mother();source=full_source(data);next(e for e in source['entries'] if e['line']>=0)['inset']=0
        self.assertEqual(validate_woven({**BASE,'fullEdgeInsets':source})['fullEdgeInsets'],source)
        apply_full_edge_insets(data,source);self.assertEqual(len(inset_faces(data)),9)
        with self.assertRaisesRegex(ValueError,'零内缩.*分子退化'):generate({**BASE,'fullEdgeInsets':source})

    def test_geometry_stamp_matching_uses_local_extent_and_coordinate_ulp(self):
        for scale in (.001,1):
            for translation in (0.,9.):
                data=mother()
                data['mesh']['vertices_coords']=[[x*scale+translation for x in p] for p in data['mesh']['vertices_coords']]
                source=full_source(data);apply_full_edge_insets(data,copy.deepcopy(source))
                source['entries'][0]['from'][0]+=1e-7*scale
                with self.assertRaisesRegex(ValueError,'几何戳'):apply_full_edge_insets(data,source)

    def test_collapse_and_optimizer_failure_do_not_emit_partial_cp(self):
        source=full_source(mother())
        for e in source['entries']:e['inset']=1.
        with self.assertRaisesRegex(ValueError,'内缩分区|内缩边'):generate({**BASE,'fullEdgeInsets':source})
        with patch('tessellation_woven.least_squares',side_effect=ValueError('独立优化失败')):
            with self.assertRaisesRegex(ValueError,'优化失败'):generate({**BASE,'fullEdgeInsets':full_source(mother())})


if __name__=='__main__':unittest.main()
