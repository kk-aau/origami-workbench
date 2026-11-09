from pathlib import Path
import unittest,json,sys,copy,math
import numpy as np
ROOT=Path(__file__).resolve().parents[1];FIXTURE=json.loads((ROOT/'tests/fixtures/rotational-pleats-engineering-roots-1012.json').read_text(encoding='utf8'))['cases']
import tessellation_rotational_pleats_strain as native
def query(name='rectangle'):return copy.deepcopy(FIXTURE[name]['query'])
class LiteralRootTests(unittest.TestCase):
 def test_actual_original_roots_full_init_and_separate_nonrigidity(self):
  for model in ('canonical','goblet','rectangle','trapezoid'):
   q=query(model);r=native.query_rotational_pleats_strain(q);old=FIXTURE[model]
   # A singular engineering root is not a unique cross-runtime byte fixture.
   # Its original query, source declaration and unmoved initial anchor are exact.
   self.assertEqual(r['query'],old['query']);self.assertEqual(r['source'],old['source']);self.assertEqual(r['solver']['stationaryAnchorUntranslated'],old['solver']['stationaryAnchorUntranslated']);self.assertTrue(r['solver']['reportedSuccess']);self.assertTrue(r['solver']['initialSingularJacobian']);self.assertLess(r['residuals']['maximumOriginalConstraint'],2e-9);self.assertLess(r['residuals']['maximumMinimumDiagonalError'],2e-8);self.assertGreater(max(max(abs(x) for x in row) for row in r['residuals']['diagonalErrors']),.001);self.assertFalse(r['source']['rigidSceneCertified'])
   cp=np.asarray(q['verticesMm'],dtype=float);p=np.asarray(r['solutionVertices3D'],dtype=float)
   for a,b in q['edges']:
    self.assertLess(abs(np.linalg.norm(p[a]-p[b])/np.linalg.norm(cp[a]-cp[b])-1),2e-9)
   for f in q['faces']:
    errors=[np.linalg.norm(p[f[a]]-p[f[b]])/np.linalg.norm(cp[f[a]]-cp[f[b]])-1 for a,b in ((0,2),(1,3))]
    self.assertLess(abs(errors[0]*errors[1]),2e-9);self.assertLess(min(map(abs,errors)),2e-8)
 def test_analytic_jacobian_is_derivative_of_original_product_constraints(self):
  q,cp,init=native._validate(query());p=init.copy();p[:,1]+=np.linspace(-.04,.06,len(p));p[:,2]+=np.linspace(-.02,.03,len(p));J=native.original_jacobian(q,cp,init,p);epsilon=1e-6;columns=[]
  for i in range(p.size):
   plus=p.copy().ravel();minus=p.copy().ravel();plus[i]+=epsilon;minus[i]-=epsilon
   a=native.original_constraints(q,cp,init,plus.reshape(p.shape))[0];b=native.original_constraints(q,cp,init,minus.reshape(p.shape))[0];columns.append((a-b)/(2*epsilon))
  self.assertLess(np.max(np.abs(J-np.asarray(columns).T)),2e-7)
 def test_zero_phi_retains_singular_root_as_diagnostic_not_unique_branch(self):
  q=query('canonical');q['arcDeg']=0;p=json.loads(q['sourceKey']);p['arcDeg']=0;q['sourceKey']=json.dumps(p,separators=(',',':'),ensure_ascii=False);r=native.query_rotational_pleats_strain(q)
  self.assertLess(r['residuals']['maximumOriginalConstraint'],2e-9);self.assertTrue(r['solver']['initialSingularJacobian']);self.assertFalse(r['source']['originalWolframBranchUniquelyCertified'])
 def test_effective_n_phi_variations_solve_current_source_not_old_cached_root(self):
  for n,phi in ((3,45),(2,30),(2,-30)):
   q=query();q['repetitionPairs']=n;q['arcDeg']=phi;p=json.loads(q['sourceKey']);p['repetitionPairs']=n;p['arcDeg']=phi;q['sourceKey']=json.dumps(p,separators=(',',':'),ensure_ascii=False);r=native.query_rotational_pleats_strain(q)
   self.assertEqual(r['query'],q);self.assertLess(r['residuals']['maximumOriginalConstraint'],2e-9)
 def test_abnormal_coerced_domain_zero_overlap_and_source_input_rejected(self):
  bad=[]
  for field,val in (('repetitionPairs',0),('repetitionPairs',True),('repetitionPairs',25),('arcDeg',float('nan')),('arcDeg','60'),('faces',[[0,1,2,3,4]]),('bottom',[0,1,2,3,4]),('sourceKey','run arbitrary Wolfram')):
   q=query();q[field]=val;bad.append(q)
  q=query();q['edges'].append(q['edges'][0][:]);bad.append(q)
  q=query();q['verticesMm'][1]=q['verticesMm'][0][:];bad.append(q)
  q=query();q['flatVerticesMm'][1][0]+=.01;bad.append(q)
  q=query();q['faces'][0].reverse();bad.append(q)
  q=query();q['verticesMm'][1][1]+=1;bad.append(q)
  q=query();q['unknown']='instruction';bad.append(q)
  for q in bad:
   with self.assertRaises(ValueError):native.query_rotational_pleats_strain(q)
if __name__=='__main__':unittest.main()
