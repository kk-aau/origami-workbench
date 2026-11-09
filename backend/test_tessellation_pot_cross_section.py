"""Literal original two-Line helper; options are finite Graphics rules, not paper."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from tessellate import dispatch_request
from tessellation_pot_cross_section import query_pot_cross_section

FIXTURE=Path(__file__).resolve().parents[1]/'tests/fixtures/pot-cross-section-graphics-20261010.json'


class PotCrossSectionGraphicsTests(unittest.TestCase):
    def test_nonzero_origin_and_reflection_follow_original_atom_order(self):
        query={'family':'pot-cross-section-native','points':[[3,7],[4,8],[4,9],[2.5,10],[4,8]]}
        before=copy.deepcopy(query)
        result=query_pot_cross_section(query)
        self.assertEqual(result['data']['primitives'],[
            {'head':'Line','points':[[0,0],[1,1],[1,2],[-.5,3],[1,1]]},
            {'head':'Line','points':[[0,0],[-1,1],[-1,2],[.5,3],[-1,1]]}])
        self.assertEqual(result['source']['referenceOrigin'],[3,7])
        self.assertEqual(query,before)

    def test_singleton_repeated_negative_and_nonmonotone_points_are_not_pruned(self):
        for points in [[[4,-7]],[[2,3],[2,3],[-4,-2],[1,0],[2,3]],[[0,0],[1e-300,-1e-300],[0,0]]]:
            with self.subTest(points=points):
                r=query_pot_cross_section({'family':'pot-cross-section-native','points':points})
                lines=r['data']['primitives']
                self.assertEqual([p['head'] for p in lines],['Line','Line'])
                self.assertEqual([len(p['points']) for p in lines],[len(points),len(points)])
                for i,p in enumerate(points):
                    translated=[p[0]-points[0][0],p[1]-points[0][1]]
                    self.assertEqual(lines[0]['points'][i],translated)
                    self.assertEqual(lines[1]['points'][i],[-translated[0],translated[1]])

    def test_seven_graphics_rules_preserve_input_order_and_full_line_coordinates(self):
        case=next(c for c in json.loads(FIXTURE.read_text(encoding='utf-8'))['cases'] if c['name']=='all-seven')
        q=copy.deepcopy(case['query']);r=query_pot_cross_section(q)
        self.assertEqual(r,case['response'])
        self.assertEqual([p['option'] for p in r['source']['forwardedGraphicsRules']],list(q['graphicsOptions']))
        self.assertEqual(r['data']['options'],q['graphicsOptions'])
        self.assertEqual(r['data']['primitives'][-1]['points'][-1],[-1.7,4])
        self.assertFalse(r['source']['fullOptionsGraphicsReproduced'])
        self.assertFalse(r['source']['mathematicaDefaultRenderingReproduced'])
        self.assertFalse(r['source']['wolframExecuted'])

    def test_public_dispatch_and_fixture_remain_exact(self):
        for case in json.loads(FIXTURE.read_text(encoding='utf-8'))['cases']:
            with self.subTest(case=case['name']):
                self.assertEqual(dispatch_request({**case['query'],'operation':'pot-cross-section-graphics'}),case['response'])

    def test_illegal_fields_options_and_nonfinite_inputs_are_rejected(self):
        base={'family':'pot-cross-section-native','points':[[0,0],[1,1]]}
        invalid=[{'points':[]},{'points':[[True,0]]},{'points':[[0,float('nan')]]},
            {'points':[[0,float('inf')]]},{'points':[[1e6+1,0]]},{'points':[[0,0,0]]},
            {'points':[[0,0]]*513},{'sectors':5},{'family':'rectangular-pot'},
            {'graphicsOptions':{'Axes':'True'}},{'graphicsOptions':{'Axes':[True,0]}},
            {'graphicsOptions':{'AxesOrigin':[0,float('inf')]}},{'graphicsOptions':{'Frame':[True,False]}},
            {'graphicsOptions':{'PlotRange':[[0,0],[0,1]]}},{'graphicsOptions':{'PlotRange':[[0,1e-10],[0,1]]}},
            {'graphicsOptions':{'AspectRatio':True}},{'graphicsOptions':{'AspectRatio':0}},
            {'graphicsOptions':{'ImageSize':'Automatic'}},{'graphicsOptions':{'ImageSize':[320,0]}},
            {'graphicsOptions':{'Background':'url(javascript:alert(1))'}},
            {'graphicsOptions':{'Background':{'RGBColor':[0,0,2]}}},
            {'graphicsOptions':{'Epilog':'Run["foreign"]'}},{'graphicsOptions':{'AxesStyle':{}}},
            {'graphicsOptions':{'__proto__':{'Background':'White'}}}]
        for bad in invalid:
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                dispatch_request({**base,**bad,'operation':'pot-cross-section-graphics'})

    def test_resource_boundary_retains_every_point_of_both_lines(self):
        points=[[float(i),(-1)**i*float(i)] for i in range(512)]
        r=query_pot_cross_section({'family':'pot-cross-section-native','points':points})
        self.assertEqual([len(p['points']) for p in r['data']['primitives']],[512,512])
        self.assertEqual(r['data']['primitives'][0]['points'],points)

    def test_previous_pot_constructor_full_serialized_outputs_are_unchanged(self):
        cases=json.loads(FIXTURE.read_text(encoding='utf-8'))['constructorBaselines']
        with patch('time.perf_counter',return_value=0):
            for case in cases:
                with self.subTest(query=case['query']):
                    r=dispatch_request(case['query'])
                    self.assertEqual(json.dumps(r,sort_keys=True),json.dumps(case['response'],sort_keys=True))


if __name__=='__main__':unittest.main()
