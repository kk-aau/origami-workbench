import copy,json,math,unittest
from pathlib import Path
import numpy as np
from types import SimpleNamespace
from tessellate import generate
from tessellation_woven import _topology,_face_winding,_unfold
from tessellation_woven_graph import woven_graph_data
from tessellation_woven_holonomy import UnfoldClosureSystem
from tessellation_woven_merit import MeritBudget,MeritBudgetExceeded,ReflectionSystem,solve_merit

SAVED=json.loads((Path(__file__).parents[1]/'tests/fixtures/woven-mother-holes-1008.json').read_text(encoding='utf8'))

def setup(params=None):
    p=copy.deepcopy(params or SAVED['params']);p['optimization']='origamica-merit'
    data=woven_graph_data(p['graph'],p['width']/2);g=_topology(data,p['parity'],p['width']/2)
    lower=np.array([p['minBorderPleat'] if b else p['minPleat'] for b in g['boundaryVariable']]);n=len(lower)
    def positions(x):
        f=np.zeros(len(g['base']));mask=g['variable']>=0;f[mask]=x[g['variable'][mask]];return g['base']+g['directions']*f[:,None]
    roots=[g['mainFaces'][p['stationaryFace']]]+[g['mainFaces'][fs[0]] for fs in data.get('motherComponentFaces',[]) if p['stationaryFace'] not in fs]
    scale=np.ptp(np.array(p['graph']['vertices']),axis=0).max()
    closure=UnfoldClosureSystem(g,roots,scale,positions(lower),_face_winding)
    return p,g,lower,positions,roots,scale,closure

class WovenHoleMeritTests(unittest.TestCase):
    def test_full_holonomy_and_analytic_jacobian_match_independent_unfold(self):
        p=copy.deepcopy(SAVED['params']);p['graph']['vertices'][0][0]=-2.01
        p,g,lower,positions,roots,scale,closure=setup(p);x=np.linspace(.1,.25,len(lower))
        value,jac=closure.evaluate(x);np.testing.assert_allclose(value,_unfold(positions(x),g['edges'],g['faces'],roots[0],roots[1:],return_residuals=True)/scale,atol=1e-14)
        for k in range(len(x)):
            plus=x.copy();minus=x.copy();plus[k]+=1e-5;minus[k]-=1e-5
            independent=lambda v:_unfold(positions(v),g['edges'],g['faces'],roots[0],roots[1:],return_residuals=True)/scale
            np.testing.assert_allclose(jac[:,k],(independent(plus)-independent(minus))/2e-5,atol=2e-9)

    def test_asymmetric_hole_original_objective_has_global_constraints_and_real_cp(self):
        p=copy.deepcopy(SAVED['params']);p['graph']['vertices'][0][0]=-2.01;p['optimization']='origamica-merit'
        r=generate(p);q=r['source']['meritReport'];self.assertEqual(q['certificate'],'local-numerical-candidate');self.assertEqual(q['holeClosureEquationCount'],64)
        self.assertEqual(q['equalityEquationCount'],64);self.assertEqual(q['independentEquationCount'],3);self.assertEqual(len(set(q['equalityRowIndices'])),3)
        self.assertLess(q['holeClosureMaximumResidual'],1e-7);self.assertLess(r['source']['closureError'],1e-8);self.assertLess(q['kktResidual'],1e-6)
        self.assertEqual(r['source']['graph'],p['graph']);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed')
        self.assertAlmostEqual(q['merit'],sum(v*v for v in r['source']['pleatFactors']),places=12)
        for face in r['fold']['faces_vertices']:
            for a in face:
                for b in face:self.assertLess(abs(math.dist(r['fold']['vertices_coords'][a],r['fold']['vertices_coords'][b])-math.dist(r['source']['foldedForm'][a],r['source']['foldedForm'][b])),1e-8)

    def test_symmetric_hole_exact_lower_certificate_checks_all_closure_rows(self):
        p=dict(SAVED['params'],optimization='origamica-merit');r=generate(p);q=r['source']['meritReport']
        self.assertEqual(q['certificate'],'feasible-lower-bound');self.assertEqual(q['iterations'],0);self.assertEqual(r['source']['pleatFactors'],q['lowerBounds']);self.assertLess(q['holeClosureMaximumResidual'],1e-12)

    def test_similarity_does_not_rescale_factors_or_raw_normalized_closure(self):
        p=copy.deepcopy(SAVED['params']);p['graph']['vertices'][0][0]=-2.01
        a=setup(p);q=copy.deepcopy(p);q['graph']['vertices']=[[x*3+50,y*3-70] for x,y in q['graph']['vertices']];q['width']*=3;b=setup(q)
        x=np.linspace(.1,.25,len(a[2]));va,ja=a[-1].evaluate(x);vb,jb=b[-1].evaluate(x)
        np.testing.assert_allclose(va,vb,atol=2e-14);np.testing.assert_allclose(ja,jb,atol=2e-14)

    def test_multiple_independent_holes_keep_all_closure_rows_and_original_roots(self):
        p=copy.deepcopy(SAVED['params']);g=p['graph'];g['vertices'][0][0]=-2.01;n=len(g['vertices']);g['vertices'] += [[x+6,y] for x,y in g['vertices'][:n]];g['edges'] += [[a+n,b+n] for a,b in g['edges'].copy()];g['holeFaces']=[4,9];p['optimization']='origamica-merit'
        r=generate(p);q=r['source']['meritReport'];self.assertEqual(q['holeClosureEquationCount'],128);self.assertEqual(q['independentEquationCount'],6);self.assertLess(r['source']['closureError'],1e-8);self.assertEqual(len(r['source']['wovenIndependentMother']['foldRoots']),2)

    def test_capacity_budget_and_wrong_winding_branch_are_explicitly_rejected(self):
        _,g,lower,positions,roots,scale,closure=setup()
        with self.assertRaises(MeritBudgetExceeded):solve_merit(g,lower,MeritBudget(max_evaluations=0),closure_system=closure)
        with self.assertRaisesRegex(MeritBudgetExceeded,'512'):solve_merit(g,lower,MeritBudget(),closure_system=SimpleNamespace(row_count=513))
        closure.branch[0]*=-1
        with self.assertRaisesRegex(ValueError,'绕数分支'):closure.evaluate(lower)

if __name__=='__main__':unittest.main()
