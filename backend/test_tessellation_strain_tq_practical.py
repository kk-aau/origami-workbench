from pathlib import Path
import sys,json,copy,unittest,math
import numpy as np
import mpmath as mp
ROOT=Path(__file__).resolve().parents[1]
from tessellation_strain_tq_practical import query_strain_tq_practical,validate_query,Kernel,_quad_energy
data=json.loads((ROOT/'tests/fixtures/strain-tq-source-1012.json').read_text(encoding='utf8'))

def changed(q,key,value):
 q=copy.deepcopy(q);q[key]=value;r=json.loads(q['sourceKey']);r[key]=value;q['sourceKey']=json.dumps(r,ensure_ascii=False,separators=(',',':'));return q

class OriginalTQ(unittest.TestCase):
 def test_all_eight_original_and_eight_creative_constraints_really_solve(self):
  for row in data['cases']:
   with self.subTest(row['name']):
    r=query_strain_tq_practical(row['query']);self.assertLess(r['residuals']['maximumOriginalConstraint'],2e-8);self.assertLess(r['residuals']['projectedGradient'],2e-5);self.assertTrue(r['solver']['engineeringChecksPassed']);self.assertTrue(r['solver']['reportedSuccess']);self.assertFalse(r['source']['originalMinimumOrBranchCertified'])
 def test_original_quad_energy_literal_mp80_and_gradient(self):
  with mp.workdps(80):
   for angle in [-.7,0,.6,2.1]:
    p=np.array([[0,0,0],[math.cos(angle),.5,math.sin(angle)],[0,1,0],[-1,.5,0]],float)
    for sign in [-1,1]:
     value,grad=_quad_energy(p,sign);expected=(1+sign*mp.cos(mp.mpf(angle)))/2;self.assertLess(abs(value-float(expected)),3e-15)
     numeric=np.zeros((4,3))
     for v in range(4):
      for k in range(3):
       a=p.copy();b=p.copy();a[v,k]+=1e-6;b[v,k]-=1e-6;numeric[v,k]=(_quad_energy(a,sign)[0]-_quad_energy(b,sign)[0])/2e-6
     self.assertLess(float(np.max(np.abs(numeric-grad))),3e-9)
 def test_original_full_jacobian_independent_central_differences(self):
  for row in data['cases']:
   q,cp,initial,uses=validate_query(row['query']);k=Kernel(q,cp,initial,uses);p=np.array(row['minimum']['solutionVertices3DOriginal']);x=p[k.free].ravel();rr,J,_=k.equalities(p,True);numeric=np.empty_like(J)
   for j in range(len(x)):
    a=x.copy();b=x.copy();a[j]+=2e-6;b[j]-=2e-6;numeric[:,j]=(k.equalities(k.pose(a))-k.equalities(k.pose(b)))/4e-6
   self.assertLess(float(np.max(np.abs(numeric-J))),2e-8,row['name'])
 def test_rigid_pleat_stiffness_original_specific_lower_bound(self):
  for row in data['cases']:
   if not row['name'].startswith('pleat-stiff'):continue
   end=np.array(row['recipe']['pointConstraints'][-1]['target']);D2=float(np.sum((end-np.array([0,1,0]))**2));bound=(D2-1)/4*row['recipe']['flatFoldStiffness']
   self.assertAlmostEqual(row['minimum']['energy']['objective'],bound,places=12)
 def test_product_is_not_silently_replaced_by_two_rigid_diagonals(self):
  row=next(r for r in data['cases'] if r['name']=='pleat-offset');diagonal=row['minimum']['residuals']['diagonalErrors'];self.assertTrue(any(max(abs(a),abs(b))>.001 for a,b in diagonal));self.assertLess(max(abs(a*b) for a,b in diagonal),2e-8)
 def test_source_cp_and_indices_cannot_shift_or_reorder(self):
  q=copy.deepcopy(data['cases'][0]['query']);q['verticesOriginal'][0][0]=4*np.finfo(float).eps
  with self.assertRaises(ValueError):validate_query(q)
  q=copy.deepcopy(data['cases'][0]['query']);q['edges'][0],q['edges'][1]=q['edges'][1],q['edges'][0]
  with self.assertRaises(ValueError):validate_query(q)
 def test_raw_unchanged_initial_and_nonfinite_rejected(self):
  for field,value in [('initialVertices3DOriginal',[[float('nan'),0,0]]*8),('verticesOriginal',[[0,0]]*8)]:
   q=copy.deepcopy(data['cases'][0]['query']);q[field]=value
   with self.assertRaises(ValueError):validate_query(q)
  q=copy.deepcopy(data['cases'][0]['query']);q['initialVertices3DOriginal'][1][2]=1e-15
  with self.assertRaises(ValueError):validate_query(q)
 def test_degenerate_plane_duplicate_points_unknown_gravity_rejected(self):
  q=changed(data['cases'][0]['query'],'planeConstraints',[{'vertices':[1,2],'point':[0,0,0],'normal':[0,0,0]}])
  with self.assertRaises(ValueError):validate_query(q)
  q=changed(data['cases'][0]['query'],'pointConstraints',[{'vertex':0,'target':[0,0,0]},{'vertex':0,'target':[0,0,1]}])
  with self.assertRaises(ValueError):validate_query(q)
  q=copy.deepcopy(data['cases'][0]['query']);q['StrainGravity']=1
  with self.assertRaises(ValueError):validate_query(q)
 def test_unreachable_original_target_is_rejected_without_old_adoption(self):
  row=next(r for r in data['cases'] if r['name']=='pleat-stiff');p=copy.deepcopy(row['recipe']['pointConstraints']);p[-1]['target']=[20,20,20];q=changed(row['query'],'pointConstraints',p)
  with self.assertRaises(ValueError):query_strain_tq_practical(q)
 def test_unused_theta2_does_not_create_fake_independent_opening(self):
  row=next(r for r in data['cases'] if r['name']=='waterbomb-base');w=copy.deepcopy(row['recipe']['waterbombAngles']);w['unusedTheta2Deg']=70;q=changed(row['query'],'waterbombAngles',w);r=query_strain_tq_practical(q)
  self.assertTrue(r['source']['unusedTheta2']);self.assertEqual(r['solutionVertices3DOriginal'],row['minimum']['solutionVertices3DOriginal'])
if __name__=='__main__':unittest.main(verbosity=2)
