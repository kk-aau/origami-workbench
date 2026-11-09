import sys,math,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from tessellation_curved_system_helpers_generic import PRESETS,query_system_helpers_generic,validate_system_helpers_query

def query(mode,**updates):return query_system_helpers_generic({**PRESETS[mode],'segments':8,**updates})
class Helpers(unittest.TestCase):
 def test_exact_original_rule_orders_and_recovery_list_are_not_invented_rules(self):
  for mode in PRESETS:
   r=query(mode);self.assertEqual(list(r['sample']['rows'][0]['rules']),r['source']['ruleOrder']);self.assertEqual(r['certification']['adoptableCreasePattern'],False)
   self.assertEqual(r['source']['interpolationReproduced'],False);self.assertTrue(r['domain']['certified'])
  self.assertEqual(query('recover-darboux')['source']['outputKind'],'ordered-list')
  self.assertEqual(query('recover-darboux')['source']['ruleOrder'],['C','T','L','U'])
 def test_curve2_circle_speed_scale_and_signed_zero_inflection_normal(self):
  r=query('curve2',curve=['2*cos(2*s)','2*sin(2*s)'])
  for row in r['sample']['rows']:self.assertAlmostEqual(row['rules']['Speed2D'],4);self.assertAlmostEqual(row['rules']['Curvature2D'],.5)
  r=query('curve2',curve=['s','s**3'],parameterStart=-1.,parameterEnd=1.)
  zero=r['sample']['rows'][4];self.assertTrue(zero['systemDefined']);self.assertEqual(zero['rules']['NormalVector2D'],[-0.,0.]);self.assertEqual(zero['rules']['LeftCurvature2D'],0.)
  self.assertLess(r['sample']['rows'][0]['rules']['LeftCurvature2D'],0);self.assertGreater(r['sample']['rows'][-1]['rules']['LeftCurvature2D'],0)
 def test_curve3_noncircular_frenet_derivatives_match_original_four_equations(self):
  r=query('curve3')
  for row in r['sample']['rows']:
   rules=row['rules'];v,k,tau=[rules[name] for name in ('Speed3D','Curvature3D','Torsion3D')];T,N,B=[np.array(rules[name]) for name in ('TangentVector3D','NormalVector3D','BinormalVector3D')]
   np.testing.assert_allclose(row['curveDerivative'],v*T,atol=1e-14);np.testing.assert_allclose(row['derivatives']['T'],v*k*N,atol=1e-14)
   np.testing.assert_allclose(row['derivatives']['N'],v*(-k*T+tau*B),atol=1e-14);np.testing.assert_allclose(row['derivatives']['B'],-v*tau*N,atol=1e-14)
 def test_curve3_zero_curvature_normalize_real_and_zero_speed_return_only_meaningful_rules(self):
  r=query('curve3',curve=['s','0','0']);self.assertTrue(r['domain']['zeroFrameIdentityProved']);self.assertFalse(r['domain']['certified'])
  for row in r['sample']['rows']:self.assertEqual(row['rules']['Curvature3D'],0);self.assertIsNone(row['rules']['NormalVector3D']);self.assertIsNone(row['rules']['BinormalVector3D']);self.assertIsNone(row['rules']['Torsion3D'])
  r=query('curve2',curve=['0','0']);self.assertEqual(r['diagnostics']['definedRows'],0)
  for row in r['sample']['rows']:self.assertEqual(row['curve'],[0.,0.]);self.assertEqual(row['rules']['Speed2D'],0);self.assertIsNone(row['rules']['TangentVector2D'])
 def test_raw_darboux_normal_amplitude_scales_original_coefficients_without_hidden_unit_frame(self):
  base=query('darboux3');raw=query('darboux3',normal=[f'2*({x})' for x in PRESETS['darboux3']['normal']]);self.assertFalse(raw['certification']['formalFrameOrthonormalCertified'])
  for a,b in zip(base['sample']['rows'],raw['sample']['rows']):
   for key in ('SurfaceNormalVector3D','TangentNormalVector3D'):np.testing.assert_allclose(b['rules'][key],2*np.array(a['rules'][key]),atol=2e-15)
   self.assertAlmostEqual(b['rules']['GeodesicCurvature3D'],2*a['rules']['GeodesicCurvature3D']);self.assertAlmostEqual(b['rules']['GeodesicTorsion3D'],4*a['rules']['GeodesicTorsion3D'])
  r=query('darboux3',normal=['0','0','0']);self.assertTrue(r['certification']['finiteSystemFullyDefined']);self.assertFalse(r['certification']['formalFrameOrthonormalCertified']);self.assertEqual(r['sample']['rows'][0]['rules']['SurfaceNormalVector3D'],[0.,0.,0.])
 def test_ruled_two_parameter_normals_match_raw_cross_and_sigma_without_director_normalizing(self):
  r=query('ruled-normal',director=['s','0','2'],sigma=-1,rulingSegments=4)
  for row,grid in zip(r['sample']['rows'],r['grid']):
   for j,normal in enumerate(grid['normals']):
    w=r['query']['transverseStart']+(r['query']['transverseEnd']-r['query']['transverseStart'])*j/4;cross=np.cross(np.array(row['curveDerivative'])+w*np.array(row['derivatives']['director']),row['director']);np.testing.assert_allclose(normal,-cross/np.linalg.norm(cross),atol=1e-14)
  self.assertEqual(r['sample']['rows'][0]['transverseParameter'],0.)
 def test_ruled_zero_area_keeps_mesh_and_null_normals_instead_of_fake_normal_or_cropped_width(self):
  r=query('ruled-normal',baseCurve=['s','0','0'],director=['1','0','0']);self.assertFalse(r['domain']['certified']);self.assertFalse(r['certification']['finiteSystemFullyDefined'])
  self.assertEqual(r['query']['transverseStart'],-.2);self.assertTrue(all(n is None for row in r['grid'] for n in row['normals']));self.assertTrue(all(len(row['points'])==17 for row in r['grid']))
  r=query('ruled-normal',baseCurve=['0','0','0'],director=['cos(s)','sin(s)','0'],transverseStart=.2,transverseEnd=1.)
  self.assertTrue(r['domain']['certified']);self.assertTrue(r['certification']['finiteSystemFullyDefined']);self.assertEqual(r['sample']['rows'][0]['transverseParameter'],.6)
 def test_recover2_closed_circle_preserves_nonunit_raw_initial_tangent(self):
  r=query('recover2',coefficients=['2','.5'],initialTangent=[2.,0.],initialPoint=[3.,4.])
  self.assertFalse(r['initial']['frameCompatible'])
  for row in r['sample']['rows']:
   s=row['s'];np.testing.assert_allclose(row['curve'],[3+4*math.sin(s),4+4*(1-math.cos(s))],atol=1e-12);self.assertAlmostEqual(row['actualCurveSpeed'],4)
   self.assertEqual(row['rules']['Speed2D'],2)
 def test_recover3_raw_binormal_cross_initial_normal_and_interior_ui_restore_both_directions(self):
  r=query('recover3',coefficients=['2','.5','0'],initialParameter=.4,initialTangent=[1.,0.,0.],initialBinormal=[0.,0.,1.]);self.assertGreater(r['diagnostics']['integration']['backwardEvaluations'],0);self.assertGreater(r['diagnostics']['integration']['forwardEvaluations'],0)
  for row in r['sample']['rows']:
   s=row['s']-.4;np.testing.assert_allclose(row['curve'],[2*math.sin(s),2*(1-math.cos(s)),0],atol=2e-12)
  r=query('recover3',initialTangent=[2.,0.,0.],initialBinormal=[0.,0.,3.]);self.assertEqual(r['initial']['frame'],[[2.,0.,0.],[0.,6.,0.],[0.,0.,3.]])
 def test_recover_darboux_uses_parameter_coefficients_without_an_extra_speed_factor(self):
  r=query('recover-darboux',coefficients=['2','1','0','0'])
  for row in r['sample']['rows']:s=row['s'];np.testing.assert_allclose(row['curve'],[2*math.sin(s),2*(1-math.cos(s)),0],atol=2e-12);np.testing.assert_allclose(row['rules']['T'],[math.cos(s),math.sin(s),0],atol=2e-12)
  r=query('recover-darboux',initialTangent=[0.,0.,0.],initialLeft=[0.,0.,0.],initialNormal=[0.,0.,0.]);self.assertFalse(r['initial']['frameCompatible']);self.assertTrue(r['certification']['finiteSystemFullyDefined']);self.assertTrue(all(row['curve']==[0.,0.,0.] for row in r['sample']['rows']))
 def test_tiny_translated_source_curve_keeps_world_curvature_units_and_normalized_geometry(self):
  scale=1e-8;r=query('curve3',curve=['1000000000+1e-8*sin(s)','1e-8*s**2/4','1000000000+1e-8*(1-cos(s))']);base=query('curve3')
  for a,b in zip(base['sample']['rows'],r['sample']['rows']):np.testing.assert_allclose(a['normalizedCurve'],b['normalizedCurve'],atol=1e-14);self.assertAlmostEqual(a['rules']['Curvature3D'],scale*b['rules']['Curvature3D']);self.assertAlmostEqual(a['rules']['Speed3D'],b['rules']['Speed3D']/scale)
 def test_input_does_not_accept_unused_fields_unsafe_ast_or_synthetic_raw_frame_gate(self):
  for mode in PRESETS:
   with self.assertRaises(ValueError):validate_system_helpers_query({**PRESETS[mode],'unused':0})
  with self.assertRaises(ValueError):query('curve2',curve=['__import__(s)','0'])
  with self.assertRaises(ValueError):query('recover3',initialTangent=[math.inf,0,0])
  r=query('recover3',initialTangent=[0.,0.,0.],initialBinormal=[0.,0.,0.]);self.assertFalse(r['initial']['frameCompatible']);self.assertTrue(r['certification']['finiteSystemFullyDefined'])
if __name__=='__main__':unittest.main()

