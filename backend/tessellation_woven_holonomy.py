"""Differentiable whole-sheet unfold closure for multiply connected mothers.

The spanning forest and face-winding branch are fixed for an optimization
chart. Every repeated face corner is checked; constraints are not inferred
from a centroid, a boundary label, or just local four-ray conditions.
"""
from collections import defaultdict,deque
import numpy as np


class UnfoldClosureSystem:
    def __init__(self,graph,roots,scale,initial,winding):
        self.base=graph['base'];self.directions=graph['directions'];self.variable=graph['variable'];self.faces=graph['faces']
        self.rings=[[face,*graph.get('faceHoles',[[] for _ in self.faces])[f]] for f,face in enumerate(self.faces)]
        self.corners=[[v for ring in rs for v in ring] for rs in self.rings]
        self.scale=float(scale);self.winding=winding;self.branch=[winding(initial,face) for face in self.faces]
        if not np.isfinite(self.scale) or self.scale<=0 or any(abs(w)!=1 for w in self.branch):raise ValueError('绕孔回展的尺度或初始面绕数无效。')
        incidence=defaultdict(list)
        for f,rs in enumerate(self.rings):
            for face in rs:
                for a,b in zip(face,face[1:]+face[:1]):incidence[tuple(sorted((a,b)))].append(f)
        adjacent=defaultdict(list)
        for edge,fs in incidence.items():
            if len(fs)==2:
                a,b=fs;adjacent[a].append((b,edge));adjacent[b].append((a,edge))
        self.visits=[(f,None,None) for f in roots];seen=set(roots);queue=deque(roots)
        while queue:
            f=queue.popleft()
            for g,edge in adjacent[f]:
                if g not in seen:seen.add(g);queue.append(g);self.visits.append((g,f,edge))
        if len(seen)!=len(self.faces):raise ValueError('绕孔回展面邻接不连通，不能绑定原固定面。')
        self.row_count=2*(sum(map(len,self.corners))-len(self.base))
        self.cache_x=None

    def evaluate(self,x):
        if self.cache_x is not None and np.array_equal(x,self.cache_x):return self.cache
        n=len(x);p=self.base.copy();dp=np.zeros((len(p),2,n))
        for v,k in enumerate(self.variable):
            if k>=0:p[v]+=self.directions[v]*x[k];dp[v,:,k]=self.directions[v]
        if not np.all(np.isfinite(p)):raise ValueError('绕孔回展产生非有限角点。')
        if any(self.winding(p,face)!=w for face,w in zip(self.faces,self.branch)):raise ValueError('绕孔求解跨越面绕数分支，未认证该候选。')
        transforms={};coords={};values=[];jac=[]
        for f,parent,edge in self.visits:
            if parent is None:
                m,o,dm,do=np.eye(2),np.zeros(2),np.zeros((2,2,n)),np.zeros((2,n))
            else:
                m,o,dm,do=transforms[parent]
                if self.branch[f]!=self.branch[parent]:
                    a,b=edge;delta=p[b]-p[a];length=float(np.linalg.norm(delta))
                    uncertainty=32*np.finfo(float).eps*max(1.,float(np.max(np.abs(p))))
                    if not np.isfinite(length) or length<=uncertainty:raise ValueError('绕孔回展反射轴非有限、退化或不可分辨。')
                    t=delta/length;dd=dp[b]-dp[a];dt=(dd-t[:,None]*(t@dd)[None,:])/length
                    r=2*np.outer(t,t)-np.eye(2)
                    dr=2*(np.einsum('in,j->ijn',dt,t)+np.einsum('i,jn->ijn',t,dt))
                    offset=p[a]-r@p[a];d_offset=dp[a]-np.einsum('ijn,j->in',dr,p[a])-r@dp[a]
                    next_m=m@r;next_dm=np.einsum('ikn,kj->ijn',dm,r)+np.einsum('ik,kjn->ijn',m,dr)
                    next_o=o+m@offset;next_do=do+np.einsum('ijn,j->in',dm,offset)+m@d_offset
                    m,o,dm,do=next_m,next_o,next_dm,next_do
            transforms[f]=(m,o,dm,do)
            for v in self.corners[f]:
                q=m@p[v]+o;dq=np.einsum('ijn,j->in',dm,p[v])+m@dp[v]+do
                if v in coords:
                    old,dold=coords[v];values.extend((q-old)/self.scale);jac.extend((dq-dold)/self.scale)
                else:coords[v]=(q,dq)
        value=np.asarray(values);derivative=np.asarray(jac).reshape(self.row_count,n)
        if len(value)!=self.row_count or not np.all(np.isfinite(value)) or not np.all(np.isfinite(derivative)):raise ValueError('绕孔回展的约束数量或解析导数无效。')
        self.cache_x=x.copy();self.cache=(value,derivative);return self.cache
