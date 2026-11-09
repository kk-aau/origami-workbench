"""Inverse-unfolded weaves cannot use the retired grid padding shortcut."""
import unittest
from unittest.mock import patch
from tessellate import generate

class WovenPaperTests(unittest.TestCase):
    def test_independent_paper_rejected_before_any_nonlinear_solve(self):
        for weave in ('plain','basket','twill'):
            for paper in ({'shape':'square','margin':.1},
                          {'shape':'rectangle','aspect':1.5,'margin':.1},
                          {'shape':'regular','sides':3,'margin':.1}):
                with self.subTest(weave=weave,paper=paper):
                    with patch('tessellation_box_woven.construct_box_woven',side_effect=AssertionError('must not solve')):
                        with self.assertRaisesRegex(ValueError,'盒褶编织.*沿用原边界'):
                            generate(dict(family='woven',weave=weave,paper=paper))

if __name__=='__main__':unittest.main()
