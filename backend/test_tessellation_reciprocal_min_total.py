import copy
from decimal import Decimal, localcontext
import json
import math
from pathlib import Path
import unittest
from unittest.mock import patch

from tessellate import generate, validate_request
from tessellation_reciprocal_min_total import make_min_total_pleat

FIXTURE = json.loads((Path(__file__).resolve().parents[1] / 'tests/fixtures/min-total-pleat-20261010.json').read_text(encoding='utf-8'))
VERTICES = [[0, 0], [1, 0], [0, 1], [-1, -1]]
EDGES = [[0, 1], [0, 2], [0, 3]]
DUAL_EDGES = [[0, 1], [1, 2], [2, 0]]


class MinTotalPleatTests(unittest.TestCase):
    def solve(self, initial):
        return make_min_total_pleat(VERTICES, EDGES, initial, DUAL_EDGES)

    def test_hand_triangle_unique_lp_and_original_final_fit(self):
        returned, proof = self.solve([[0, 0], [0, 2], [-2, 2]])
        self.assertEqual(proof['inputSigns'], [1, 1, 1])
        self.assertEqual(proof['normalizedDualVertices'], [[0, 0], [0, 1], [-1, 1]])
        self.assertAlmostEqual(proof['totalNormalizedPleat'], 2 + math.sqrt(2), places=13)
        self.assertEqual(returned, [[0, 0], [0, 2], [-2, 2]])
        self.assertEqual(proof['fit'], {'scale': 2, 'translation': [0, 0], 'squaredDeviation': 0})
        self.assertEqual(proof['certificate']['uniqueRank'], 6)
        self.assertFalse(proof['wolframExecuted'])

    def test_independent_rational_nonreciprocal_input_fit(self):
        returned, proof = self.solve([[3, -2], [3, 1], [1, 0]])
        self.assertAlmostEqual(proof['fit']['scale'], 9/4, places=13)
        for a, b in zip(proof['fit']['translation'], [37/12, -11/6]):
            self.assertAlmostEqual(a, b, places=13)
        for p, q in zip(returned, [[37/12, -11/6], [37/12, 5/12], [5/6, 5/12]]):
            for a, b in zip(p, q):self.assertAlmostEqual(a, b, places=13)
        self.assertAlmostEqual(proof['fit']['squaredDeviation'], 7/12, places=13)

    def test_unit_floor_applies_before_unconstrained_rms_rescaling(self):
        small = [[0, 0], [0, .25], [-.25, .25]]
        returned, proof = self.solve(small)
        self.assertEqual(returned, small)
        self.assertEqual(proof['fit']['scale'], .25)
        self.assertEqual(proof['normalizedPleatLengths'][:2], [1, 1])
        self.assertLess(math.dist(returned[0], returned[1]), 1)
        mirrored, mirror = self.solve([[0, 0], [0, -2], [2, -2]])
        self.assertEqual(mirror['inputSigns'], [-1, -1, -1])
        self.assertEqual(mirrored, [[0, 0], [0, -2], [2, -2]])

    def test_input_pair_order_and_source_sign_are_preserved(self):
        initial = [[0, 0], [0, 2], [-2, 2]]
        expected, _ = self.solve(initial)
        order = [2, 0, 1]
        result, proof = make_min_total_pleat(VERTICES, [EDGES[i] for i in order], initial, [DUAL_EDGES[i] for i in order])
        self.assertEqual(result, expected)
        self.assertEqual(proof['input']['interiorEdges'], [EDGES[i] for i in order])
        reversed_edges = [EDGES[0][::-1], *EDGES[1:]]
        result, proof = make_min_total_pleat(VERTICES, reversed_edges, initial, DUAL_EDGES)
        self.assertEqual(result, expected)
        self.assertEqual(proof['inputSigns'], [-1, 1, 1])

    def test_source_zero_signature_infeasible_and_nonunique_are_refused(self):
        for initial, message in [([[0, 0], [1, 0], [-1, 1]], 'Sign为零'),
                                 ([[0, 0], [0, 1], [-1, -2]], '无有限可行解')]:
            with self.assertRaisesRegex(ValueError, message):self.solve(initial)
        vertices = [[0, 0], [0, -1], [0, -2], [1, 0], [0, 1], [-1, 2]]
        with self.assertRaisesRegex(ValueError, '唯一性证书'):
            make_min_total_pleat(vertices, [[0, i] for i in range(1, 6)],
                                 [[0, 0], [1.5, 0], [3, 0], [3, 1], [2, 1]],
                                 [[i, (i+1) % 5] for i in range(5)])
        self.assertAlmostEqual(self.solve([[0, 0], [0, 2], [-2, 2]])[1]['totalNormalizedPleat'], 2+math.sqrt(2))

    def test_primitive_malformed_and_disconnected_input_never_falls_back(self):
        bad = [dict(vertices=[[False, 0], [1, 0]]), dict(vertices=[[10**1000, 0], [1, 0]]),
               dict(interior_edges=[[0, 1.0]]), dict(interior_edges=[[0, 0]]),
               dict(dual_vertices=[[0, 0], [0, float('nan')], [-2, 2]]),
               dict(dual_edges=[[0, 1], [1, 0], [2, 0]])]
        normal = dict(vertices=VERTICES, interior_edges=EDGES, dual_vertices=[[0, 0], [0, 2], [-2, 2]], dual_edges=DUAL_EDGES)
        for change in bad:
            with self.assertRaises(ValueError):make_min_total_pleat(**{**normal, **change})
        with self.assertRaisesRegex(ValueError, '连通'):
            make_min_total_pleat(VERTICES, [[0, 1]], [[0, 0], [0, 1], [2, 2]], [[0, 1]])

    def test_public_branch_is_finite_explicit_and_not_a_new_default(self):
        base = FIXTURE['cases'][0]['params']
        edits = [dict(reciprocalMethod=value) for value in [None, True, 'MinTotalPleat', 'max-min']]
        edits += [dict(family='periodic'), dict(dualTargets=None), dict(dualTargets=[[0, 0]]),
                  dict(postRotation='primal'), dict(dualEdgeFlips=[]), dict(paper={'shape': 'square', 'margin': .1}),
                  dict(motherParams={**base['motherParams'], 'repeatX': 2}),
                  dict(motherParams={**base['motherParams'], 'lattice': [[1, 0], [0, 1]]})]
        for change in edits:
            with self.assertRaises(ValueError):validate_request({**base, **change})
        for row in FIXTURE['legacyCases']:
            self.assertNotIn('reciprocalMethod', validate_request(row['params']))

    def test_real_cp_ff_all_face_pairs_and_full_response_reproduce(self):
        for row in FIXTURE['cases']:
            with self.subTest(name=row['name']), patch('time.perf_counter', return_value=0):
                result = json.loads(json.dumps(generate(row['params'])))
                self.assertEqual(result, row['response'])
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
                self.assertEqual(result['stats']['checks']['lff']['status'], 'passed')
                cp, ff = result['fold']['vertices_coords'], result['source']['foldedForm']
                with localcontext() as context:
                    context.prec = 60
                    def length(a, b):return sum((Decimal(str(x))-Decimal(str(y)))**2 for x, y in zip(a, b)).sqrt()
                    for face in result['fold']['faces_vertices']:
                        for i, a in enumerate(face):
                            for b in face[i+1:]:self.assertLess(abs(length(cp[a], cp[b])-length(ff[a], ff[b])), Decimal('1e-8'))

    def test_new_objective_changes_real_geometry_and_old_responses_stay_exact(self):
        four = FIXTURE['cases'][1]['response']
        old = FIXTURE['legacyCases'][2]['response']
        self.assertNotEqual(four['dual'], old['dual'])
        self.assertNotEqual(four['fold'], old['fold'])
        self.assertEqual(four['source']['reciprocalMinTotalPleat']['totalNormalizedPleat'], 4)
        self.assertEqual(four['source']['reciprocalMinTotalPleat']['fit']['scale'], 1.5)
        for row in FIXTURE['legacyCases']:
            with patch('time.perf_counter', return_value=0):
                self.assertEqual(json.loads(json.dumps(generate(row['params']))), row['response'])


if __name__ == '__main__':unittest.main()
