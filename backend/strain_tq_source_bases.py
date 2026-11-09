"""Original saved source bases; no optimizer or TS producer imports."""
import mpmath as m
from functools import lru_cache
def graph(nx,ny,t):
 t=m.mpf(str(t)); h=m.mpf('.5'); d=1+t*t;s=m.sqrt(1-t*t);a=-h+1/d; z=t*a
 p=[[-h,-s/2,0],[h,-s/2,0],[-a,0,z],[0,0,-t/2],[a,0,z],[-h,s/2,0],[h,s/2,0]]
 q=[[-a,-s/2,0],[0,-s**3/(2+6*t*t),-(t+t**3+2*t**5)/(1+4*t*t+3*t**4)],
 [a,-s/2,0],[-h,0,z],[h,0,z],[-a,s/2,0],[0,s**3/(2+6*t*t),-(t+t**3+2*t**5)/(1+4*t*t+3*t**4)],[a,s/2,0]]
 cp=[];ff=[];lookup={};edges=[];kinds=[];faces=[]
 def xf(v,i,j):
  if not t:return [h+i+v[0],h+j+v[1],v[2]]
  C=(1+t*t+2*t**4)/(4*(t+t**3));angle=-4*j*m.atan(t*s/d)
  return [h+i/d+v[0],s/2+v[1]*m.cos(angle)-(v[2]+C)*m.sin(angle),-C+v[1]*m.sin(angle)+(v[2]+C)*m.cos(angle)]
 def add(x,y,v,i,j):
  assert (x,y) not in lookup
  lookup[x,y]=len(cp);cp.append([x/2,y/2]);ff.append(xf(v,i,j))
 for j in range(ny):
  for i in range(nx):
   if i%2==0:
    if i==0 and j==0:add(0,0,p[0],i,j)
    if i==0:add(0,2*j+1,p[2],i,j);add(0,2*j+2,p[5],i,j)
    if j==0:add(2*i+2,0,p[1],i,j)
    add(2*i+1,2*j+1,p[3],i,j);add(2*i+2,2*j+1,p[4],i,j);add(2*i+2,2*j+2,p[6],i,j)
   else:
    if j==0:add(2*i+1,0,q[1],i,j);add(2*i+2,0,q[2],i,j)
    add(2*i+2,2*j+1,q[4],i,j);add(2*i+1,2*j+2,q[6],i,j);add(2*i+2,2*j+2,q[7],i,j)
 def e(A,B,k):edges.append([lookup[A],lookup[B]]);kinds.append(k)
 def f(coords):faces.append([lookup[c] for c in coords])
 for j in range(ny):
  for i in range(nx):
   A=(2*i,2*j);B=(2*i+2,2*j);C=(2*i,2*j+1);D=(2*i+1,2*j+1);E=(2*i+2,2*j+1);F=(2*i,2*j+2);G=(2*i+2,2*j+2);Q=(2*i+1,2*j);H=(2*i+1,2*j+2)
   if i%2==0:
    if j==0:e(A,B,'B')
    if i==0:e(A,C,'B')
    for a,b,k in [(A,D,'V'),(D,B,'V'),(B,E,'B' if i==nx-1 else 'M'),(C,D,'M'),(D,E,'M')]:e(a,b,k)
    if i==0:e(C,F,'B')
    for a,b,k in [(F,D,'V'),(D,G,'V'),(E,G,'B' if i==nx-1 else 'M'),(F,G,'B' if j==ny-1 else 'M')]:e(a,b,k)
    for tri in [(A,B,D),(A,D,C),(C,D,F),(F,D,G),(D,E,G),(D,B,E)]:f(tri)
   else:
    if j==0:e(A,Q,'B');e(Q,B,'B')
    for a,b,k in [(C,Q,'V'),(Q,E,'V'),(B,E,'B' if i==nx-1 else 'M'),(C,E,'M'),(C,H,'V'),(H,E,'V'),(E,G,'B' if i==nx-1 else 'M'),(F,H,'B' if j==ny-1 else 'M'),(H,G,'B' if j==ny-1 else 'M')]:e(a,b,k)
    for tri in [(A,Q,C),(Q,B,E),(C,Q,E),(C,E,H),(C,H,F),(H,E,G)]:f(tri)
 checks=0;maxerr=m.mpf(0)
 for face in faces:
  for ia in range(3):
   for ib in range(ia+1,3):
    a,b=face[ia],face[ib]
    planar=m.sqrt(sum((m.mpf(cp[a][k])-cp[b][k])**2 for k in range(2)))
    spatial=m.sqrt(sum((ff[a][k]-ff[b][k])**2 for k in range(3)))
    maxerr=max(maxerr,abs(planar-spatial));checks+=1
 assert maxerr<m.mpf('1e-70'),str(maxerr)
 assert len(cp)-len(edges)+len(faces)==1
 return {'vertices_coords':cp,'vertices_coords3d':[[float(x) for x in v] for v in ff],
 'edges_vertices':edges,'edges_assignment':kinds,'edges_foldAngle':[180 if k=='V' else -180 if k=='M' else 0 for k in kinds],
 'faces_vertices':faces,'mp80MaximumFaceDistanceError':str(maxerr),'pairChecks':checks,
 'counts':{'vertices':len(cp),'edges':len(edges),'faces':len(faces),**{k:kinds.count(k) for k in ('B','M','V')}}}

@lru_cache(maxsize=2)
def waterbomb_literal(n):
 with m.workdps(80):return graph(n,n,.95)

def validate_original_base(q):
 model=q['model']
 if model in ('waterbomb-3','waterbomb-5'):
  expected=waterbomb_literal(3 if model=='waterbomb-3' else 5)
  cp=expected['vertices_coords'];edges=expected['edges_vertices'];faces=expected['faces_vertices'];types=expected['edges_assignment'];initial=expected['vertices_coords3d']
 elif model.startswith('pleat'):
  cp=[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]]
  edges=[[0,1],[1,2],[2,3],[0,4],[1,5],[2,6],[3,7],[4,5],[5,6],[6,7]]
  faces=[[0,1,5,4],[1,2,6,5],[2,3,7,6]];types=['B','B','B','B','V','M','B','B','B','B']
  initial=[[0,0,0],[1,0,0],[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,1,0],[1,1,0]]
 elif model.startswith('plane'):
  cp=[[0,0],[1,0],[3,0],[5,0],[0,1],[2,1],[4,1],[5,1],[0,2],[1,2],[3,2],[5,2]]
  edges=[[0,1],[1,2],[2,3],[0,4],[1,5],[2,6],[3,7],[4,5],[5,6],[6,7],[4,8],[5,9],[6,10],[7,11],[8,9],[9,10],[10,11]]
  faces=[[0,1,5,4],[1,2,6,5],[2,3,7,6],[4,5,9,8],[5,6,10,9],[6,7,11,10]];types=['B','B','B','B','V','M','B','M','V','M','B','V','M','B','B','B','B']
  initial=[[0,0,0],[1,0,0],[1,2,0],[3,2,0],[0,1,0],[2,1,0],[2,3,0],[3,3,0],[0,0,0],[1,0,0],[1,2,0],[3,2,0]]
 else:
  cp=[[0,0],[1,0],[0,.5],[.5,.5],[1,.5],[0,1],[1,1]]
  edges=[[0,1],[0,2],[0,3],[1,3],[1,4],[2,3],[3,4],[2,5],[3,5],[3,6],[4,6],[5,6]]
  faces=[[0,1,3],[0,3,2],[1,4,3],[2,3,5],[3,4,6],[3,6,5]];types=['B','B','V','V','B','M','M','B','V','V','B','B']
  initial=[[0,0,0],[1,0,0],[.5,0,0],[.5,.5,0],[.5,0,0],[0,0,.1],[1,0,.1]]
 if q['verticesOriginal']!=cp or q['edges']!=edges or q['faces']!=faces or q['assignments']!=types:raise ValueError('原保存例纸面、原顶点/边/面顺序或赋型失配。')
 budget=128*2.220446049250313e-16*max(1,len(cp))
 if model not in ('waterbomb-3','waterbomb-5') and q['initialVertices3DOriginal']!=initial or max(abs(a-b) for pa,pb in zip(q['initialVertices3DOriginal'],initial) for a,b in zip(pa,pb))>budget:raise ValueError('原保存例真实初态或显式扰动种子失配。')
 return {'literalOriginalSourceChecked':True,'waterbombOraclePrecision':80 if model.startswith('waterbomb-') and model!='waterbomb-base' else None,'sourceCPIndicesExact':True,'initialSourceBudget':budget}
