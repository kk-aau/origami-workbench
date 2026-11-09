"""Independent literal formula and Jacobian audit; no shared HTTP worker."""
import copy,json,math,sys,unittest
from pathlib import Path
import numpy as np
from scipy.integrate import quad
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent))
from tessellation_curved_canonical_generic import PRESETS,query_generic_canonical,GenericCanonicalError,CanonicalKernel,validate_generic_canonical_query

def cases():
 rows=[dict(name=f'original-{name}',query=copy.deepcopy(q)) for name,q in PRESETS.items()]
 def add(name,operation,**patch):rows.append(dict(name=name,query=dict(PRESETS[operation],**patch)))
 add('noncircular-cylinder','cylinder',baseCurve=['s','.3*s**2','.2*sin(s)'],director=['1','2','3'],parameterStart=-.6,parameterEnd=.7,crossParameterStart=-.2,crossParameterEnd=.3)
 add('noncircular-cone','cone',baseCurve=['.3','-.2','.7'],director=['1','.3*s','.2*s**2'],parameterStart=-.8,parameterEnd=.9,rulingStart=.2,rulingEnd=.8)
 add('polynomial-tangent','tangent',baseCurve=['s','s**2','.1*s**3'],parameterStart=.1,parameterEnd=1.,rulingStart=.2,rulingEnd=.6,crossParameterStart=1.2,crossParameterEnd=1.8)
 add('general-variable-amplitude-cylinder','general',baseCurve=['s','.3*s**2','2*s'],director=['0','0','1+s'],parameterStart=0.,parameterEnd=1.,rulingStart=-.2,rulingEnd=.4,crossParameterStart=-.2,crossParameterEnd=.4)
 add('general-cone','general',baseCurve=['.3+s*cos(s)/sqrt(2)','-.4+s*sin(s)/sqrt(2)','.7+s/sqrt(2)'],director=['cos(s)','sin(s)','1'],parameterStart=0.,parameterEnd=1.,rulingStart=.2,rulingEnd=.6,crossParameterStart=.2,crossParameterEnd=.6)
 add('general-reversed-tangent','general',baseCurve=['cos(s)+s*sin(s)/sqrt(1.04)','sin(s)-s*cos(s)/sqrt(1.04)','.2*s-.2*s/sqrt(1.04)'],director=['3*sin(s)','-3*cos(s)','-.6'],parameterStart=0.,parameterEnd=1.,rulingStart=.2,rulingEnd=.6,crossParameterStart=0.,crossParameterEnd=1.)
 add('general-small-nonzero-Dprime','general',baseCurve=['s','0','0'],director=['1','1e-12*s','0'],parameterStart=0.,parameterEnd=1.,rulingStart=.2,rulingEnd=.6,crossParameterStart=1.2,crossParameterEnd=1.6)
 add('general-small-nonzero-variable-amplitude-Dprime','general',baseCurve=['s','0','0'],director=['1+s','1e-12*s','0'],parameterStart=0.,parameterEnd=1.,rulingStart=.2,rulingEnd=.6,crossParameterStart=1.2,crossParameterEnd=1.6)
 for operation in ('cone','general'):add(operation+'-nondevelopable-literal',operation,baseCurve=['s','0','0'],director=['cos(s)','sin(s)','1'],parameterStart=0.,parameterEnd=1.,rulingStart=.2,rulingEnd=.6,crossParameterStart=.2,crossParameterEnd=.6)
 add('tiny-translated-tangent','tangent',baseCurve=['1e12+1e-9*s','-1e12+1e-9*s**2','1e-9*s**3'],parameterStart=.1,parameterEnd=1.,rulingStart=1e-10,rulingEnd=3e-10,crossParameterStart=1.2,crossParameterEnd=1.6)
 return rows

class CanonicalNativeProbe(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.rows=[]
  for c in cases():
   r=query_generic_canonical(c['query']);cls.rows.append(dict(c,response=r))

 def case(self,name):return next(c for c in self.rows if c['name']==name)['response']

 def test_native_sources_and_formal_readonly_classification(self):
  for c in self.rows:
   r=c['response'];self.assertEqual(r['query'],c['query']);self.assertFalse(r['certification']['adoptableCreasePattern']);self.assertFalse(r['source']['numericWolframOutAvailable']);self.assertFalse(r['source']['flatDevelopmentReturnedByOriginal'])
   self.assertLess(r['certification']['unitDirectorFiniteMaximumError'],2e-14)
   self.assertTrue(all(math.isfinite(x) for grid in ('normalizedRawGrid','normalizedCanonicalGrid','normalizedCrossGrid') for row in r[grid] for p in row for x in p))
  self.assertEqual(self.case('general-variable-amplitude-cylinder')['source']['canonicalBranch'],'cylinder')
  self.assertEqual(self.case('general-cone')['source']['canonicalBranch'],'cone')
  self.assertTrue(self.case('general-cone')['certification']['apexIdentity']['analyticIdentity'])
  for name in ('general-reversed-tangent','general-small-nonzero-Dprime'):self.assertEqual(self.case(name)['source']['canonicalBranch'],'tangent');self.assertTrue(self.case(name)['certification']['edgeOfRegressionIdentity']['analyticIdentity'])
  for name in ('cone-nondevelopable-literal','general-nondevelopable-literal'):
   r=self.case(name);self.assertEqual(r['certification']['developabilityIdentity']['status'],'nonzero');self.assertFalse(r['certification']['developabilityIdentity']['analyticIdentity'])
  self.assertTrue(self.case('cone-nondevelopable-literal')['source']['coneOriginalUnassignedBbCheck']);self.assertEqual(self.case('cone-nondevelopable-literal')['certification']['apexIdentity']['status'],'nonzero')

 def test_original_saved_rules_and_cross_alias_metrics(self):
  cylinder=self.case('original-cylinder');cone=self.case('original-cone');tangent=self.case('original-tangent');general=self.case('original-general')
  for row in cylinder['samples']:
   s=row['s'];self.assertLess(math.dist(row['canonicalBase'],[math.cos(s),math.sin(s),0]),2e-14)
   for metric in row['crossEFG']:self.assertAlmostEqual(metric['E'],1,places=13);self.assertAlmostEqual(metric['F'],0,places=13);self.assertAlmostEqual(metric['G'],1,places=13)
  for i,s in enumerate(cone['uValues']):
   for j,w in enumerate(cone['rulingValues']):
    expected=[w*math.sqrt(3)/2,w/2*math.sin(s),.5-w/2*math.cos(s)];self.assertLess(math.dist(cone['canonicalGrid'][i][j],expected),1e-14)
  for i,s in enumerate(tangent['uValues']):
   b=np.array([math.sqrt(3)/2*math.cos(s),math.sqrt(3)/2*math.sin(s),.5*s]);d=np.array([-math.sqrt(3)/2*math.sin(s),math.sqrt(3)/2*math.cos(s),.5])
   self.assertLess(math.dist(general['samples'][i]['canonicalBase'],b),3e-14)
   for j,v in enumerate(tangent['crossParameterValues']):self.assertLess(math.dist(tangent['crossGrid'][i][j],b+(v-s)*d),2e-13)

 def test_polynomial_arc_difference_independent_quad_and_metric(self):
  r=self.case('polynomial-tangent')
  def B(s):return np.array([s,s*s,.1*s**3])
  def V(s):return np.array([1.,2*s,.3*s*s])
  def T(s):return V(s)/np.linalg.norm(V(s))
  for i,s in enumerate(r['uValues']):
   for j,v in enumerate(r['crossParameterValues']):
    al=quad(lambda x:np.linalg.norm(V(x)),s,v,epsabs=2e-14,epsrel=2e-14)[0];expected=B(s)+al*T(s)
    self.assertLess(math.dist(r['crossGrid'][i][j],expected),2e-11)
    metric=r['samples'][i]['crossEFG'][j];self.assertAlmostEqual(metric['F'],0,places=12);self.assertAlmostEqual(metric['G'],float(V(v)@V(v)),places=11)
  self.assertFalse(r['integration']['errorIntervalCertified']);self.assertTrue(r['certification']['sourceDomain']['certified'])

 def test_reverse_director_literal_cross_keeps_nonzero_F_and_regression_singularity(self):
  r=self.case('general-reversed-tangent');self.assertEqual(r['certification']['sourceDomain']['crossRegularity']['status'],'singular')
  for i,s in enumerate(r['uValues']):
   # Coarser v grid contains only every fourth s; inspect the true diagonal.
   if i%4:continue
   j=i//4;m=r['samples'][i]['crossEFG'][j]
   self.assertAlmostEqual(m['E'],4*1.04,places=12);self.assertAlmostEqual(m['F'],-2*1.04,places=12);self.assertAlmostEqual(m['G'],1.04,places=12);self.assertFalse(m['regular']);self.assertEqual(m['normalizedArea'],0)
   self.assertLess(math.dist(r['crossGrid'][i][j],[math.cos(s),math.sin(s),.2*s]),2e-14)

 def test_general_literal_fraction_nondev_two_domains_and_same_ruling_identity(self):
  r=self.case('general-nondevelopable-literal');self.assertEqual(r['certification']['edgeOfRegressionIdentity']['status'],'nonzero')
  for i,s in enumerate(r['uValues']):
   D=np.array([math.cos(s),math.sin(s),1.])/math.sqrt(2);Dp=np.array([-math.sin(s),math.cos(s),0.])/math.sqrt(2)
   B=np.array([s+math.sin(s)*math.cos(s),math.sin(s)**2,math.sin(s)]);Bp=np.array([2*math.cos(s)**2,2*math.sin(s)*math.cos(s),math.cos(s)])
   self.assertLess(math.dist(r['samples'][i]['canonicalBase'],B),1e-14)
   for j,w in enumerate(r['rulingValues']):
    raw=np.array([s,0.,0.])+(w/math.sqrt(2)+math.sin(s))*np.array([math.cos(s),math.sin(s),1.]);self.assertLess(math.dist(r['canonicalGrid'][i][j],raw),1e-14)
   for j,v in enumerate(r['crossParameterValues']):
    w=math.sqrt(5)*(math.sin(v)-math.sin(s));self.assertLess(math.dist(r['crossGrid'][i][j],B+w*D),2e-12)
    su=Bp-math.sqrt(5)*math.cos(s)*D+w*Dp;sv=math.sqrt(5)*math.cos(v)*D;m=r['samples'][i]['crossEFG'][j]
    for key,expected in [('E',su@su),('F',su@sv),('G',sv@sv)]:self.assertAlmostEqual(m[key],float(expected),places=11)
  r=self.case('general-cone')
  for row in r['samples']:self.assertLess(math.dist(row['canonicalBase'],[.3,-.4,.7]),1e-14)

 def test_tiny_derivative_and_translated_curve_are_not_absolute_zero(self):
  r=self.case('general-small-nonzero-Dprime');self.assertEqual(r['certification']['cylinderBranchIdentity']['status'],'nonzero');self.assertEqual(r['source']['canonicalBranch'],'tangent')
  for row in r['samples']:self.assertAlmostEqual(row['canonicalBase'][0],2*row['s'],places=12);self.assertAlmostEqual(row['canonicalBase'][1],1e-12*row['s']**2,places=24)
  r=self.case('general-small-nonzero-variable-amplitude-Dprime');self.assertEqual(r['source']['canonicalBranch'],'tangent')
  for row in r['samples']:self.assertAlmostEqual(row['canonicalBase'][0],row['s']*(2+row['s']),places=12);self.assertAlmostEqual(row['canonicalBase'][1],1e-12*row['s']**2,places=24)
  r=self.case('tiny-translated-tangent');n=r['normalization'];origin=np.array(n['rawOrigin']);scale=n['scale'];self.assertLess(scale,1e-7)
  for i,s in enumerate(r['uValues']):
   for j,v in enumerate(r['crossParameterValues']):
    speed=lambda x:math.hypot(1.,2*x,3*x*x)
    delta=quad(speed,s,v,epsabs=2e-14,epsrel=2e-14)[0];base=np.array([s,.0+s*s,s**3]);t=np.array([1.,2*s,3*s*s])/speed(s)
    anchor=np.array([.1,.1**2,.1**3]);expected=(base-anchor+delta*t)*1e-9/scale
    self.assertLess(math.dist(r['normalizedCrossGrid'][i][j],expected),2e-11)

 def test_strict_source_and_real_singularities_do_not_fall_back_to_saved_inputs(self):
  for operation in ('cylinder','cone','tangent','general'):
   q=copy.deepcopy(PRESETS[operation]);q['other']=1
   with self.assertRaises(GenericCanonicalError):query_generic_canonical(q)
  q=copy.deepcopy(PRESETS['tangent']);q['director']=['0','0','1']
  with self.assertRaisesRegex(GenericCanonicalError,'input-contract'):query_generic_canonical(q)
  for d in (['0','0','1+s'],['0','0','s-s+1']):
   q=dict(PRESETS['cylinder'],director=d)
   with self.assertRaisesRegex(GenericCanonicalError,'constant-director-contract'):query_generic_canonical(q)
  q=dict(PRESETS['cone'],director=['0','0','0'])
  with self.assertRaisesRegex(GenericCanonicalError,'director-singularity'):query_generic_canonical(q)
  q=dict(PRESETS['tangent'],baseCurve=['0','0','0'])
  with self.assertRaisesRegex(GenericCanonicalError,'director-singularity'):query_generic_canonical(q)
  r=query_generic_canonical(dict(PRESETS['tangent'],baseCurve=['s','0','0'],rulingStart=.2,rulingEnd=.5))
  self.assertEqual(r['certification']['sourceDomain']['canonicalRegularity']['status'],'singular');self.assertEqual(r['certification']['sourceDomain']['crossRegularity']['status'],'singular')
  q=dict(PRESETS['cylinder'],director=['sin(pi)','0','0'])
  with self.assertRaisesRegex(GenericCanonicalError,'director-singularity'):query_generic_canonical(q)
  q=dict(PRESETS['general'],director=['1','s**2','0'],parameterStart=-1.,parameterEnd=1.)
  with self.assertRaisesRegex(GenericCanonicalError,'source-singularity'):query_generic_canonical(q)
  q=dict(PRESETS['cone'],director=['log(s)','0','1'],parameterStart=-1.,parameterEnd=1.)
  with self.assertRaises(GenericCanonicalError):query_generic_canonical(q)

 def test_unknown_identity_and_interval_arc_budgets_keep_original_domains(self):
  with patch('tessellation_curved_canonical_generic._zero_identity',return_value=False),patch.object(CanonicalKernel,'_witness',return_value=False):
   with self.assertRaisesRegex(GenericCanonicalError,'branch-unknown'):query_generic_canonical(PRESETS['general'])
  with patch('tessellation_curved_canonical_generic.CERTIFICATION_BUDGET',1):
   q=dict(PRESETS['cone'],director=['cos(s)','sin(s)','0']);r=query_generic_canonical(q);self.assertFalse(r['certification']['sourceDomain']['certified']);self.assertEqual(r['query'],q);self.assertEqual(len(r['uValues']),33);self.assertEqual(r['uValues'][-1],math.pi)
  with patch('tessellation_curved_canonical_generic.INTEGRATION_BUDGET',1):
   with self.assertRaisesRegex(GenericCanonicalError,'arc-budget'):query_generic_canonical(PRESETS['tangent'])

if __name__=='__main__':unittest.main(verbosity=2)

