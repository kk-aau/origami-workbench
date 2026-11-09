import copy,math,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from tessellation_curved_generic_across_query import PRESET,AcrossError,query_curved_generic_across_right,validate_curved_generic_across_query

class GenericAcrossTests(unittest.TestCase):
 def query(self,**kwargs):return query_curved_generic_across_right({**copy.deepcopy(PRESET),**kwargs})
 def test_three_original_modes_and_sample_metadata(self):
  for mode in ('2d','3d','both'):
   r=self.query(mode=mode,parameterEnd=.21,segments=8,rulingSegments=3)
   self.assertEqual(len(r['sample']['rows']),9);self.assertEqual(len(r['sample']['grid'][0]),8)
   self.assertEqual(r['sample']['rows'][0]['flat'] is None,mode=='3d')
   self.assertEqual(r['sample']['rows'][0]['space'] is None,mode=='2d')
   self.assertTrue(r['diagnostics']['parameterDomain']['certified'])
   self.assertFalse(r['certification']['fullIntervalPairIsometryCertified'])
 def test_nonunit_left_is_returned_without_normalization(self):
  r=self.query(flatLeftRuling=['0','2'],spaceLeftRuling=['0','2','0'],parameterEnd=.21)
  self.assertEqual(r['sample']['rows'][0]['flat']['rL'],[0.,2.]);self.assertEqual(r['sample']['rows'][0]['space']['rL'],[0.,2.,0.])
  self.assertTrue(r['certification']['finitePairMetricVerified'])
 def test_mismatch_and_non_developable_left_are_real_readonly(self):
  for change in ({'flatLeftRuling':['0','2']},{'flatLeftRuling':['0','-1'],'spaceLeftRuling':['0','-1','0']}):
   r=self.query(**change,parameterEnd=.3);self.assertFalse(r['certification']['finitePairMetricVerified']);self.assertEqual(r['diagnostics']['pairStatus'],'incompatible')
   self.assertIsNotNone(r['sample']['rows'][0]['space'])
  r=self.query(spaceLeftRuling=['0','1','0.1*s'],parameterEnd=.3)
  self.assertFalse(r['certification']['leftInputDevelopabilityVerifiedAtNodes'])
 def test_unknown_keeps_complete_source_domain_and_both_bands(self):
  r=self.query();self.assertFalse(r['diagnostics']['parameterDomain']['certified'])
  self.assertEqual(r['query'],PRESET);self.assertEqual(r['sample']['rows'][-1]['s'],1.)
  self.assertEqual(r['sample']['grid'][-1][-1]['v'],.15);self.assertIsNone(r['diagnostics']['parameterDomain']['minimumBranchSelectorLowerBound'])
 def test_inactive_sources_are_syntax_checked_but_not_evaluated(self):
  r=self.query(mode='2d',spaceCurve=['1/(s-s)','Sqrt[-1]','Log[-1]'],spaceLeftRuling=['0','0','0'],parameterEnd=.3)
  self.assertIsNone(r['sample']['rows'][0]['space'])
  with self.assertRaises(ValueError):validate_curved_generic_across_query({**PRESET,'spaceCurve':['eval(s)','s','s']})
 def test_actual_singular_sources_and_band_focus_rejected(self):
  for changes in ({'mode':'2d','foldAngleExpression':'0'}, {'mode':'2d','flatCurve':['s','0']},
                  {'spaceLeftRuling':['Cos[s]','s/2','Sin[s]']}, {'spaceCurve':['s','0','0']},
                  {'mode':'2d','flatCurve':['Cos[s]','Sin[s]'],'flatLeftRuling':['-Cos[s]','-Sin[s]'],'foldAngleExpression':'1','leftWidth':2}):
   with self.assertRaises((AcrossError,ValueError)):self.query(**changes)
 def test_nonfinite_and_capacity_and_exact_query(self):
  with self.assertRaises(AcrossError):self.query(spaceCurve=['Exp[9999*s]','s','s^2'])
  with self.assertRaises(AcrossError):validate_curved_generic_across_query({**PRESET,'extra':1})
  with self.assertRaises(AcrossError):self.query(leftWidth=math.nan)
 def test_nonzero_near_tangent_area_is_not_mislabelled_a_focus(self):
  r=self.query(mode='2d',flatLeftRuling=['1-s*1e-13/2','s/2+1e-13'],foldAngleExpression='1',
               leftWidth=1e-14,rightWidth=1e-14,parameterEnd=.21)
  self.assertGreater(r['diagnostics']['minimumSampleAreaRatio'],0)
  self.assertLess(r['diagnostics']['minimumSampleAreaRatio'],1e-12)
  self.assertFalse(r['diagnostics']['parameterDomain']['certified'])
 def test_exact_pi_poles_and_half_tangent_branch_crossings(self):
  for gamma in ('Pi','Pi+0*s','3*Pi','Pi+s-.2','2.8+0.6*s'):
   with self.assertRaises(AcrossError) as caught:self.query(mode='2d',foldAngleExpression=gamma)
   self.assertIn(caught.exception.code,('fold-angle-pole','fold-angle-branch'))
  # No principal-angle restriction: the original sign(gamma) is retained.
  r=self.query(mode='2d',foldAngleExpression='4',parameterEnd=.3)
  self.assertEqual(r['sample']['rows'][0]['branch']['sign'],1)

if __name__=='__main__':unittest.main()
