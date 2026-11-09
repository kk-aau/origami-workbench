import unittest
from collections import Counter
from tessellate import generate, validate_request
import test_tessellation as basic


class SplitTwistTests(unittest.TestCase):
    def test_analytic_constraint_jacobians_match_numerical_derivatives(self):
        import numpy as np
        from unittest.mock import patch
        from scipy.optimize import minimize
        import tessellation_split
        checked=[]
        def verify(fun,initial,**kwargs):
            initial=np.array(initial,dtype=float);step=1e-6
            for constraint in kwargs['constraints']:
                numeric=np.column_stack([(constraint['fun'](initial+np.eye(10)[i]*step)-constraint['fun'](initial-np.eye(10)[i]*step))/(2*step) for i in range(10)])
                np.testing.assert_allclose(constraint['jac'](initial),numeric,atol=1e-6,rtol=1e-5)
                checked.append(constraint['type'])
            return minimize(fun,initial,**kwargs)
        with patch.object(tessellation_split,'minimize',side_effect=verify):
            result=generate({'family':'twist','mode':'quad-split','sides':4,'angle':36,'pleatWidth':.3})
        self.assertIn('eq',checked);self.assertIn('ineq',checked)
        basic.TessellationTests.assert_candidate(self,result)

    def test_split_topology_both_handedness_and_all_base_vertices(self):
        for vertex in range(4):
            for sign in (-1,1):
                with self.subTest(vertex=vertex,sign=sign):
                    result=generate({'family':'twist','mode':'quad-split','sides':4,'angle':sign*36,'splitVertex':vertex})
                    basic.TessellationTests.assert_candidate(self,result)
                    f=result['fold'];border={v for e,a in zip(f['edges_vertices'],f['edges_assignment']) if a=='B' for v in e}
                    degrees=Counter(v for e in f['edges_vertices'] for v in e)
                    self.assertEqual(sorted(d for v,d in degrees.items() if v not in border),[4,4,4,4,6])
                    self.assertEqual(result['source']['baseVertex'],vertex)
                    self.assertLess(result['source']['maxResidual'],1e-7)

    def test_connection_assignment_changes_without_changing_geometry(self):
        params={'family':'twist','mode':'quad-split','sides':4,'angle':24,'pleatWidth':.3}
        a=generate({**params,'connection':'M'});b=generate({**params,'connection':'V'})
        for r in (a,b):basic.TessellationTests.assert_candidate(self,r)
        self.assertEqual(a['fold']['vertices_coords'],b['fold']['vertices_coords'])
        self.assertNotEqual(a['fold']['edges_assignment'],b['fold']['edges_assignment'])

    def test_custom_quad_and_reproducibility(self):
        params={'family':'twist','mode':'quad-split','sides':4,'polygon':[[-1,-1],[1,-1],[.75,1],[-1,.6]],'angle':36,'scale':.4}
        a=generate(params);basic.TessellationTests.assert_candidate(self,a)
        self.assertEqual(a['fold'],generate(params)['fold'])
        p=params['polygon']
        self.assertEqual(a['fold'],generate({**params,'polygon':[p[0],*p[:0:-1]]})['fold'])

    def test_split_input_is_bounded_and_cannot_silently_become_mirror_repeat(self):
        valid={'family':'twist','mode':'quad-split','sides':4}
        for patch in ({'sides':5},{'splitVertex':4},{'splitVertex':True},{'pleatWidth':.9},{'connection':'U'},{'splitCount':2},{'offsetX':.1},{'mode':'unknown'}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({**valid,**patch})
        with self.assertRaises(ValueError):validate_request({'family':'twist','connection':'M'})

    def test_resch_star_tip_angles_and_expansion(self):
        for order in (3,4,6):
            for tip in (10,40,55):
                with self.subTest(order=order,tip=tip):
                    r=generate({'family':'archimedean','tiling':f'resch-{order}','starAngle':tip,'rings':2})
                    basic.TessellationTests.assert_candidate(self,r)
                    self.assertEqual(r['source']['starTipAngle'],tip)
        with self.assertRaises(ValueError):validate_request({'family':'archimedean','starAngle':40})
        with self.assertRaises(ValueError):validate_request({'family':'archimedean','tiling':'resch-3','starAngle':60})


if __name__=='__main__':unittest.main()
