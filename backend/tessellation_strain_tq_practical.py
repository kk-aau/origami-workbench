"""Finite literal StrainTQMesh In2656 equations, locally solved with SciPy.

No Wolfram execution, unrestricted expressions, gravity imitation, point
welding, or claim of the same numerical branch as Mathematica FindMinimum.
"""
import math,json,time
import numpy as np
from scipy.optimize import least_squares,minimize
from scipy.linalg import qr
from scipy.sparse import csr_matrix
from strain_tq_source_bases import validate_original_base

NB='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
MODELS={'pleat-free','pleat-stiff','pleat-offset','plane-pair','plane-point','waterbomb-3','waterbomb-5','waterbomb-base'}
CONSTRAINT=2e-8

def _num(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def _point(p,n):return isinstance(p,list) and len(p)==n and all(_num(x) and abs(x)<=20 for x in p)

def validate_query(raw):
 keys={'schema','sourceKey','model','unitMm','verticesOriginal','edges','faces','assignments','initialVertices3DOriginal','pointConstraints','planeConstraints','quadBendStiffness','flatFoldStiffness','constrainFromAssignment','waterbombAngles'}
 if not isinstance(raw,dict) or set(raw)!=keys or raw['schema']!='original-in2656-bounded-query-v1' or raw['model'] not in MODELS:raise ValueError('原TQ有限查询字段或模型无效。')
 if not isinstance(raw['sourceKey'],str) or not 1<=len(raw['sourceKey'])<=40000:raise ValueError('当前源参数key无效。')
 try:r=json.loads(raw['sourceKey'])
 except (ValueError,TypeError):raise ValueError('当前源参数key不是完整配方。')
 if not isinstance(r,dict) or any(r.get(k)!=raw[k] for k in ['model','unitMm','pointConstraints','planeConstraints','quadBendStiffness','flatFoldStiffness','constrainFromAssignment','waterbombAngles']):raise ValueError('原TQ查询与源配方不一致。')
 if not _num(raw['unitMm']) or not 1<=raw['unitMm']<=1000:raise ValueError('毫米单位倍率须为1–1000；只转换一次。')
 vs,es,fs,p=raw['verticesOriginal'],raw['edges'],raw['faces'],raw['initialVertices3DOriginal']
 expected=8 if raw['model'].startswith('pleat') else 12 if raw['model'].startswith('plane') else 7 if raw['model']=='waterbomb-base' else 38 if raw['model']=='waterbomb-3' else 93
 if not isinstance(vs,list) or len(vs)!=expected or any(not _point(v,2) for v in vs) or not isinstance(p,list) or len(p)!=len(vs) or any(not _point(v,3) for v in p):raise ValueError('原保存例顶点数量/初态或坐标无效。')
 V=len(vs)
 def ids(v):return isinstance(v,list) and all(isinstance(i,int) and not isinstance(i,bool) and 0<=i<V for i in v)
 if not isinstance(es,list) or not 10<=len(es)<=260 or any(not ids(e) or len(e)!=2 or e[0]==e[1] for e in es) or len({tuple(sorted(e)) for e in es})!=len(es):raise ValueError('原TQ边无效或重复，未静默删除。')
 if not isinstance(fs,list) or not 3<=len(fs)<=150 or any(not ids(f) or len(f) not in [3,4] or len(set(f))!=len(f) for f in fs):raise ValueError('有限原TQ只支持三角和四边面。')
 if not isinstance(raw['assignments'],list) or len(raw['assignments'])!=len(es) or any(a not in ['B','M','V'] for a in raw['assignments']):raise ValueError('原赋型无效，不能猜测U/B映射。')
 uses={tuple(sorted(e)):[] for e in es}
 for fi,f in enumerate(fs):
  if sum(vs[a][0]*vs[f[(k+1)%len(f)]][1]-vs[f[(k+1)%len(f)]][0]*vs[a][1] for k,a in enumerate(f))<=0:raise ValueError('原实际纸面须非退化且逆时针。')
  for k,a in enumerate(f):
   b=f[(k+1)%len(f)];key=tuple(sorted([a,b]))
   if key not in uses:raise ValueError('原实际面缺原边。')
   uses[key].append((fi,a,b))
 if V-len(es)+len(fs)!=1 or any(len(x) not in [1,2] or len(x)==2 and x[0][1:]==x[1][1:] for x in uses.values()):raise ValueError('原纸面拓扑须为单张无孔且半边身份有效。')
 pc,pl=raw['pointConstraints'],raw['planeConstraints']
 if not isinstance(pc,list) or not 1<=len(pc)<=12 or any(not isinstance(c,dict) or set(c)!={'vertex','target'} or not ids([c['vertex']]) or not _point(c['target'],3) for c in pc) or len({c['vertex'] for c in pc})!=len(pc):raise ValueError('点约束须为1–12个不同原顶点与有限XYZ目标。')
 if not isinstance(pl,list) or len(pl)>6 or any(not isinstance(c,dict) or set(c)!={'vertices','point','normal'} or not ids(c['vertices']) or not c['vertices'] or len(set(c['vertices']))!=len(c['vertices']) or not _point(c['point'],3) or not _point(c['normal'],3) or np.linalg.norm(c['normal'])<1e-8 for c in pl):raise ValueError('平面约束须保原点/非零法向和顶点身份。')
 qbs,ffs=raw['quadBendStiffness'],raw['flatFoldStiffness']
 if qbs!='rigid' and (not _num(qbs) or not 0<=qbs<=20) or not _num(ffs) or not 0<=ffs<=20 or not isinstance(raw['constrainFromAssignment'],bool):raise ValueError('原面弯曲和折痕平折硬度须为0–20或四边形刚性。')
 wa=raw['waterbombAngles']
 if raw['model']=='waterbomb-base':
  if not isinstance(wa,dict) or set(wa)!={'openingDeg','skewDeg','unusedTheta2Deg'} or any(not _num(v) for v in wa.values()) or not 10<=wa['openingDeg']<=120 or abs(wa['skewDeg'])>20 or not 0<=wa['unusedTheta2Deg']<=180:raise ValueError('原水雷基础形有限opening10–120°、skew±20°；θ2原未使用。')
 elif wa is not None:raise ValueError('非水雷基础形不接受额外角度约束。')
 validate_original_base(raw)
 # Necessary original edge-isometry reach bound, before an expensive solver.
 import heapq
 adjacency=[[] for _ in vs]
 for a,b in es:
  length=math.dist(vs[a],vs[b]);adjacency[a].append((b,length));adjacency[b].append((a,length))
 for c in pc:
  distance=[float('inf') for _ in vs];distance[c['vertex']]=0.;heap=[(0.,c['vertex'])]
  while heap:
   d,a=heapq.heappop(heap)
   if d!=distance[a]:continue
   for b,length in adjacency[a]:
    if d+length<distance[b]:distance[b]=d+length;heapq.heappush(heap,(d+length,b))
  for other in pc:
   limit=distance[other['vertex']]
   if math.dist(c['target'],other['target'])>limit+4e-12*max(1,limit):raise ValueError('点目标超过原边等距可达上界，保留参数，不采用旧图。')
 return raw,np.asarray(vs,dtype=float),np.asarray(p,dtype=float),uses

def _quad_energy(p,sign):
 a,b,c=p[1]-p[0],p[2]-p[0],p[3]-p[0];n1=np.cross(a,b);n2=np.cross(b,c);l1=np.linalg.norm(n1);l2=np.linalg.norm(n2);d=np.linalg.norm(b)
 if min(l1,l2,d)<1e-12:raise ValueError('原能量试步法向/对角退化。')
 cosine=float(n1@n2/(l1*l2));g1=n2/(l1*l2)-cosine*n1/(l1*l1);g2=n1/(l1*l2)-cosine*n2/(l2*l2)
 ga=np.cross(b,g1);gb=np.cross(g1,a)+np.cross(c,g2);gc=np.cross(g2,b)
 grad=np.zeros((4,3));grad[1]=d*sign*ga/2;grad[2]=b/d*(1+sign*cosine)/2+d*sign*gb/2;grad[3]=d*sign*gc/2;grad[0]=-grad[1:].sum(axis=0)
 return d*(1+sign*cosine)/2,grad

class Kernel:
 def __init__(self,q,cp,initial,uses):
  self.q=q;self.cp=cp;self.initial=initial;self.edges=np.asarray(q['edges']);self.quads=[f for f in q['faces'] if len(f)==4];self.lengths=np.linalg.norm(cp[self.edges[:,0]]-cp[self.edges[:,1]],axis=1);self.V=len(cp);self.neighborhoods=[]
  for ei,(a,b) in enumerate(q['edges']):
   u=uses[tuple(sorted([a,b]))]
   if len(u)==2:
    left=next(t[0] for t in u if t[1:]==(a,b));right=next(t[0] for t in u if t[1:]==(b,a));self.neighborhoods.append((ei,a,q['faces'][right],b,q['faces'][left]))
  self.fixed={c['vertex']:np.asarray(c['target'],dtype=float) for c in q['pointConstraints']};self.free=np.asarray([v for v in range(self.V) if v not in self.fixed]);self.x0=initial[self.free].ravel()
 def pose(self,x):
  p=self.initial.copy();p[self.free]=np.asarray(x).reshape(-1,3)
  for v,t in self.fixed.items():p[v]=t
  return p
 def distance(self,p,a,b):
  v=p[a]-p[b];l=np.linalg.norm(v);base=np.linalg.norm(self.cp[a]-self.cp[b]);g=np.zeros((self.V,3))
  if min(l,base)<1e-12:raise ValueError('原等距试步产生零长边。')
  g[a]=v/(l*base);g[b]=-g[a];return l/base-1,g
 def angle_values(self,p):
  # In2664 literally reads theta1 in both independent opening equations.
  q=self.q['waterbombAngles']
  if q is None:return np.zeros(0)
  v1,v2,v4,v6,v7=p[[0,1,3,5,6]];a=v6-v4;b=v1-v4;c=v7-v4;d=v2-v4
  norm=lambda z:z/np.linalg.norm(z)
  lower=(v1+v2)/2-v4;upper=((v6+v7)/2-v4)*np.array([1.,1.,0.])
  return np.asarray([p[3,2],p[1,2],norm(a)@norm(b)-math.cos(math.radians(q['openingDeg'])),norm(c)@norm(d)-math.cos(math.radians(q['openingDeg'])),np.cross(lower,norm(upper))[2]-math.sin(math.radians(q['skewDeg']))])
 def equalities(self,p,jac=False,chart=None):
  rows=[];gs=[];diag=[]
  for a,b in self.q['edges']:
   v,g=self.distance(p,a,b);rows.append(v);gs.append(g)
  for qi,(a,b,c,d) in enumerate(self.quads):
   u,gu=self.distance(p,a,c);v,gv=self.distance(p,b,d);diag.append([u,v])
   if self.q['quadBendStiffness']=='rigid':rows.extend([u,v]);gs.extend([gu,gv])
   elif chart is not None:rows.append(u if chart[qi]==0 else v);gs.append(gu if chart[qi]==0 else gv)
   else:rows.append(u*v);gs.append(v*gu+u*gv)
  for plane in self.q['planeConstraints']:
   n=np.asarray(plane['normal']);pt=np.asarray(plane['point'])
   for v in plane['vertices']:
    g=np.zeros((self.V,3));g[v]=n;rows.append(float((p[v]-pt)@n));gs.append(g)
  if self.q['waterbombAngles'] is not None:
   av=self.angle_values(p);rows.extend(av);grad=np.zeros((len(av),self.V,3))
   # Five finite, original nonlinear constraints; central differences affect
   # only the solver Jacobian, never original equations or saved geometry.
   for v in [0,1,3,5,6]:
    for k in range(3):
     h=2e-6;pa=p.copy();pb=p.copy();pa[v,k]+=h;pb[v,k]-=h;grad[:,v,k]=(self.angle_values(pa)-self.angle_values(pb))/(2*h)
   gs.extend(grad)
  rr=np.asarray(rows);jj=np.asarray(gs)[:,self.free,:].reshape(len(rows),-1)
  return (rr,jj,diag) if jac else rr
 def inequalities(self,p):
  if not self.q['constrainFromAssignment']:return np.zeros(0)
  r=[]
  for ei,a,f1,b,f2 in self.neighborhoods:
   p1=p[a];p2=p[f1].mean(axis=0);p3=p[b];p4=p[f2].mean(axis=0);n1=np.cross(p2-p1,p3-p1);n2=np.cross(p3-p1,p4-p1);axis=p3-p1
   s=float(np.cross(n1/np.linalg.norm(n1),n2/np.linalg.norm(n2))@axis/np.linalg.norm(axis));r.append(s if self.q['assignments'][ei]=='V' else -s)
  return np.asarray(r)
 def energy(self,p,full=False):
  e=0.;g=np.zeros_like(p);bend=flat=0.;qbs=self.q['quadBendStiffness'];ffs=self.q['flatFoldStiffness']
  if qbs!='rigid' and qbs!=0:
   for f in self.quads:
    for order in [f,f[1:]+f[:1]]:
     v,dg=_quad_energy(p[order],-1);bend+=qbs*v;np.add.at(g,order,qbs*dg)
  if ffs:
   for ei,a,f1,b,f2 in self.neighborhoods:
    points=np.asarray([p[a],p[f1].mean(axis=0),p[b],p[f2].mean(axis=0)]);v,dg=_quad_energy(points,1);flat+=ffs*v;g[a]+=ffs*dg[0];g[b]+=ffs*dg[2]
    np.add.at(g,f1,np.tile(ffs*dg[1]/len(f1),(len(f1),1)));np.add.at(g,f2,np.tile(ffs*dg[3]/len(f2),(len(f2),1)))
  return bend+flat,g if full else g[self.free].ravel(),{'quadBendEnergyWeighted':bend,'edgeFlatFoldEnergyWeighted':flat,'objective':bend+flat}

def _rigid_pleat_chart(k):
 """Exact rigid-strip coordinate chart, not a replacement objective.

 Every quad keeps both original diagonals. With the first vertical edge fixed,
 the common parallel edges force this three-link extrusion chart. The original
 edge/diagonal/point/plane constraints are all checked on the resulting pose.
 """
 if not k.q['model'].startswith('pleat') or k.q['quadBendStiffness']!='rigid' or 0 not in k.fixed or 4 not in k.fixed:return None
 origin=k.fixed[0];axis=k.fixed[4]-origin
 if abs(np.linalg.norm(axis)-1)>2e-12:raise ValueError('原刚性褶带两固定边端点必须保持原单位边长1；未移动纸面。')
 axis=axis/np.linalg.norm(axis);u=np.array([1.,0.,0.]);u-=axis*(u@axis)
 if np.linalg.norm(u)<1e-8:u=np.array([0.,0.,1.]);u-=axis*(u@axis)
 u/=np.linalg.norm(u);v=np.cross(u,axis)
 def state(theta):
  p=np.zeros((8,3));D=np.zeros((8,3,3));p[0]=origin
  for j in range(3):
   p[j+1]=p[j]+u*math.cos(theta[j])+v*math.sin(theta[j]);D[j+1]=D[j];D[j+1,:,j]=-u*math.sin(theta[j])+v*math.cos(theta[j])
  p[4:]=p[:4]+axis;D[4:]=D[:4];return p,D
 def external(theta,jac=False):
  p,D=state(theta);rr=[];jj=[]
  for c in k.q['pointConstraints']:
   if c['vertex'] in [0,4]:continue
   rr.extend(p[c['vertex']]-np.asarray(c['target']));jj.extend(D[c['vertex']])
  for c in k.q['planeConstraints']:
   n=np.asarray(c['normal']);pt=np.asarray(c['point'])
   for i in c['vertices']:rr.append((p[i]-pt)@n);jj.append(n@D[i])
  return (np.asarray(rr),np.asarray(jj).reshape(-1,3)) if jac else np.asarray(rr)
 x0=np.array([0.,math.pi,0.]);restored=least_squares(external,x0,jac=lambda z:external(z,True)[1],max_nfev=1200,ftol=1e-13,xtol=1e-13,gtol=1e-13)
 if len(external(restored.x)) and np.max(np.abs(external(restored.x)))>CONSTRAINT:raise ValueError('原刚性褶带目标不在本次可达范围，不能采用旧图。')
 theta=restored.x;J=external(theta,True)[1];Q,R,pivot=qr(J.T,pivoting=True,mode='economic');dd=np.abs(np.diag(R));rank=int(np.sum(dd>1e-10*max(1,dd[0] if len(dd) else 0)));chosen=np.sort(pivot[:rank])
 def fg(z):
  p,D=state(z);ev,g,parts=k.energy(p,True);return ev,np.einsum('ij,ijk->k',g,D)
 cons=[]
 if rank:cons.append({'type':'eq','fun':lambda z:external(z)[chosen],'jac':lambda z:external(z,True)[1][chosen]})
 if k.q['constrainFromAssignment']:cons.append({'type':'ineq','fun':lambda z:k.inequalities(state(z)[0])})
 answer=minimize(lambda z:fg(z)[0],theta,jac=lambda z:fg(z)[1],constraints=cons,method='SLSQP',options={'maxiter':400,'ftol':1e-13})
 p,D=state(answer.x);ev,eg=fg(answer.x);J=external(answer.x,True)[1];projected=float(np.max(np.abs(eg-J.T@np.linalg.lstsq(J.T,eg,rcond=1e-10)[0]))) if len(J) else float(np.max(np.abs(eg)))
 # Hard selected point constraints remain literal values, as in the general
 # exact elimination. Recheck every original metric after this assignment.
 for i,t in k.fixed.items():p[i]=t
 rr,JJ,diag=k.equalities(p,True);iv=k.inequalities(p)
 if np.max(np.abs(rr))>CONSTRAINT or (len(iv) and min(iv)<-CONSTRAINT) or not answer.success and abs(ev)>1e-10 or projected>2e-5 and abs(ev)>1e-10:raise ValueError('原刚性褶带能量或完整约束未通过。')
 return p,projected,[{'phase':'exact-valid-rigid-pleat-chart','definition':'three rigid quad links sharing parallel unit-height edges; all original diagonal constraints checked','anglesSeed':[0,math.pi,0],'constraintRestorationEvaluations':int(restored.nfev),'reportedSuccess':bool(answer.success),'message':str(answer.message),'iterations':int(answer.nit),'projectedGradientOnOriginalValidChart':projected,'allOriginalConstraintsRechecked':True,'original2DVerticesUnchanged':True}]

def query_strain_tq_practical(raw):
 q,cp,initial,uses=validate_query(raw);k=Kernel(q,cp,initial,uses);start=time.perf_counter();history=[]
 rigid=_rigid_pleat_chart(k)
 if rigid is not None:
  p,projected,history=rigid
  return _result(q,k,p,projected,history,start)
 if len(k.x0)<1:raise ValueError('此有限入口需要至少一个自由顶点。')
 def res(x):return k.equalities(k.pose(x))
 def jac(x):return csr_matrix(k.equalities(k.pose(x),True)[1])
 # Exact elimination of selected point equalities. All original constraints,
 # including the eliminated equations, are independently rechecked afterward.
 chart=[0 for f in k.quads] if q['quadBendStiffness']!='rigid' and k.quads else None
 if chart is not None:
  res=lambda x:k.equalities(k.pose(x),chart=chart)
  jac=lambda x:csr_matrix(k.equalities(k.pose(x),True,chart=chart)[1])
  history.append({'phase':'selected-original-diagonal-union-chart','choices':chart,'equivalence':'Each choice sets one factor zero; original product and both errors rechecked. Local branch, not Wolfram or global minimum.'})
 feasible=least_squares(res,k.x0,jac=jac,method='trf',tr_solver='lsmr',ftol=1e-12,xtol=1e-12,gtol=1e-12,max_nfev=1400,bounds=(-20,20))
 x=feasible.x;history.append({'phase':'full-original-equality-restoration','reportedSuccess':bool(feasible.success),'nfev':int(feasible.nfev),'maximumResidual':float(np.max(np.abs(res(x))))})
 if np.max(np.abs(res(x)))>CONSTRAINT:raise ValueError('原TQ约束没有在本次数值预算内找到有效平衡；保留参数，不采用旧图。')
 converged=False;projected=float('inf');rank=0;answer=None
 for round_index in range(3):
  p=k.pose(x);rr,J,diag=k.equalities(p,True,chart=chart);Q,R,pivot=qr(J.T,pivoting=True,mode='economic');dd=np.abs(np.diag(R));rank=int(np.sum(dd>1e-9*max(dd[0] if len(dd) else 0,1)));selected=np.sort(pivot[:rank])
  constraints=[{'type':'eq','fun':lambda z:k.equalities(k.pose(z),chart=chart)[selected],'jac':lambda z:k.equalities(k.pose(z),True,chart=chart)[1][selected]}]
  if q['constrainFromAssignment']:constraints.append({'type':'ineq','fun':lambda z:k.inequalities(k.pose(z))})
  def fun(z):return k.energy(k.pose(z))[0]
  def grad(z):return k.energy(k.pose(z))[1]
  answer=minimize(fun,x,jac=grad,constraints=constraints,method='SLSQP',options={'maxiter':650,'ftol':1e-12})
  candidate=answer.x;p=k.pose(candidate);chart_rr,J,diag=k.equalities(p,True,chart=chart);rr=k.equalities(p);energy,eg,parts=k.energy(p)
  if rank:
   multipliers=np.linalg.lstsq(J.T,eg,rcond=1e-9)[0];projected=float(np.max(np.abs(eg-J.T@multipliers)))
  else:projected=float(np.max(np.abs(eg)))
  maximum=float(np.max(np.abs(rr)));iv=k.inequalities(p);inminimum=float(np.min(iv)) if len(iv) else 0.
  history.append({'phase':'original-objective-constrained-minimum','round':round_index,'reportedSuccess':bool(answer.success),'message':str(answer.message),'iterations':int(answer.nit),'independentEqualityRows':rank,'allOriginalEqualityRows':len(rr),'maximumFullOriginalResidual':maximum,'minimumOriginalAssignmentInequality':inminimum,'objective':energy,'projectedGradient':projected})
  x=candidate
  if maximum<=CONSTRAINT and inminimum>=-CONSTRAINT and (answer.success or abs(energy)<=1e-10) and (projected<=2e-5 or abs(energy)<=1e-10):converged=True;break
  # Complete constraints, never silently accept omitted QR rows.
  restored=least_squares(res,x,jac=jac,tr_solver='lsmr',ftol=1e-12,xtol=1e-12,gtol=1e-12,max_nfev=600,bounds=(-20,20));x=restored.x
 if not converged:
  error=ValueError('原完整约束或能量驻定未通过；本次有限工程求解不采用。');error.diagnostics=history;raise error
 return _result(q,k,k.pose(x),projected,history,start)

def _result(q,k,p,projected,history,start):
 if not np.all(np.isfinite(p)) or np.max(np.abs(p))>20 or not math.isfinite(projected):raise ValueError('原TQ平衡未产生有限域内坐标或驻定值，不能采用。')
 rr,J,diag=k.equalities(p,True);ev,eg,parts=k.energy(p);points=[float(np.max(np.abs(p[c['vertex']]-np.asarray(c['target'])))) for c in q['pointConstraints']]
 if not np.all(np.isfinite(rr)) or not math.isfinite(ev) or max(np.abs(rr),default=0)>CONSTRAINT or max(points,default=0)!=0:raise ValueError('原完整约束/原能量或硬点约束未通过，不能采用。')
 minimum_diagonal=max((min(abs(a),abs(b)) for a,b in diag),default=0.)
 if minimum_diagonal>2e-7:raise ValueError('原对角乘积虽小，但没有实际近等长对角，未认证有效材料。')
 raw_success=history[-1].get('reportedSuccess') is True
 return {'schema':'original-in2656-engineering-minimum-v1','sourceKey':q['sourceKey'],'query':q,'solutionVertices3DOriginal':p.tolist(),'energy':parts,'residuals':{'maximumOriginalConstraint':float(np.max(np.abs(rr))),'originalEqualityValues':rr.tolist(),'pointEqualityValues':points,'diagonalErrors':diag,'maximumMinimumDiagonalError':minimum_diagonal,'assignmentInequalityValues':k.inequalities(p).tolist(),'projectedGradient':projected},'solver':{'method':'scipy-original-diagonal-union-charts+SLSQP-original-energy','reportedSuccess':raw_success,'engineeringChecksPassed':True,'zeroOriginalEnergyFeasibleWithoutOptimizerSuccess':not raw_success and abs(ev)<=1e-10,'originalInitialVerticesRetained':True,'pointEqualitiesEliminatedExactly':True,'independentBasisAllOriginalRowsRechecked':True,'history':history,'elapsedSeconds':time.perf_counter()-start},'source':{'notebookSHA256':NB,'definitionCell':'In[2656]','quadBendCells':['In[2640]','In[2642]'],'flatFoldEnergyCells':['In[2643]','In[2645]'],'gravityDeclaredButUnused':True,'unusedTheta2':q['model']=='waterbomb-base','WolframExecuted':False,'originalMinimumOrBranchCertified':False,'staticSceneCertified':False,'continuousMotionCertified':False},'numericalPolicy':{'originalConstraintAbsolute':CONSTRAINT,'actualOneDiagonalRelative':2e-7,'projectedGradientAbsolute':2e-5,'originalCoordinateSolve':True,'intervalCertificate':False}}
