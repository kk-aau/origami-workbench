"""True ten-source surface-fold regressions; staged during parent batch."""
import copy,math,sys,unittest
from functools import lru_cache
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1] if Path(__file__).parent.name=='backend' else Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_fold_surface_generic import CONE_PRESET,CYLINDER_PRESET,query_fold_surface_generic
def compact(cone,**changes):return {**copy.deepcopy(CONE_PRESET if cone else CYLINDER_PRESET),'segments':8,'rulingSegments':3,**changes}
@lru_cache(None)
def default(cone,mode='raw-numerical'):return query_fold_surface_generic(compact(cone,literalMode=mode),cone)
def cone_fold(s):
 v=.5+s*s/4+math.cos(s);y=s*s/4+v
 return v,np.array([s,y]),np.array([math.sin(s),y,1-math.cos(s)])
def natural_difference(a,b):
 e,g=max(a[0],b[0]),max(a[2],b[2]);return max(abs(x-y)/max(z,np.finfo(float).tiny) for x,y,z in zip(a,b,[e,math.sqrt(e)*math.sqrt(g),g]))

class FoldSurfaceGenericTests(unittest.TestCase):
 def test_literal_cone_fraction_and_raw_numerical_directors(self):
  r=default(True)
  for row in r['sample']['rows']:
   v,f,ff=cone_fold(row['s']);self.assertAlmostEqual(row['offsetParameter'],v,14)
   np.testing.assert_allclose(row['foldFlat'],f,atol=3e-15);np.testing.assert_allclose(row['foldSpace'],ff,atol=3e-15)
   np.testing.assert_allclose(row['targetFlat']['director'],np.array([0,2])-f,atol=3e-15)
   np.testing.assert_allclose(row['targetSpace']['director'],np.array([0,1,0])-ff,atol=3e-15)
  self.assertNotAlmostEqual(np.linalg.norm(r['sample']['rows'][0]['targetFlat']['director']),1)
  self.assertTrue(r['certification']['formalTargetPairMetricCertified'])
  self.assertEqual(r['source']['selectedFunction'],'NFoldSurfaceToCone')

 def test_symbolic_mode_reproduces_original_normalize_not_numerical_raw_output(self):
  r=default(True,'normalized-symbolic')
  for a,b in zip(r['sample']['rows'],default(True)['sample']['rows']):
   for stage in ('targetFlat','targetSpace'):
    raw=np.array(b[stage]['director']);np.testing.assert_allclose(a[stage]['director'],raw/np.linalg.norm(raw),atol=3e-15)
   np.testing.assert_array_equal(a['foldFlat'],b['foldFlat'])
  self.assertEqual(r['source']['selectedFunction'],'FoldSurfaceToCone');self.assertIn('ff[s]',r['source']['signConvention'])

 def test_cylinder_fraction_and_projection_match_noncircular_source_closed_form(self):
  r=default(False)
  for row in r['sample']['rows']:
   s=row['s'];self.assertAlmostEqual(row['offsetParameter'],1-math.cos(s)-s*s/4,14)
   np.testing.assert_allclose(row['targetFlat']['base'],[s,0],atol=3e-15)
   np.testing.assert_allclose(row['targetSpace']['base'],[math.sin(s),1-math.cos(s),0],atol=3e-15)
   np.testing.assert_array_equal(row['targetSpace']['director'],[0,0,1])
  self.assertTrue(r['certification']['formalTargetPairMetricCertified'])
  for a,b in zip(r['sample']['rows'],default(False,'normalized-symbolic')['sample']['rows']):self.assertEqual(a,b)

 def test_original_s_bug_produces_real_variable_sign_and_null_derivatives(self):
  q=compact(True,literalMode='normalized-symbolic',sourceFlatBase=['s','0'],sourceSpaceBase=['s','0','0'],flatApex=[1,1],spaceApex=[0,0,0],parameterEnd=2)
  r=query_fold_surface_generic(q,True);at=[x for x in r['sample']['rows'] if x['s']==1][0]
  self.assertEqual(at['branchSign'],0);self.assertFalse(at['targetJetsDefined']);self.assertIsNone(at['targetFlat']['directorDerivative'])
  np.testing.assert_array_equal(at['targetFlat']['director'],[0,0]);self.assertIsNone([x for x in r['grid'] if x['s']==1][0]['targetSpace']['EFG'])
  self.assertEqual(r['sample']['rows'][0]['branchSign'],1);self.assertEqual(r['sample']['rows'][-1]['branchSign'],-1)
  self.assertFalse(r['certification']['signBranchCertified']);self.assertFalse(r['certification']['finiteTargetPairMetricVerified']);self.assertIsNone(r['diagnostics']['maximumTargetPairRelativeMetricDifference'])
  q['literalMode']='raw-numerical';n=query_fold_surface_generic(q,True)
  self.assertTrue(all(x['branchSign']==1 and x['targetJetsDefined'] for x in n['sample']['rows']))
  self.assertTrue(n['certification']['formalTargetPairMetricCertified'])

 def test_constant_zero_sign_is_literal_computable_output_with_valid_zero_jets(self):
  changes=dict(sourceFlatBase=['0','0'],sourceFlatDirector=['1','0'],sourceSpaceBase=['0','0','0'],sourceSpaceDirector=['1','1','0'],flatApex=[7,0],spaceApex=[9,4,0])
  for mode in ('raw-numerical','normalized-symbolic'):
   r=query_fold_surface_generic(compact(True,literalMode=mode,**changes),True)
   self.assertEqual(r['diagnostics']['symbolicZeroSignAnalytic'],mode=='normalized-symbolic')
   for row in r['sample']['rows']:
    self.assertAlmostEqual(row['offsetParameter'],4,14);self.assertEqual(row['branchSign'],0);self.assertTrue(row['targetJetsDefined'])
    for stage in ('targetFlat','targetSpace'):np.testing.assert_array_equal(row[stage]['director'],np.zeros(len(row[stage]['director'])));np.testing.assert_array_equal(row[stage]['directorDerivative'],np.zeros(len(row[stage]['directorDerivative'])))
   self.assertFalse(r['certification']['formalTargetPairMetricCertified']);self.assertTrue(r['certification']['finiteTargetPairMetricVerified'])
   self.assertEqual(r['domain']['strips']['targetFlat']['status'],'degenerate')

 def test_ui_inside_original_domain_changes_seed_not_parameter_domain(self):
  q=compact(True,initialParameter=.37);r=query_fold_surface_generic(q,True)
  self.assertEqual(r['initial']['parameter'],.37);self.assertEqual(r['query'],q)
  for a,b in zip(default(True)['sample']['rows'],r['sample']['rows']):np.testing.assert_allclose(a['foldSpace'],b['foldSpace'],atol=2e-15)

 def test_original_sign_is_not_replaced_by_a_near_zero_epsilon(self):
  for perturbation,expected in [(0.,0),(1e-12,-1),(-1e-12,1)]:
   r=query_fold_surface_generic(compact(True,sourceFlatBase=['0','0'],sourceFlatDirector=['1','0'],sourceSpaceBase=['0','0','0'],sourceSpaceDirector=['1','1','0'],flatApex=[7,0],spaceApex=[9,4+perturbation,0]),True)
   self.assertEqual(r['initial']['branchSignAtInitial'],expected)
   if perturbation:self.assertGreater(np.linalg.norm(r['sample']['rows'][0]['targetSpace']['director']),4)

 def test_true_nonuniform_ten_source_functions_remain_editable_and_analytic(self):
  u='(s+s**3/10)'
  for cone in (True,False):
   q=compact(cone,sourceFlatBase=[u,f'{u}**2/4'],sourceSpaceBase=[f'sin({u})',f'{u}**2/4',f'1-cos({u})']);r=query_fold_surface_generic(q,cone)
   self.assertTrue(r['certification']['sourcePairMetricAnalytic']);self.assertTrue(r['certification']['finiteTargetPairMetricVerified'])
   for row in r['sample']['rows']:
    us=row['s']+row['s']**3/10;expected=cone_fold(us)[1] if cone else [us,1-math.cos(us)]
    np.testing.assert_allclose(row['foldFlat'],expected,atol=4e-15)
   self.assertEqual(r['query'],q)

 def test_nonunit_raw_cylinder_initials_are_not_orthogonally_repaired(self):
  r=query_fold_surface_generic(compact(False,flatDirector=[0,2]),False)
  for row in r['sample']['rows']:
   f=np.array(row['foldFlat']);np.testing.assert_allclose(row['targetFlat']['base'],f-np.dot(f,[0,2])*np.array([0,2]),atol=3e-15)
   np.testing.assert_array_equal(row['targetFlat']['director'],[0,2])
  self.assertFalse(r['certification']['initialDirectorsUnitCompatible']);self.assertFalse(r['certification']['formalTargetPairMetricCertified']);self.assertFalse(r['certification']['finiteTargetPairMetricVerified'])

 def test_true_variable_raw_source_directors_are_kept_and_match_full_EFG(self):
  for cone in (True,False):
   r=query_fold_surface_generic(compact(cone,sourceFlatDirector=['0','1+.2*sin(s)'],sourceSpaceDirector=['0','1+.2*sin(s)','0']),cone)
   self.assertTrue(r['certification']['sourcePairMetricAnalytic']);self.assertTrue(r['certification']['finiteSourcePairMetricVerified']);self.assertTrue(r['certification']['formalTargetPairMetricCertified'])
   for row,base in zip(r['sample']['rows'],default(cone)['sample']['rows']):
    self.assertAlmostEqual(row['sourceFlat']['director'][1],1+.2*math.sin(row['s']),14)
    self.assertAlmostEqual(row['sourceFlat']['directorDerivative'][1],.2*math.cos(row['s']),14)
    np.testing.assert_allclose(row['foldFlat'],base['foldFlat'],atol=3e-15)
    np.testing.assert_allclose(row['targetSpace']['director'],base['targetSpace']['director'],atol=3e-15)

 def test_near_unit_roundoff_premise_is_separate_from_finite_metrics(self):
  r=query_fold_surface_generic(compact(False,flatDirector=[0,1+9e-11]),False)
  self.assertTrue(r['certification']['finiteTargetPairMetricVerified']);self.assertFalse(r['certification']['initialDirectorsUnitCompatible']);self.assertFalse(r['certification']['formalTargetPairMetricCertified'])
  self.assertEqual(r['query']['flatDirector'],[0,1+9e-11])

 def test_zero_raw_cylinder_director_keeps_actual_collapse(self):
  r=query_fold_surface_generic(compact(False,flatDirector=[0,0],spaceDirector=[0,1,0]),False)
  for row in r['sample']['rows']:np.testing.assert_array_equal(row['targetFlat']['director'],[0,0]);np.testing.assert_array_equal(row['targetFlat']['directorDerivative'],[0,0])
  self.assertFalse(r['certification']['finiteTargetPairMetricVerified']);self.assertFalse(r['certification']['formalTargetPairMetricCertified'])

 def test_nonisometric_source_pair_returns_literal_constructor_but_no_formal_claim(self):
  r=query_fold_surface_generic(compact(True,sourceSpaceBase=['sin(s)','s**2/3','1-cos(s)']),True)
  self.assertFalse(r['certification']['sourcePairMetricAnalytic']);self.assertFalse(r['certification']['finiteSourcePairMetricVerified']);self.assertFalse(r['certification']['formalTargetPairMetricCertified'])
  self.assertEqual(len(r['grid']),9)

 def test_tiny_affine_sources_against_large_initial_anchors_preserve_true_geometry(self):
  cone_changes=dict(sourceFlatBase=['1e9+1e-8*s','1e9+1e-8*(s**2/4-2)'],sourceSpaceBase=['1e9+1e-8*sin(s)','1e9+1e-8*(s**2/4-1)','1e9+1e-8*(1-cos(s))'],flatApex=[1e9]*2,spaceApex=[1e9]*3)
  for mode in ('raw-numerical','normalized-symbolic'):
   changes=cone_changes if mode=='raw-numerical' else {**cone_changes,'transverseStart':2e-9,'transverseEnd':1e-8}
   r=query_fold_surface_generic(compact(True,literalMode=mode,**changes),True);self.assertLess(r['normalization']['scale'],3e-8)
   self.assertTrue(r['certification']['finiteSourcePairMetricVerified']);self.assertTrue(r['certification']['finiteTargetPairMetricVerified'])
   for a,b in zip(default(True,mode)['grid'],r['grid']):
    for stage in ('targetFlat','targetSpace'):np.testing.assert_allclose(a[stage]['normalizedPoints'],b[stage]['normalizedPoints'],atol=3e-14)
  r=query_fold_surface_generic(compact(False,sourceFlatBase=['1e9+1e-8*s','1e9+1e-8*s**2/4'],sourceSpaceBase=['1e9+1e-8*sin(s)','1e9+1e-8*s**2/4','1e9+1e-8*(1-cos(s))'],flatReferencePoint=[1e9]*2,spaceReferencePoint=[1e9]*3,transverseStart=2e-9,transverseEnd=1e-8),False)
  self.assertTrue(r['certification']['formalTargetPairMetricCertified'])
  for a,b in zip(default(False)['grid'],r['grid']):
   for stage in ('targetFlat','targetSpace'):np.testing.assert_allclose(a[stage]['normalizedPoints'],b[stage]['normalizedPoints'],atol=3e-14)

 def test_all_display_metrics_are_included_in_natural_diagnostics(self):
  for cone in (True,False):
   r=default(cone)
   for row in r['grid']:
    for a,b in zip(row['sourceFlat']['EFG'],row['sourceSpace']['EFG']):self.assertLessEqual(natural_difference(a,b),r['diagnostics']['maximumSourcePairRelativeMetricDifference'])
    for a,b in zip(row['targetFlat']['EFG'],row['targetSpace']['EFG']):self.assertLessEqual(natural_difference(a,b),r['diagnostics']['maximumTargetPairRelativeMetricDifference'])

 def test_apex_width_and_interval_unknown_preserve_complete_original_inputs(self):
  r=query_fold_surface_generic(compact(True,transverseStart=0),True)
  self.assertEqual(r['domain']['strips']['targetSpace']['status'],'degenerate');self.assertTrue(r['certification']['formalTargetPairMetricCertified'])
  f='(2+sin(4000*s)+cos(4000*s))';q=compact(True,sourceFlatDirector=['0',f'{f}/{f}'],sourceSpaceDirector=['0',f'{f}/{f}','0']);r=query_fold_surface_generic(q,True)
  self.assertFalse(r['domain']['certified']);self.assertEqual(r['domain']['evaluations'],1024);self.assertFalse(r['certification']['formalTargetPairMetricCertified']);self.assertEqual(r['query'],q);self.assertEqual(r['grid'][-1]['s'],1)

 def test_actual_zero_denominators_normalizations_and_malicious_sources_are_rejected(self):
  for cone,changes in [(True,{'flatApex':[0,1],'spaceApex':[0,1,0]}),(False,{'spaceDirector':[0,1,0]}),(True,{'sourceFlatBase':['__import__("os").getcwd()','0']}),(True,{'sourceFlatDirector':['0','(s-.5)/(s-.5)']}),(True,{'initialParameter':2}),(False,{'flatDirector':[float('inf'),0]})]:
   with self.assertRaises(ValueError):query_fold_surface_generic(compact(cone,**changes),cone)

if __name__=='__main__':unittest.main()
