import copy
import itertools
import json
import math
from pathlib import Path
import random
import unittest
from unittest.mock import patch

from tessellate import generate,validate_request
from tessellation_line_groups import random_lines
from tessellation_courteous_anarchy import _accept_segment,_generate_lines,courteous_lines
from tessellation_woven_inset_separation import woven_inset_separation_query

HERE=Path(__file__).resolve().parents[1]
FIXTURE=json.loads((HERE/'tests/fixtures/courteous-lines-20261010.json').read_text(encoding='utf-8'))
BOX=[[-1.,-1.],[1.,-1.],[1.,1.],[-1.,1.]]


class Stream:
    def __init__(self,values):self.values=iter(values)
    def random(self):return next(self.values)


def horizontal(y):return [abs(y)/math.sqrt(8),.75 if y<0 else .25,0]
def vertical(x):return [abs(x)/math.sqrt(8),.5 if x<0 else 0,.25]


class CourteousTests(unittest.TestCase):
    def test_original_branch_rejects_parallel_without_incrementing_distance_fails(self):
        stream=horizontal(-.5)+horizontal(.5)+vertical(-.99)
        lines,info=_generate_lines(24,.02,BOX,0,1,.02,Stream(stream))
        proof=info['courteousAnarchy']
        self.assertEqual(len(lines),1)
        self.assertEqual([proof[k] for k in ['attempts','distanceFailures','noInteriorIntersectionRejections','resourceAttempts']],[3,1,1,6])
        self.assertEqual(proof['stopReason'],'distance-failures')

    def test_max_tries_counts_actual_distance_failure_and_continues_to_third_candidate(self):
        values=horizontal(-.5)+vertical(-.99)+vertical(0)
        lines,info=_generate_lines(2,.02,BOX,0,2,.02,Stream(values))
        self.assertEqual(len(lines),2)
        self.assertEqual(info['courteousAnarchy']['distanceFailures'],1)
        self.assertEqual(info['courteousAnarchy']['stopReason'],'goal')
        self.assertEqual(info['attempts'],3)

    def test_distance_boundary_is_original_strict_less_than_not_relaxed(self):
        boundary_lines=[[a,b] for a,b in zip(BOX,BOX[1:]+BOX[:1])]
        first=[[-1.,-.5],[1.,-.5]]
        existing=boundary_lines+[first]
        old_points=BOX+first
        candidate=[[-.96875,-1.],[-.96875,1.]]
        self.assertTrue(_accept_segment(candidate,existing,old_points,BOX,1/32)[0])
        self.assertEqual(_accept_segment(candidate,existing,old_points,BOX,math.nextafter(1/32,math.inf))[:2],(False,True))

    def test_all_provider_retries_and_nonintersection_candidates_consume_one_total_resource(self):
        lines,info=_generate_lines(2,.02,BOX,0,20000,.02,Stream(itertools.cycle([.99,0])))
        p=info['courteousAnarchy']
        self.assertEqual(lines,[])
        self.assertEqual([p[k] for k in ['providerAttempts','outsideCenterRejections','resourceAttempts','attempts','distanceFailures']],[5000,5000,5000,0,0])
        self.assertEqual(len(p['randomDraws']),10000);self.assertEqual(p['stopReason'],'resource-attempts')
        values=itertools.chain(horizontal(-.5),itertools.cycle(horizontal(.5)))
        lines,info=_generate_lines(2,.02,BOX,0,20000,.02,Stream(values))
        p=info['courteousAnarchy']
        self.assertEqual(len(lines),1)
        self.assertEqual([p[k] for k in ['resourceAttempts','providerAttempts','attempts','noInteriorIntersectionRejections','distanceFailures']],[5000,2500,2500,2499,0])
        self.assertEqual(p['stopReason'],'resource-attempts')
        with patch('tessellation_courteous_anarchy.random.Random',lambda seed:Stream(itertools.cycle([.99,0]))),self.assertRaisesRegex(ValueError,'未输出CP'):
            courteous_lines(2,.02,BOX)

    def test_actual_native_cases_all_fields_and_independent_face_isometry(self):
        for row in FIXTURE['cases']:
            with self.subTest(name=row['name']),patch('time.perf_counter',return_value=0):
                result=generate(row['params'])
                self.assertEqual(json.dumps(result,sort_keys=True),json.dumps(row['response'],sort_keys=True))
                p=result['source']['courteousAnarchy'];rng=random.Random(row['params']['seed'])
                self.assertEqual(p['randomDraws'],[rng.random() for _ in p['randomDraws']])
                self.assertEqual(p['resourceAttempts'],p['providerAttempts']+p['attempts'])
                self.assertEqual(len(p['randomDraws']),2*p['providerAttempts']+p['attempts'])
                self.assertFalse(p['wolframExecuted']);self.assertFalse(p['wolframSeedSequenceReproduced'])
                cp=result['fold']['vertices_coords'];ff=result['source']['foldedForm']
                for face in result['fold']['faces_vertices']:
                    for i,a in enumerate(face):
                        for b in face[i+1:]:self.assertAlmostEqual(math.dist(cp[a],cp[b]),math.dist(ff[a],ff[b]),places=8)
                self.assertEqual(result['stats']['checks']['layerOrder']['status'],'not_checked')

    def test_every_legacy_default_and_full_response_remains_byte_equivalent(self):
        for row in FIXTURE['legacyBaselines']:
            with self.subTest(params=row['params']),patch('time.perf_counter',return_value=0):
                result=generate(row['params'])
                self.assertEqual(json.dumps(result,sort_keys=True),json.dumps(row['response'],sort_keys=True))
                self.assertNotIn('courteousAnarchy',result['source'])
                self.assertNotIn('randomVersion',result['stats']['parameters'])
        lines,info=random_lines(20,.01,BOX,12,max_tries=1)
        self.assertEqual(info,dict(requested=20,generated=1,attempts=1,seed=12))

    def test_new_finite_fields_defaults_and_illegal_public_queries(self):
        p=validate_request(dict(family='woven-lines',mode='random',randomVersion='original-courteous'))
        self.assertEqual([p['seed'],p['maxTries']],[0,20000])
        base=FIXTURE['cases'][0]['params']
        for bad in [{'mode':'lines'},{'randomVersion':'unsafe'},{'maxTries':20001},{'maxTries':1.5},
                    {'seed':True},{'seed':1000000},{'minDistance':float('nan')},
                    {'samePtTolerance':.001},{'intersectionTolerance':.001},{'randomDraws':[.5]},
                    {'boundary':[[0,0],[1,1],[0,1],[1,0]]}]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):validate_request({**base,**bad})
        with self.assertRaises(ValueError):validate_request(dict(family='woven-lines',mode='random',maxTries=5001))

    def test_inset_diagnostic_uses_same_native_mother_route_without_legacy_rng(self):
        p=FIXTURE['cases'][0]['params'];r=FIXTURE['cases'][0]['response']
        result=woven_inset_separation_query(dict(params=copy.deepcopy(p),start=0,stop=.05,count=5))
        self.assertEqual(result['faceCount'],len(r['mother']['faces_vertices']))
        self.assertTrue(result['uniformInset'])
        with patch('random.Random.uniform',side_effect=AssertionError('legacy uniform sampler must not execute')):
            self.assertEqual(woven_inset_separation_query(dict(params=copy.deepcopy(p),start=0,stop=.05,count=5)),result)


if __name__=='__main__':unittest.main()
