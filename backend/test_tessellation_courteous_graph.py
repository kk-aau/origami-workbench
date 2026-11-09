import copy
import json
import math
from pathlib import Path
import unittest
from unittest.mock import patch

from tessellate import generate, validate_request
from tessellation_courteous_graph import indexify, original_graph, segment_medial
from tessellation_woven_inset_separation import woven_inset_separation_query, inset_separation_from_mesh

FIXTURE = json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/courteous-graph-20261010.json').read_text(encoding='utf-8'))


class CourteousGraphTests(unittest.TestCase):
    def test_first_match_is_nontransitive_and_includes_tolerance_boundary(self):
        segments=[[[0.,0.],[.0625,0.]],[[.125,0.],[0.,0.]]]
        self.assertEqual(indexify(segments,.0625),{'vertices':[[0.,0.],[.125,0.]],'edges':[[0,0],[1,0]]})
        self.assertEqual(len(indexify(segments,math.nextafter(.0625,0))['vertices']),3)

    def test_two_stages_preserve_original_order_and_empty_original_faces(self):
        graph, proof=original_graph([[[0.,0.],[1.,0.]],[[.5,-1.],[.5,1.]]])
        self.assertEqual(proof['firstIndex'],{'vertices':[[0.,0.],[1.,0.],[.5,-1.],[.5,1.]],'edges':[[0,1],[2,3]]})
        self.assertEqual(graph,{'vertices':[[0.,0.],[.5,0.],[1.,0.],[.5,-1.],[.5,1.]],'edges':[[0,1],[1,2],[3,1],[1,4]],'faces':[]})
        self.assertEqual(proof['edgeOrigins'],[0,0,1,1])

    def test_two_tolerances_independently_control_near_t_midpoint_and_indexing(self):
        segments=[[[0.,0.],[1.,0.]],[[.5,.03125],[.5,1.]]]
        low,_=original_graph(segments,.04,.031)
        high,proof=original_graph(segments,.04,.03125)
        separate,_=original_graph(segments,.001,.03125)
        self.assertEqual(len(low['edges']),2)
        self.assertEqual(high['vertices'][1],[.5,.015625])
        self.assertEqual(high['edges'],[[0,1],[1,2],[1,3]])
        self.assertEqual(separate['vertices'][3],[.5,.03125])
        self.assertEqual(proof['samePtTolerance'],.04)
        self.assertEqual(proof['intersectionTolerance'],.03125)

    def test_parallel_overlap_keeps_duplicate_edges_and_only_self_loop_select_removes(self):
        graph,proof=original_graph([[[0.,0.],[1.,0.]],[[1.,0.],[0.,0.]]])
        self.assertEqual(graph['edges'],[[0,1],[1,2],[2,1],[1,0]])
        self.assertEqual(proof['removedSelfLoopSegments'],[])
        lines=[[[-1.,0.],[1.,0.]],[[0.,-1.],[0.,1.]], [[-1.,-1.],[1.,1.]]]
        graph,proof=original_graph(lines)
        self.assertEqual(len(graph['edges']),6)
        self.assertEqual(len(proof['removedSelfLoopSegments']),3)
        self.assertEqual(len(proof['secondIndex']['edges']),9)

    def test_equal_medial_minima_must_have_identical_second_index_topology(self):
        row=next(row for row in FIXTURE['cases'] if row['name']=='seed1')
        segments=row['response']['source']['courteousAnarchy']['completeLines']
        self.assertGreater(row['response']['source']['courteousGraph']['medialTieBranchesChecked'],1)
        with self.assertRaisesRegex(ValueError,'不同二轮索引或边来源'):
            original_graph(segments,0,1e-6)

    def test_actual_graph_cp_all_fields_reproduce_and_faces_are_a_separate_adapter(self):
        for row in FIXTURE['cases']:
            with self.subTest(name=row['name']),patch('time.perf_counter',return_value=0):
                result=generate(row['params'])
                self.assertEqual(json.dumps(result,sort_keys=True),json.dumps(row['response'],sort_keys=True))
                source=result['source'];graph=source['courteousGraph']['graph']
                self.assertEqual(graph['faces'],[])
                self.assertEqual(result['mother']['vertices_coords'],graph['vertices'])
                self.assertEqual(result['mother']['edges_vertices'],graph['edges'])
                self.assertTrue(result['mother']['faces_vertices'])
                self.assertTrue(source['courteousAnarchy']['originalGraphOptionsReproduced'])
                self.assertEqual(source['courteousAnarchy']['totalAttemptLimit'],5000)
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                cp,ff=result['fold']['vertices_coords'],source['foldedForm']
                for face in result['fold']['faces_vertices']:
                    for i,a in enumerate(face):
                        for b in face[i+1:]:self.assertAlmostEqual(math.dist(cp[a],cp[b]),math.dist(ff[a],ff[b]),places=8)

    def test_inset_query_uses_exact_original_graph_mother(self):
        row=FIXTURE['cases'][0]
        response=woven_inset_separation_query(dict(params=row['params'],start=0,stop=.015,count=6))
        expected=inset_separation_from_mesh(row['response']['mother']).plot_samples(0,.015,6)
        self.assertEqual(response,{**expected,'uniformInset':True})

    def test_common_segment_and_full_edge_insets_preserve_literal_graph_and_valid_cp(self):
        base=FIXTURE['cases'][0]['response']
        for row in FIXTURE['insetCases']:
            with self.subTest(name=row['name']),patch('time.perf_counter',return_value=0):
                result=generate(row['params'])
                self.assertEqual(json.dumps(result,sort_keys=True),json.dumps(row['response'],sort_keys=True))
                self.assertEqual(result['mother'],base['mother'])
                self.assertEqual(result['source']['courteousGraph'],base['source']['courteousGraph'])
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                if 'fullEdgeInsets' in row['params']:
                    self.assertEqual(result['source']['edgeWidths'],[.02]*len(result['mother']['edges_vertices']))
                else:
                    self.assertEqual([w for owner,w in zip(result['source']['edgeLines'],result['source']['edgeWidths']) if owner==0],[.025,.025])

    def test_options_rejected_outside_new_mode_and_old_sources_unchanged(self):
        base=FIXTURE['cases'][0]['params']
        for tolerance in (True,-.001,.10001,float('nan'),float('inf'),'1e-6'):
            for key in ('samePtTolerance','intersectionTolerance'):
                with self.assertRaises(ValueError):validate_request({**base,key:tolerance})
        for version in ('original-courteous',None):
            p={**base};p.pop('samePtTolerance');p.pop('intersectionTolerance')
            if version:p['randomVersion']=version
            else:p.pop('randomVersion');p['maxTries']=500
            for key in ('samePtTolerance','intersectionTolerance'):
                with self.assertRaises(ValueError):validate_request({**p,key:1e-6})
        legacy=json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/courteous-lines-20261010.json').read_text(encoding='utf-8'))
        for row in [*legacy['cases'],*legacy['legacyBaselines']]:
            with patch('time.perf_counter',return_value=0):
                self.assertEqual(json.dumps(generate(row['params']),sort_keys=True),json.dumps(row['response'],sort_keys=True))


if __name__=='__main__':unittest.main()
