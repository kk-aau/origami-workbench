"""Exact remaining executed P43 pot inputs In[3483]/[3489–3494]/[3506]."""

import math
import unittest

from tessellate import generate


FIVE_UP = [[.5*math.sin(math.pi*i/6), 1-math.cos(math.pi*i/6)]
           for i in range(5)]
FIVE_DOWN = [[.5*math.sin(math.pi*i/4), math.cos(math.pi*i/4)-1]
             for i in range(5)]
LONG = [[0,0],[1,1],[1,2],[1,3],[2,4]]
SHIFT = [[.3,0],[1,1],[1,2],[1,3],[2,4]]
RECT = {'family':'rectangular-pot','sectors':8,'panels':1,'asymmetry':0,
        'gapHalfAngleDeg':0,'flangeExcess':0,'typeMinimumAngleDeg':10}
SAVED = {
  3483: ({'family':'radial-pot','crossSection':FIVE_UP,'sectors':5,
          'asymmetry':-1,'gapHalfAngleDeg':0,'typeMinimumAngleDeg':0,
          'border':'planar','flatFlangeInset':.1}, (81,160,80)),
  3489: ({**RECT,'crossSection':SHIFT,'flangeExcess':.1}, (30,49,20)),
  3490: ({**RECT,'crossSection':SHIFT,'asymmetry':1,'flangeExcess':.1,
          'flatFlangeInset':.05}, (25,40,16)),
  3491: ({**RECT,'crossSection':LONG,'gapHalfAngleDeg':3,
          'flangeExcess':.3}, (28,47,20)),
  3492: ({**RECT,'crossSection':[[0,-1],[1,-1],[1,-2],[1,-3],[2,-4]],
          'asymmetry':-1}, (21,36,16)),
  3493: ({**RECT,'crossSection':[[0,0],[1,1],[1,2],[2,3]],
          'asymmetry':.5}, (19,33,15)),
  3494: ({**RECT,'crossSection':FIVE_DOWN,'sectors':5,
          'gapHalfAngleDeg':4,'flangeExcess':.5}, (26,45,20)),
  3506: ({**RECT,'crossSection':FIVE_UP,'panels':7,'asymmetry':-1,
          'typeMinimumAngleDeg':0,'flatFlangeInset':.1}, (117,228,112)),
}


class RemainingSavedPotsTests(unittest.TestCase):
    def test_saved_inputs_are_real_single_paper_static_spatial_candidates(self):
        for cell, (query, expected) in SAVED.items():
            with self.subTest(cell=cell):
                result=generate(query)
                fold,source=result['fold'],result['source']
                self.assertEqual((result['stats']['vertices'],result['stats']['edges'],
                                  result['stats']['faces']),expected)
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertTrue(source['staticGlobalIsometryChecked'])
                self.assertFalse(source['continuousRigidPathChecked'])
                self.assertFalse(source['selfCollisionChecked'])
                self.assertEqual(len(fold['vertices_coords']),len(source['foldedForm3D']))
                self.assertLess(source['maximumFaceDistanceError'],1e-10)
                self.assertLess(source['maximumFacePlaneError'],1e-10)
                self.assertEqual(result['stats']['vertices']-result['stats']['edges']+
                                 result['stats']['faces'],1)
                if cell in (3483,3490,3506):
                    self.assertEqual(source['flatFlangeDisplay']['fraction'],
                                     query['flatFlangeInset'])
                    self.assertTrue(source['flatFlangeDisplay']['displayOnly'])
                if 3489 <= cell <= 3494:
                    self.assertEqual(result['stats']['tiles'],1)
                if cell == 3506:
                    self.assertEqual(result['stats']['tiles'],7)

    def test_in3494_join_rows_follow_original_a_and_f_boundary_semantics(self):
        query=SAVED[3494][0]
        result=generate(query)
        rows=result['source']['wedgeJoinVertices0Based']
        flat=result['fold']['vertices_coords']
        spatial=result['source']['foldedForm3D']
        self.assertEqual((len(rows),len(rows[0]),len(rows[1])),(2,5,5))
        self.assertEqual(len(set(rows[0]+rows[1])),10)
        for level, (a,f) in enumerate(zip(*rows)):
            self.assertAlmostEqual(flat[a][0],flat[f][0],12)
            self.assertAlmostEqual(spatial[a][2],spatial[f][2],12)
            self.assertAlmostEqual(spatial[a][2],query['crossSection'][level][1],12)

    def test_in3506_inset_is_display_only_and_in3492_height_shift_is_source_semantics(self):
        query=SAVED[3506][0]
        displayed=generate(query)
        raw=generate({key:value for key,value in query.items()
                      if key!='flatFlangeInset'})
        self.assertEqual(displayed['fold'],raw['fold'])
        self.assertEqual(displayed['source']['foldedForm3D'],
                         raw['source']['foldedForm3D'])
        shifted=generate(SAVED[3492][0])
        self.assertEqual(shifted['stats']['parameters']['crossSection'][0],[0.,0.])
        self.assertEqual(shifted['stats']['parameters']['crossSection'][-1],[2.,-3.])


if __name__=='__main__':
    unittest.main()
