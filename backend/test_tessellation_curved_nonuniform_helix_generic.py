"""Independent 80-digit FractionBox rules and Normalize-cross flatten probes."""
import json,math,sys,unittest
from pathlib import Path
from unittest.mock import patch
import mpmath as mp
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_nonuniform_helix_generic import *
from tessellation_curved_generic_linked_expression import Expression
from tessellation_curved_matched_pair_query import symbolic_node
import sympy as sp

def cases():
 rows=[]
 def add(name,**changes):rows.append(dict(name=name,query=dict(PRESET,**changes)))
 add('original-in3968')
 add('nonlinear-gamma',radius=2.3,pitchAngle=-.4,foldAngle='1.1+.2*sin(2*s)+s**2/7',parameterStart=-.2,parameterEnd=.8)
 add('negative-gamma',foldAngle='-1.1+.2*s',parameterStart=-.2,parameterEnd=.8)
 add('negative-radius',radius=-1.7)
 add('beyond-right-angle',pitchAngle=2.)
 add('negative-radius-beyond-right-angle',radius=-2.3,pitchAngle=2.,foldAngle='-1.2-.3*cos(s)',parameterStart=-.2,parameterEnd=.8)
 add('flat-pitch-negative-gamma',pitchAngle=0.,foldAngle='-pi/3',parameterStart=-.2,parameterEnd=.8)
 add('three-pi-gamma',foldAngle='3*pi+.1*s',parameterStart=-.2,parameterEnd=.8)
 add('zero-gamma-spatial-only',foldAngle='0')
 add('zero-radius-spatial-only',radius=0.)
 add('two-pi-planar-unknown',foldAngle='2*pi')
 add('gamma-cross-zero',foldAngle='s',parameterStart=-.13,parameterEnd=.73)
 add('tiny-radius-and-width',radius=1e-9,transverseEnd=2e-10)
 add('tiny-gamma',foldAngle='1e-12',parameterStart=-.2,parameterEnd=.8)
 add('large-radius',radius=1e6,transverseEnd=2e5)
 add('negative-transverse-domain',transverseStart=-.23,transverseEnd=-.02)
 add('full-width-through-focus',pitchAngle=0.,foldAngle='pi/3',transverseStart=-2.,transverseEnd=2.)
 add('positive-width-left-focus',pitchAngle=0.,foldAngle='pi/3',transverseEnd=2.)
 return rows

def gamma_reference(source):
 s=sp.Symbol('s',real=True);expr=symbolic_node(Expression(source,'s').tree,s)
 return sp.lambdify(s,expr,'mpmath'),sp.lambdify(s,sp.diff(expr,s),'mpmath')

def literal(q,s):
 with mp.workdps(max(80,mp.mp.dps)):
  s=mp.mpf(s);r=mp.mpf(q['radius']);theta=mp.mpf(q['pitchAngle']);gamma,gp=gamma_reference(q['foldAngle']);g,h=gamma(s),gp(s)
  c,a=mp.cos(theta),mp.sin(theta);cs,sn=mp.cos(s),mp.sin(s);C,S=mp.cos(g),mp.sin(g)
  dl=mp.sqrt(3-mp.cos(2*theta)-2*c*c*C+4*a*h+h*h);dr=mp.sqrt(3-mp.cos(2*theta)-2*c*c*C-4*a*h+h*h)
  f=[r*cs,r*sn,r*mp.tan(theta)*s]
  l=[-c*((1+C)*a*sn+cs*S+sn*h)/dl,c*(cs*(1+C)*a-sn*S+cs*h)/dl,(-c*c*(-1+C)+2*a*a+a*h)/dl]
  rr=[c*(-(1+C)*a*sn+cs*S+sn*h)/dr,c*(cs*(1+C)*a+sn*S-cs*h)/dr,(-c*c*(-1+C)+2*a*a-a*h)/dr]
  return f,l,rr,g,h,dl,dr

def m_dot(a,b):return sum(x*y for x,y in zip(a,b))
def m_cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def m_normal(a):
 n=mp.sqrt(m_dot(a,a));return [x/n for x in a]

class HelixNativeProbe(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.rows=[dict(c,response=query_generic_nonuniform_helix(c['query'])) for c in cases()]
 def test_literal_closed_fraction_rules_and_derivatives_80digit(self):
  for fixture in self.rows:
   q,r=fixture['query'],fixture['response'];self.assertEqual(r['query'],q)
   for row in r['sample']['rows'][::8]:
    expected=literal(q,row['s'])
    for k,key in enumerate(('sourceBase','sourceLeftDirector','sourceRightDirector')):
     for i,v in enumerate(expected[k]):
      natural=max(abs(float(v)),abs(q['radius']) if k==0 else 1.,1e-300)
      self.assertLess(abs(row[key][i]-float(v)),3e-13*natural,(fixture['name'],key,i))
      if fixture['name']=='two-pi-planar-unknown':continue
      with mp.workdps(80):d=mp.diff(lambda z:literal(q,z)[k][i],mp.mpf(row['s']))
      actual=row['sourceBaseDerivative' if k==0 else 'sourceLeftDirectorDerivative' if k==1 else 'sourceRightDirectorDerivative'][i]
      self.assertLess(abs(actual-float(d)),4e-12*max(abs(float(d)),abs(q['radius']) if k==0 else 1.,1e-300))
 def test_true_normalized_cross_frame_and_coefficients_all_signs(self):
  for fixture in self.rows:
   q,r=fixture['query'],fixture['response']
   if r['flattening']['status']!='computed':continue
   k=GenericHelixKernel(validate_generic_nonuniform_helix_query(q))
   for row in r['sample']['rows'][::8]:
    s=row['s']
    with mp.workdps(80):
     f,l,rr,*_=literal(q,s);bp=[mp.diff(lambda z:literal(q,z)[0][i],mp.mpf(s)) for i in range(3)];T=m_normal(bp)
     Tp=[mp.diff(lambda z:m_normal([mp.diff(lambda u:literal(q,u)[0][i],z) for i in range(3)])[j],mp.mpf(s)) for j in range(3)]
     actual=k.finite(s)
     for index,D in enumerate((l,rr)):
      U=m_normal([(-1 if index else 1)*x for x in m_cross(T,D)]);L=m_cross(U,T)
      refs={'T':T,'U':U,'L':L};a=actual[index]
      for field,v in refs.items():self.assertLess(np.max(np.abs(values(a[field])-np.asarray([float(x) for x in v]))),5e-13,(fixture['name'],field))
      for field,v in [('p',m_dot(D,T)/k.scale),('q',m_dot(D,L)/k.scale),('g',m_dot(L,Tp))]:
       self.assertLess(abs(a[field].value-float(v)),8e-13*max(abs(float(v)),1/k.scale if field!='g' else 1.),(fixture['name'],field))
 def test_fixed_initial_and_both_sided_metrics_tiny_and_large(self):
  for fixture in self.rows:
   r=fixture['response'];self.assertEqual(r['flattening']['initial'],{'parameter':fixture['query']['parameterStart'],'point':[1.,0.],'tangent':[0.,1.],'argumentOrder':['ui','fi','ti']})
   if r['flattening']['status']!='computed':continue
   f=r['flattening']['result'];self.assertEqual(f['sample']['rows'][0]['targetBase'],[1.,0.]);self.assertEqual(f['sample']['rows'][0]['targetTangent'],[0.,1.])
   for side in ('Left','Right'):
    self.assertLess(f['diagnostics']['maximum'+side+'RelativeMetricDifference'],2e-11,(fixture['name'],side))
    self.assertTrue(f['certification']['finite'+side+'MetricVerified'])
   self.assertTrue(f['certification']['sharedGeodesicCurvatureAnalytic']);self.assertFalse(f['certification']['adoptableCreasePattern'])
 def test_zero_gamma_and_radius_keep_spatial_rules_without_false_space4_zero(self):
  a=next(x['response'] for x in self.rows if x['name']=='zero-gamma-spatial-only')
  self.assertEqual(a['flattening']['status'],'source-singularity');self.assertIsNone(a['flattening']['result'])
  for row in a['sample']['rows']:self.assertAlmostEqual(math.hypot(*row['sourceLeftDirector']),1.,places=14)
  b=next(x['response'] for x in self.rows if x['name']=='zero-radius-spatial-only')
  self.assertEqual(b['flattening']['status'],'source-singularity');self.assertTrue(all(x['sourceBase']==[0.,0.,0.] for x in b['sample']['rows']))
  for name in ('two-pi-planar-unknown','gamma-cross-zero'):
   a=next(x['response'] for x in self.rows if x['name']==name);self.assertEqual(a['flattening']['status'],'unknown');self.assertIsNone(a['flattening']['result']);self.assertEqual(len(a['sample']['rows']),49)
 def test_literal_zero_denominator_rejected_not_rounded_pi_fake(self):
  for gamma in ('0','2*pi','4*pi'):
   with self.assertRaisesRegex(GenericNonuniformHelixError,'helix-rule-singularity'):query_generic_nonuniform_helix(dict(PRESET,pitchAngle=0.,foldAngle=gamma))
  with self.assertRaisesRegex(GenericNonuniformHelixError,'helix-rule-singularity'):query_generic_nonuniform_helix(dict(PRESET,pitchAngle=0.,foldAngle='s**2',parameterStart=0.,parameterEnd=.5))
 def test_complete_domain_unknown_budget_and_no_strip_clipping(self):
  q=dict(PRESET,pitchAngle=0.,foldAngle='.2+sin(s)',parameterEnd=6.)
  with patch('tessellation_curved_nonuniform_helix_generic.CERTIFICATION_BUDGET',1):r=query_generic_nonuniform_helix(q)
  self.assertFalse(r['domain']['certified']);self.assertEqual(r['query'],q);self.assertEqual(len(r['sample']['rows']),49);self.assertIsNone(r['flattening']['result'])
  self.assertFalse(r['certification']['sourceRulesCertified']);self.assertFalse(r['certification']['adoptableCreasePattern'])
  focus=next(x['response'] for x in self.rows if x['name']=='full-width-through-focus');self.assertEqual(focus['query']['transverseEnd'],2.)
  for stage in ('source','formal'):
   for side in ('left','right'):self.assertEqual(focus['flattening']['result']['domain'][stage+'StripRegularity'][side]['status'],'degenerate')
  one=next(x['response'] for x in self.rows if x['name']=='positive-width-left-focus')
  for stage in ('source','formal'):
   self.assertEqual(one['flattening']['result']['domain'][stage+'StripRegularity']['left']['status'],'degenerate')
   self.assertEqual(one['flattening']['result']['domain'][stage+'StripRegularity']['right']['status'],'verified')
 def test_strict_contract_and_expression_safety(self):
  for key,value in [('radius',True),('radius',1e7),('pitchAngle',11),('foldAngle','s.__class__'),('parameterEnd',0),('transverseEnd',0),('segments',7),('rulingSegments',65),('initialPoint',[1,0]),('orientation',-1)]:
   with self.assertRaises(GenericDarbouxError):query_generic_nonuniform_helix(dict(PRESET,**{key:value}))
  with self.assertRaises(GenericDarbouxError):query_generic_nonuniform_helix({'family':FAMILY})

if __name__=='__main__':unittest.main(verbosity=2)
