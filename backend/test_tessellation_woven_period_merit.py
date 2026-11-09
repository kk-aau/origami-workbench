"""Literal In[3428] periodic mapping, area, Drop, solve and strict gates."""
import json,math,unittest
from pathlib import Path
import numpy as np
from tessellate import generate,check_geometry,check_local_conditions
from tessellation_line_groups import arrangement
from tessellation_woven import BOX,_topology,woven_pattern
from tessellation_woven_period import original_period_records,period_values_jacobian
from tessellation_woven_merit import ReflectionSystem,MeritBudget,kkt_residual

PAIRS=[[0,13],[4,14],[7,2],[11,8]]
def setup():
    data=arrangement([[0,-.4,.08],[0,.4,.08],[90,-.4,.08],[90,.4,.08]],BOX)
    graph=_topology(data,1,0)
    return data,graph,original_period_records(data,graph,PAIRS)

class WovenPeriodicMeritTests(unittest.TestCase):
    def test_source_pair_order_positive_then_negative_and_geometric_far_edges(self):
        data,graph,records=setup()
        expected=[([0,37],[5,39]),([8,40],[10,45]),([13,46],[15,51]),([6,42],[11,44]),
                  ([16,3],[15,5]),([31,18],[33,23]),([49,34],[51,39]),([29,20],[28,22])]
        self.assertEqual([(r['corners'],r['far']) for r in records],expected)
        self.assertEqual([r['color'] for r in records],[1,-1]*4)
        self.assertEqual([r['mother'] for r in records],[p for p in PAIRS for _ in (1,-1)])
        # BoundaryEdges is geometric incidence; changing labels cannot alter it.
        changed=dict(graph,assignments=['B']*len(graph['edges']))
        self.assertEqual(original_period_records(data,changed,PAIRS),records)
        reverse=original_period_records(data,graph,PAIRS[::-1])
        self.assertEqual(reverse[:2],records[-2:])

    def test_raw_triangle_area_is_not_the_compatibility_parallel_tangent_test(self):
        points=np.array([[0.,0.],[3.,0.],[1.,1.],[4.,1.]])
        record=dict(corners=[0,1],far=[2,3],delta=[2.,0.])
        values,_=period_values_jacobian(points,np.zeros_like(points),np.full(4,-1),[record],1)
        self.assertEqual(values.tolist(),[0.,.5])
        u=points[2]-points[0];v=points[3]-points[1]
        self.assertEqual(u[0]*v[1]-u[1]*v[0],0)

    def test_literal_scalar_formula_and_jacobian_for_every_pair_and_variable(self):
        _,g,records=setup();nv=len(g['boundaryVariable']);x=np.linspace(.3,1.8,nv)
        def points(x):
            factors=np.zeros(len(g['base']));valid=g['variable']>=0
            factors[valid]=x[g['variable'][valid]]
            return g['base']+factors[:,None]*g['directions']
        def independent(x):
            p=points(x);out=[]
            for r in records:
                a,b=r['corners'];c,d=r['far'];dx,dy=r['delta']
                out.append(-(p[b,0]-p[a,0]-dx)*dy+(p[b,1]-p[a,1]-dy)*dx)
                tx,ty=p[c,0]+dx,p[c,1]+dy
                out.append(((p[b,0]-tx)*(p[d,1]-ty)-(p[b,1]-ty)*(p[d,0]-tx))/2)
            return np.asarray(out)
        values,jac=period_values_jacobian(points(x),g['directions'],g['variable'],records,nv)
        np.testing.assert_allclose(values,independent(x),atol=1e-15)
        for i in range(nv):
            a=x.copy();b=x.copy();a[i]+=1e-6;b[i]-=1e-6
            np.testing.assert_allclose(jac[:,i],(independent(a)-independent(b))/2e-6,atol=1e-9)

    def test_drop_removes_only_last_area_after_all_colors_are_flattened(self):
        p=np.array([[0,0],[2,0],[1,0],[3,0],[0,1],[2,1],[1,0],[3,2]],dtype=float)
        records=[dict(corners=[0,1],far=[2,3],delta=[2,0]),dict(corners=[4,5],far=[6,7],delta=[2,0])]
        system=ReflectionSystem(p,np.zeros_like(p),np.full(8,-1),np.empty((0,5),dtype=int),MeritBudget(),records)
        raw,_=period_values_jacobian(p,np.zeros_like(p),np.full(8,-1),records,1)
        self.assertEqual(raw.tolist(),[0,0,0,-1])
        values,jac=system.evaluate(np.array([1.]))
        self.assertEqual(values.tolist(),[0,0,0]);self.assertEqual(jac.shape,(3,1))

    def test_actual_periodic_solution_preserves_indices_isometry_and_all_active_equations(self):
        data,_,_=setup()
        fold,ff,source=woven_pattern(data,periodicity=PAIRS,optimization='origamica-merit')
        q=source['meritReport']
        self.assertEqual(q['periodicEquationCount'],15)
        self.assertEqual(q['droppedPeriodicEquation'],15)
        self.assertEqual(len(q['periodicRawResiduals']),16)
        self.assertLess(max(abs(v) for v in q['periodicRawResiduals'][:-1]),1e-7)
        self.assertLess(q['kktResidual'],1e-7)
        self.assertEqual(q['periodicContract'],'ordered-perconds-drop-last-v1')
        self.assertEqual(len(source['periodVectors']),2)
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertEqual(check_local_conditions(fold)['status'],'passed')
        for face in fold['faces_vertices']:
            for a in face:
                for b in face:
                    self.assertLess(abs(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b])-math.dist(ff[a],ff[b])),1e-7)

    def test_nonunique_multipliers_do_not_create_a_false_large_kkt_error(self):
        x=np.array([1.,2.]);lower=np.array([1.,1.]);jac=np.array([[1.,1.],[10.,1.]])
        residual,active=kkt_residual(x,lower,jac,MeritBudget())
        self.assertEqual(active.tolist(),[True,False]);self.assertLess(residual,1e-9)
        # A true feasible descent exists along (+1,-1) in this second system.
        residual,_=kkt_residual(x,lower,np.array([[1.,1.]]),MeritBudget())
        self.assertGreater(residual,.5)

    def test_bad_pairs_fail_before_numerical_solve_and_duplicate_order_is_preserved(self):
        data,g,_=setup()
        for pairs in ([[0,0]],[[0,100]],[[False,1]],[[1.2,1]]):
            with self.assertRaisesRegex(ValueError,'有效母结构顶点'):original_period_records(data,g,pairs)
        records=original_period_records(data,g,PAIRS+PAIRS[-1:])
        self.assertEqual(len(records),10);self.assertEqual(records[-2:],records[-4:-2])
        with self.assertRaisesRegex(ValueError,'周期展开后的边界尚未吻合'):
            woven_pattern(data,periodicity=PAIRS[:1],optimization='origamica-merit')

    def test_legacy_periodic_result_unchanged_against_saved_batch_baseline(self):
        fixture=Path(__file__).parents[1]/'tests/fixtures/woven-period-merit-20261007.json'
        for c in json.loads(fixture.read_text(encoding='utf-8'))['legacy']:
            result=generate(c['params'])
            for key in ('fold','source','mother'):self.assertEqual(json.loads(json.dumps(result[key])),c['response'][key])

if __name__=='__main__':unittest.main()
