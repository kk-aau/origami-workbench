"""In[3456] real elliptic branch and In[3481]/In[3482] saved radial pots."""

import math
import unittest

from tessellate import generate
from tessellation_mosely_bud import mosely_bud_point, saved_mosely_bud_section
from tessellation_radial_pot import validate_radial_pot


class MoselyBudTests(unittest.TestCase):
    def test_real_branch_matches_high_precision_notebook_elliptic_expression(self):
        # Independent 50-digit principal-branch mpmath transcription of
        # In[3456]; see output/experiments/p43_mosely_bud_branch_probe.py.
        anchors = {
            0: (0., 0.),
            .05: (.04543560573178572, .01967431110573931),
            .25: (.1614378277661476, .1793685864492643),
            .5: (.2071067811865475, .4236065423969895),
            .75: (.1614378277661476, .6678444983447148),
            .95: (.04543560573178572, .8275387736882398),
            1: (0., .8472130847939791),
        }
        for r, expected in anchors.items():
            with self.subTest(r=r):
                actual = mosely_bud_point(r)
                for value, target in zip(actual, expected):
                    self.assertLess(abs(value-target), 2e-11)
        for invalid in (-.01, 1.01, float('nan'), '0.5', True):
            with self.assertRaises(ValueError):
                mosely_bud_point(invalid)

    def test_saved_21_point_profile_and_both_pots_pass_static_certification(self):
        section = saved_mosely_bud_section()
        self.assertEqual(len(section), 21)
        self.assertAlmostEqual(section[0][1], 0)
        self.assertAlmostEqual(section[-1][0], 0)
        self.assertAlmostEqual(section[-1][1], -.8472130847939791, 11)
        self.assertTrue(all(b[1] < a[1] for a, b in zip(section, section[1:])))
        for rho in (0, .3333):
            with self.subTest(rho=rho):
                query={'family':'radial-pot', 'crossSection':section,
                       'sectors':4, 'asymmetry':rho, 'gapHalfAngleDeg':0,
                       'typeMinimumAngleDeg':30, 'border':'planar'}
                result=generate(query)
                fold,source=result['fold'],result['source']
                self.assertEqual((result['stats']['vertices'],result['stats']['edges'],
                                  result['stats']['faces']),(393,792,400))
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertTrue(source['staticGlobalIsometryChecked'])
                self.assertFalse(source['continuousRigidPathChecked'])
                self.assertFalse(source['selfCollisionChecked'])
                self.assertEqual(len(fold['vertices_coords']),len(source['foldedForm3D']))
                error=max(abs(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b])-
                              math.dist(source['foldedForm3D'][a],source['foldedForm3D'][b]))
                    for face in fold['faces_vertices'] for i,a in enumerate(face)
                    for b in face[i+1:])
                self.assertLess(error,1e-10)
                self.assertLess(source['maximumFacePlaneError'],1e-10)

    def test_24_point_capacity_preserves_budget_and_old_domain(self):
        saved=saved_mosely_bud_section()
        query={'family':'radial-pot','crossSection':saved,'sectors':4,
               'asymmetry':0,'gapHalfAngleDeg':0,'typeMinimumAngleDeg':30,
               'border':'planar'}
        section24=[[x,-z] for x,z in
                   (mosely_bud_point(i/23) for i in range(24))]
        self.assertEqual(len(validate_radial_pot({**query,'crossSection':section24})['crossSection']),24)
        self.assertEqual(generate({**query,'crossSection':section24})['stats']['faces'],460)
        self.assertEqual(generate({**query,'crossSection':saved[:12]})['stats']['faces'],220)
        with self.assertRaisesRegex(ValueError,'3–24'):
            validate_radial_pot({**query,'crossSection':section24+[[0,-1]]})
        with self.assertRaisesRegex(ValueError,'600'):
            validate_radial_pot({**query,'crossSection':section24,'sectors':6})


if __name__=='__main__':
    unittest.main()
