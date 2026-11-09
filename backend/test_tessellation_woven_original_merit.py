import json
import unittest
from pathlib import Path
from unittest.mock import patch
import math
import numpy as np

from tessellation_woven import validate_woven, woven_pattern, _topology
from tessellation_woven_graph import woven_graph_data
from tessellation_woven_merit import ReflectionSystem, MeritBudget, MeritBudgetExceeded, solve_merit
from tessellate import generate


class WovenOriginalMeritTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture=Path(__file__).parents[1]/'tests/fixtures/woven-original-boundaries-20261001.json'
        cls.case=next(c for c in json.loads(fixture.read_text(encoding='utf-8'))['cases'] if c['name']=='internal-diagonal')

    def test_parameter_is_explicit_and_round_trips(self):
        params=dict(self.case['params'],optimization='origamica-merit')
        self.assertEqual(validate_woven(params)['optimization'],'origamica-merit')
        with self.assertRaisesRegex(ValueError,'优化方式'):
            validate_woven(dict(self.case['params'],optimization='unknown'))

    def test_original_merit_starts_at_lower_bounds_and_keeps_cp_valid(self):
        p=dict(self.case['params'],optimization='origamica-merit')
        data=woven_graph_data(p['graph'],p['width']/2,p.get('graphSource'))
        fold,flat,source=woven_pattern(data,p['parity'],p['minPleat'],p['minBorderPleat'],p['width']/2,p['stationaryFace'],optimization=p['optimization'])
        self.assertEqual(source['optimization'],'origamica-merit')
        self.assertLess(source['merit'],1e-4)
        self.assertEqual(source['pleatFactors'],[p['minBorderPleat']]*4)
        self.assertEqual(source['merit'],4*p['minBorderPleat']**2)
        report=source['meritReport']
        self.assertEqual(report['certificate'],'feasible-lower-bound')
        self.assertEqual(report['lowerBounds'],source['pleatFactors'])
        self.assertEqual(report['kktResidual'],0)
        self.assertEqual(report['iterations'],0)
        self.assertFalse(report['wolframExecuted'])
        self.assertLess(source['closureError'],2e-6)
        self.assertEqual(len(fold['vertices_coords']),len(flat))

    def test_original_merit_rejects_a_pair_without_geometric_internal_far_edges(self):
        p=dict(self.case['params'],optimization='origamica-merit',periodicity=[[0,1]])
        data=woven_graph_data(p['graph'],p['width']/2,p.get('graphSource'))
        with self.assertRaisesRegex(ValueError,'原周期'):
            woven_pattern(data,p['parity'],p['minPleat'],p['minBorderPleat'],0,p['stationaryFace'],p['periodicity'],optimization=p['optimization'])

    def test_reflection_equations_and_analytic_jacobian_match_independent_angles(self):
        fixture=Path(__file__).parents[1]/'tests/fixtures/woven-concave-cells-20261001.json'
        p=json.loads(fixture.read_text(encoding='utf-8'))['cases'][0]['params']
        graph=_topology(woven_graph_data(p['graph'],p['width']/2),p['parity'],p['width']/2)
        system=ReflectionSystem(graph['base'],graph['directions'],graph['variable'],graph['cycles'],MeritBudget())
        x=np.array([.22 if b else .41 for b in graph['boundaryVariable']])
        value,jacobian=system.evaluate(x)
        def independent(x):
            points=system.positions(x);out=[]
            for center,*ns in graph['cycles']:
                angles=[math.atan2(*(points[n]-points[center])[::-1]) for n in ns]
                out.append(math.sin(angles[0]-angles[1]+angles[2]-angles[3]))
            return np.array(out)
        np.testing.assert_allclose(value,independent(x),atol=1e-14)
        for i in range(len(x)):
            plus=x.copy();minus=x.copy();plus[i]+=1e-6;minus[i]-=1e-6
            np.testing.assert_allclose(jacobian[:,i],(independent(plus)-independent(minus))/2e-6,atol=1e-8)

    def test_degenerate_ray_is_rejected_instead_of_clamped_to_zero(self):
        system=ReflectionSystem(np.zeros((5,2)),np.zeros((5,2)),np.full(5,-1),np.array([[0,1,2,3,4]]),MeritBudget())
        with self.assertRaisesRegex(ValueError,'退化'):
            system.evaluate(np.array([]))
        for lower in (np.array([-.1]),np.array([np.inf]),np.array([np.nan])):
            with self.assertRaisesRegex(ValueError,'有限正下界'):
                solve_merit({},lower,MeritBudget())

    def test_budget_exhaustion_is_not_retried_or_reported_as_no_solution(self):
        with patch('tessellation_woven.MeritBudget',lambda:MeritBudget(max_evaluations=0)):
            with self.assertRaisesRegex(MeritBudgetExceeded,'预算已用尽.*不构成数学无解'):
                generate(dict(self.case['params'],optimization='origamica-merit'))
        with self.assertRaises(MeritBudgetExceeded):MeritBudget(max_seconds=-1).spend()

    def test_numerical_and_newly_supported_concave_branch_keep_source_geometry(self):
        fixture=Path(__file__).parents[1]/'tests/fixtures/woven-original-boundaries-20261001.json'
        cases=json.loads(fixture.read_text(encoding='utf-8'))['cases']
        for name in ('difficult-convex-four-face','concave-six-face','concave-six-face-other-radius'):
            p=next(c['params'] for c in cases if c['name']==name)
            r=generate(dict(p,optimization='origamica-merit'));q=r['source']['meritReport']
            self.assertEqual(r['source']['graph'],p['graph'])
            self.assertEqual(q['certificate'],'local-numerical-candidate')
            self.assertTrue(q['noArtificialUpperBound'])
            self.assertLess(q['maximumResidual'],1e-7)
            self.assertAlmostEqual(q['merit'],sum(x*x for x in r['source']['pleatFactors']),places=9)
            self.assertLessEqual(q['evaluationCount'],q['evaluationBudget'])
            self.assertGreaterEqual(min(x-y for x,y in zip(r['source']['pleatFactors'],q['lowerBounds'])),0)
            self.assertEqual(r['stats']['checks']['geometry']['status'],'passed')
            for face in r['fold']['faces_vertices']:
                for a in face:
                    for b in face:
                        self.assertLess(abs(math.dist(r['fold']['vertices_coords'][a],r['fold']['vertices_coords'][b])-math.dist(r['source']['foldedForm'][a],r['source']['foldedForm'][b])),2e-6)

    def test_legacy_geometry_and_source_are_unchanged(self):
        fixture=Path(__file__).parents[1]/'tests/fixtures/woven-original-boundaries-20261001.json'
        for c in json.loads(fixture.read_text(encoding='utf-8'))['cases']:
            for key in ('fold','source','mother'):
                self.assertEqual(json.loads(json.dumps(generate(c['params'])[key])),c['response'][key])


if __name__=='__main__':
    unittest.main()
