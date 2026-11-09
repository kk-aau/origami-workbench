import copy,json,math,sys,unittest
from pathlib import Path
import mpmath as mp
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_conic_section_generic import *
from tessellation_curved_conic_section_generic import _literal_rows,_branch

def cases():
 rows=[]
 def add(name,**changes):rows.append(dict(name=name,query=dict(PRESET,**changes)))
 left={'infinity':-1};right={'infinity':1}
 for name,l,r,h,k,end in [('saved-line',left,right,-1,1,math.pi/2),('saved-circle',-1,-1,-.5,.5,math.pi/2),
  ('saved-parabola-left',left,-1,-1.5,1.5,math.pi/2),('saved-parabola-right',-1,right,-.5,1,math.pi/2),
  ('saved-ellipse',-2,-1,-1.5,1,math.pi/2),('saved-hyperbola',-2,1,-1.5,.5,math.pi/4)]:
  add(name,leftFocus=l,rightFocus=r,leftCross=h,rightCross=k,parameterRanges=[[0,end]])
 add('changed-ellipse')
 add('positive-circle',leftFocus=2.3,rightFocus=2.3,leftCross=2.3,rightCross=-.7,parameterRanges=[[-2,2],[4,5]])
 add('positive-parabola-left',leftFocus=left,rightFocus=1.7,leftCross=2.4,rightCross=-3.1,parameterRanges=[[-2,1]])
 add('positive-parabola-right',leftFocus=.6,rightFocus=right,leftCross=4,rightCross=-1.2,parameterRanges=[[-1.4,1.7]])
 add('positive-ellipse',leftFocus=.7,rightFocus=2.3,leftCross=1.3,rightCross=1.1,parameterRanges=[[4,5],[-1.2,.3]])
 add('hyperbola-both-branches',leftFocus=-2,rightFocus=1,leftCross=.7,rightCross=-.9,parameterRanges=[[-.7,.9],[1.6,2.4]])
 add('degenerate-opposite-foci',leftFocus=-1,rightFocus=1,leftCross=0,rightCross=-1,parameterRanges=[[-.5,.6],[2,2.7]])
 add('tiny-ellipse',leftFocus=-2.5e-9,rightFocus=-.75e-9,leftCross=-1.2e-9,rightCross=.9e-9)
 add('near-half-angle-endpoint-unknown',parameterRanges=[[.1,math.pi]])
 add('four-independent-ranges',parameterRanges=[[4,4.4],[-2,-1.7],[.1,.7],[7,7.5]])
 return rows

def reference(q,t):
 # 80-digit literal FractionBox replay, without production stabilization.
 with mp.workdps(max(80,mp.mp.dps)):
  t=mp.mpf(t);l=q['leftFocus'];r=q['rightFocus'];h=mp.mpf(q['leftCross']);k=mp.mpf(q['rightCross'])
  l=None if isinstance(l,dict) else mp.mpf(l);r=None if isinstance(r,dict) else mp.mpf(r)
  c,s=mp.cos(t),mp.sin(t);z=mp.mpf(0)
  if l is None and r is None:f=[z,t];L=E=[h,t];R=H=[k,t];d=e=[-1,z]
  elif l==r:
   f=[l-l*c,-l*s];L=R=[l,z];d=e=[-c,-s];E=[l+(h-l)*c,(h-l)*s];H=[l+(k-l)*c,(k-l)*s]
  elif l is None or r is None:
   a=r if l is None else l;D=4*a*a+t*t;f=[t*t/(4*a),t];fixed=[a,z];direction=[1-8*a*a/D,4*a*t/D];v=k if l is None else h
   second=[(4*a*a*v+(2*a-v)*t*t)/D,4*a*(a-v)*t/D]
   if l is None:L=E=[h,t];d=[-1,z];R=fixed;e=direction;H=second
   else:R=H=[k,t];e=[-1,z];L=fixed;d=direction;E=second
  else:
   den=l+r+(r-l)*c;v=mp.tan(t/2);D=r*r+l*l*v*v
   f=[l-2*l*r*c/den,-2*l*r*s/den];L=[l,z];d=[-c,-s];E=[l+(h-l)*c,(h-l)*s]
   R=[r,z];e=[1-2*r*r/D,-2*l*r*v/D];H=[-k+2*r*(1+r*(k-r)/D),2*l*r*(k-r)*v/D]
  return [f,L,d,L,E,R,e,R,H]

class ConicNativeProbe(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.rows=[dict(c,response=query_generic_conic_section(c['query'])) for c in cases()]
  saved=json.loads((ROOT/'tests/fixtures/curved-conic-section-native-20261001.json').read_text(encoding='utf8'))
  if [(c['name'],c['query']) for c in saved]!=[(c['name'],c['query']) for c in cls.rows]:
   raise AssertionError('永久来源快照须绑定全部16个真实原参数。')
 def case(self,name):return next(x['response'] for x in self.rows if x['name']==name)
 def test_literal_nine_rules_80digit_all_parameters_and_derivatives(self):
  for c in self.rows:
   r=c['response'];self.assertEqual(r['query'],c['query']);self.assertEqual(r['source']['ruleKeys'],list(KEYS));self.assertFalse(r['source']['halfAngleContinuationApplied'])
   for component in r['components']:
    for row in component['samples'][::6]:
     t=row['t'];expected=reference(c['query'],t)
     for k,values in enumerate(expected):
      for i,v in enumerate(values):
       # World point and direction each use their own physical scale.
       ref=r['normalization']['scale'] if k in POSITION_INDICES else 1.
       self.assertLessEqual(abs(row['rules'][k][i]-float(v)),4e-13*max(abs(float(v)),ref))
       if c['name']=='near-half-angle-endpoint-unknown' and t==math.pi:continue
       with mp.workdps(70):d=mp.diff(lambda z:reference(c['query'],z)[k][i],mp.mpf(t))
       self.assertLessEqual(abs(row['derivatives'][k][i]-float(d)),8e-12*max(abs(float(d)),ref))
 def test_real_both_branches_keep_component_ids_and_no_reorder(self):
  r=self.case('hyperbola-both-branches');self.assertEqual(r['source']['branch'],'hyperbola');a,b=r['components']
  self.assertEqual(a['rangeIndex'],0);self.assertEqual(b['rangeIndex'],1);self.assertGreater(a['samples'][0]['rules'][0][0],-.5);self.assertLess(b['samples'][0]['rules'][0][0],-.5)
  r=self.case('positive-ellipse');self.assertEqual(r['components'][0]['parameterRange'],[4,5]);self.assertEqual(r['components'][1]['parameterRange'],[-1.2,.3])
  self.assertEqual(len(self.case('four-independent-ranges')['components']),4)
 def test_source_classification_and_arbitrary_h_do_not_invent_geometric_gates(self):
  self.assertEqual(self.case('degenerate-opposite-foci')['source']['branch'],'degenerate-line');r=self.case('positive-circle')
  self.assertEqual(r['source']['branch'],'circle');self.assertEqual(r['query']['leftCross'],r['query']['leftFocus']);self.assertGreater(r['query']['leftCross'],r['query']['rightCross'])
  for c in self.rows:
   for key,value in c['response']['diagnostics'].items():self.assertLess(value,2e-12,(c['name'],key,value))
   self.assertFalse(c['response']['certification']['adoptableCreasePattern']);self.assertFalse(c['response']['source']['numericWolframOutAvailable'])
 def test_true_poles_abort_complete_source_domains_and_no_automatic_trim(self):
  for changes in [dict(leftFocus=-2,rightFocus=1,parameterRanges=[[0,2]]),dict(parameterRanges=[[2,4]]),dict(leftFocus=-1,rightFocus=1,parameterRanges=[[1,2]])]:
   with self.assertRaisesRegex(GenericConicSectionError,'source-pole'):query_generic_conic_section(dict(PRESET,**changes))
  # circle precedes the finite general branch; there is no Tan half-angle pole.
  query_generic_conic_section(dict(PRESET,leftFocus=2,rightFocus=2,parameterRanges=[[2,4]]))
 def test_interval_unknown_keeps_all_domains_and_nine_rules(self):
  r=self.case('near-half-angle-endpoint-unknown');self.assertFalse(r['domain']['certified']);self.assertTrue(r['domain']['unresolved']);self.assertEqual(r['components'][0]['samples'][-1]['t'],math.pi)
  with patch('tessellation_curved_conic_section_generic.BUDGET',1):r=query_generic_conic_section(PRESET)
  self.assertFalse(r['domain']['certified']);self.assertEqual(r['query'],PRESET);self.assertEqual(len(r['components'][0]['samples']),49)
 def test_strict_focus_tags_ranges_and_source_numerics(self):
  for key,value in [('leftFocus',0),('rightFocus',0),('leftFocus',{'infinity':1}),('rightFocus',{'infinity':-1}),('leftFocus',None),('leftFocus',float('inf')),
    ('leftFocus',{'infinity':-1,'label':'left'}),('rightFocus',True),('leftCross',float('nan')),('parameterRanges',[[0,1],[.5,2]]),('parameterRanges',[[1,0]]),('segments',7),('segments',True),('extra',1)]:
   with self.assertRaises(GenericConicSectionError):query_generic_conic_section(dict(PRESET,**{key:value}))
  with self.assertRaisesRegex(GenericConicSectionError,'source-numerics'):query_generic_conic_section(dict(PRESET,leftFocus=-1e-300,rightFocus=-2e-300))

if __name__=='__main__':unittest.main(verbosity=2)

