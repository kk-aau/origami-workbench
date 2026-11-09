"""Bounded engineering root for literal Origamica In[2667], never Wolfram eval.

The two quad diagonal errors are multiplied, exactly as in the source.  A small
product is not a rigid-facet certificate; those diagnostics remain separate.
"""
import math,json
import numpy as np
from scipy.optimize import root

SCHEMA = 'original-in2667-engineering-root-v1'
NB_SHA = '19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
RESIDUAL = 2e-9
MIN_DIAGONAL = 2e-8

def _number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

def _validate(raw):
    if not isinstance(raw, dict) or set(raw) != {'schema','sourceKey','verticesMm','edges','faces','flatVerticesMm','bottom','top','repetitionPairs','arcDeg'}:
        raise ValueError('原旋转褶查询字段不完整或含未支持字段。')
    if raw['schema'] not in ('original-in2667-bounded-query-v1','original-in2667-shared-apex-query-v2') or not isinstance(raw['sourceKey'], str) or not 1 <= len(raw['sourceKey']) <= 20000:
        raise ValueError('原旋转褶来源标识无效。')
    apex_query=raw['schema']=='original-in2667-shared-apex-query-v2'
    pts, flat = raw['verticesMm'], raw['flatVerticesMm']
    if not isinstance(pts,list) or not (3 if apex_query else 4) <= len(pts) <= 24 or not isinstance(flat,list) or len(flat)!=len(pts):
        raise ValueError('有限入口需要 4–24 个原纸带顶点。')
    if any(not isinstance(p,list) or len(p)!=2 or any(not _number(x) or abs(x)>100000 for x in p) for p in pts+flat):
        raise ValueError('原纸带坐标须为有限毫米二维点。')
    V=len(pts)
    def ids(row): return isinstance(row,list) and all(isinstance(i,int) and not isinstance(i,bool) and 0<=i<V for i in row)
    edges,faces,bottom,top=raw['edges'],raw['faces'],raw['bottom'],raw['top']
    if not isinstance(edges,list) or not (3 if apex_query else 4)<=len(edges)<=40 or any(not ids(e) or len(e)!=2 or e[0]==e[1] for e in edges):
        raise ValueError('原纸带边索引无效。')
    if not isinstance(faces,list) or not 1<=len(faces)<=11 or any(not ids(f) or len(f) not in ((3,4) if apex_query else (4,)) or len(set(f))!=len(f) for f in faces):
        raise ValueError('此有限旋转入口只接原矩形／梯形条带四边面。')
    if not ids(bottom) or not ids(top) or len(bottom)<2 or len(bottom)!=len(top) or bottom!=sorted(set(bottom)) or top!=sorted(set(top)) or set(bottom+top)!=set(range(V)):
        raise ValueError('Bottom/Top 须为原有序不共尖纸带行；此入口未焊合三角尖或周期缝。')
    shared=set(bottom)&set(top)
    if (apex_query and (shared!={bottom[0]} or bottom[0]!=top[0] or pts[bottom[0]]!=[0,0])) or (not apex_query and shared):raise ValueError('共尖仅保原 Bottom/Top 首点二维零点身份，不能任意焊点。')
    n,phi=raw['repetitionPairs'],raw['arcDeg']
    if not isinstance(n,int) or isinstance(n,bool) or not 1<=n<=24 or not _number(phi) or not -360<=phi<=360:
        raise ValueError('重复对数为 1–24，原空间弧角为 −360–360°。')
    cp=np.asarray(pts,dtype=float);ff=np.asarray(flat,dtype=float)
    try:source=json.loads(raw['sourceKey'])
    except (ValueError,TypeError):raise ValueError('原参数来源 key 须为当前有限配方。')
    if not isinstance(source,dict) or set(source)!={'base','repetitionPairs','arcDeg','splitBentFaces','splitBendToleranceDeg'} or source['repetitionPairs']!=n or source['arcDeg']!=phi or not isinstance(source['base'],dict) or source['base'].get('model') not in ('flat-strip','troublewit','canonical-troublewit'):
        raise ValueError('原参数来源 key 与当前域或构造不符。')
    if apex_query:
        b=source['base'];spread=b.get('spreadAngleDeg');w=b.get('widthMm')
        if b.get('model')!='flat-strip' or w!=0 or not _number(spread) or not 0<2*n*spread<=360 or ff[bottom[0],0]!=0:raise ValueError('原共尖纸带需零宽、0<2nΘ≤360°，原空间尖点位于旋转轴；未平移或吸附。')
    undirected={tuple(sorted(e)) for e in edges}
    if len(undirected)!=len(edges):raise ValueError('原纸带边重复，不能静默删除。')
    uses={e:[] for e in undirected}
    for fi,f in enumerate(faces):
        for k,a in enumerate(f):
            b=f[(k+1)%len(f)];key=tuple(sorted((a,b)))
            if key not in uses:raise ValueError('原纸带面缺边。')
            uses[key].append((fi,a,b))
    if any(not rows or len(rows)>2 or len(rows)==2 and rows[0][1:]==rows[1][1:] for rows in uses.values()):raise ValueError('原纸面边使用或朝向无效。')
    if V-len(edges)+len(faces)!=1:raise ValueError('有限纸带须为无私有缝或孔的单纸面。')
    for i in range(V):
        for j in range(i+1,V):
            if np.linalg.norm(cp[i]-cp[j])<=1e-6:raise ValueError('不同原顶点过近，未焊点或吸附。')
    def det(a,b):return a[0]*b[1]-a[1]*b[0]
    for i,(a,b) in enumerate(edges):
        for c,d in edges[i+1:]:
            if {a,b}&{c,d}:continue
            u,v=cp[b]-cp[a],cp[d]-cp[c];den=det(u,v)
            if abs(den)>1e-14:
                t=det(cp[c]-cp[a],v)/den;s=det(cp[c]-cp[a],u)/den
                if -1e-12<=t<=1+1e-12 and -1e-12<=s<=1+1e-12:raise ValueError('原纸带含无索引交叉或接触。')
            elif abs(det(cp[c]-cp[a],u))<1e-12:
                axis=int(np.argmax(np.abs(u)))
                if max(min(cp[a,axis],cp[b,axis]),min(cp[c,axis],cp[d,axis]))<=min(max(cp[a,axis],cp[b,axis]),max(cp[c,axis],cp[d,axis]))+1e-12:raise ValueError('原纸带含共线重叠。')
    for row in (bottom,top):
        axis=cp[row[-1]]-cp[row[0]]
        if np.linalg.norm(axis)<1e-8 or any(abs(det(cp[v]-cp[row[0]],axis))>2e-10*max(1,np.linalg.norm(axis)) for v in row):raise ValueError('Bottom/Top 必须保原直线行。')
    lengths=np.linalg.norm(cp[np.asarray(edges)[:,0]]-cp[np.asarray(edges)[:,1]],axis=1)
    if np.any(lengths<1e-8): raise ValueError('原 CP 含零长或过短边，未吸附端点。')
    for f in faces:
        signed=sum(det(cp[f[k]]-cp[f[0]],cp[f[(k+1)%len(f)]]-cp[f[0]]) for k in range(len(f)))/2
        if signed<=1e-12: raise ValueError('原纸带面必须保持原逆时针非退化朝向。')
        for i in range(len(f)):
            for j in range(i+1,len(f)):
                a,b=f[i],f[j];l=np.linalg.norm(cp[a]-cp[b])
                if l<1e-8 or abs(np.linalg.norm(ff[a]-ff[b])/l-1)>2e-8:
                    raise ValueError('初值须为原 FlatStrip 静态等距平折，不接受投影初值。')
    if np.linalg.norm(ff[top[-1],:1])<=1e-10:raise ValueError('原最后 Top 半径初值退化，此有限工程根入口不改变初值。')
    return raw,cp,np.asarray([[x,0,y] for x,y in ff],dtype=float)

def _normal(q):
    if q['arcDeg']==0:return np.array([0.,1.,0.])
    a=math.pi/2+q['arcDeg']*math.pi/180/(2*q['repetitionPairs'])
    return np.array([math.cos(a),math.sin(a),0.])

def original_constraints(q,cp,initial,p):
    edges=np.asarray(q['edges']);bottom=q['bottom'];top=q['top']
    e=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)/np.linalg.norm(cp[edges[:,0]]-cp[edges[:,1]],axis=1)-1
    diagonal=[]
    for a,b,c,d in (f for f in q['faces'] if len(f)==4):
        diagonal.append([float(np.linalg.norm(p[a]-p[c])/np.linalg.norm(cp[a]-cp[c])-1),float(np.linalg.norm(p[b]-p[d])/np.linalg.norm(cp[b]-cp[d])-1)])
    products=[a*b for a,b in diagonal]
    s=np.concatenate([p[bottom[0]]-initial[bottom[0]],p[bottom[1:],1],p[top[1:] if bottom[0]==top[0] else top]@_normal(q),[np.linalg.norm(p[top[-1],:2])-np.linalg.norm(initial[top[-1],:2])]])
    return np.concatenate([s,e,products]),{'shape':s.tolist(),'edges':e.tolist(),'diagonalProduct':products,'diagonalErrors':diagonal}

def original_jacobian(q,cp,initial,p):
    V=len(p);rows=[];bottom=q['bottom'];top=q['top']
    for k in range(3):
        r=np.zeros((V,3));r[bottom[0],k]=1;rows.append(r.ravel())
    for v in bottom[1:]:
        r=np.zeros((V,3));r[v,1]=1;rows.append(r.ravel())
    for v in (top[1:] if bottom[0]==top[0] else top):
        r=np.zeros((V,3));r[v]=_normal(q);rows.append(r.ravel())
    r=np.zeros((V,3));radius=np.linalg.norm(p[top[-1],:2]);r[top[-1],:2]=p[top[-1],:2]/max(radius,1e-300);rows.append(r.ravel())
    def distance(a,b):
        d=p[a]-p[b];l=np.linalg.norm(d);base=np.linalg.norm(cp[a]-cp[b]);r=np.zeros((V,3))
        if l<=1e-300:raise ValueError('工程根试步出现零长边。')
        r[a]=d/(l*base);r[b]=-r[a];return l/base-1,r
    for a,b in q['edges']:rows.append(distance(a,b)[1].ravel())
    for a,b,c,d in (f for f in q['faces'] if len(f)==4):
        u,gu=distance(a,c);v,gv=distance(b,d);rows.append((v*gu+u*gv).ravel())
    return np.asarray(rows)

def query_rotational_pleats_strain(raw):
    q,cp,initial=_validate(raw);x0=initial.ravel();res0,_=original_constraints(q,cp,initial,initial)
    if len(res0)!=len(x0):raise ValueError('原 FindRoot 要求变量数与原 shape/edge/diagonalProduct 方程数相等。')
    singular=np.linalg.svd(original_jacobian(q,cp,initial,initial),compute_uv=False);rank=int(np.sum(singular>1e-9*singular[0]))
    answer=root(lambda x:original_constraints(q,cp,initial,x.reshape(initial.shape))[0],x0,jac=lambda x:original_jacobian(q,cp,initial,x.reshape(initial.shape)),method='hybr',options={'xtol':1e-11,'maxfev':6000})
    pose=answer.x.reshape(initial.shape)
    if not np.all(np.isfinite(pose)) or np.max(np.abs(pose))>1e6:raise ValueError('原工程根未产生有限空间坐标。')
    residual,diagnostics=original_constraints(q,cp,initial,pose);maximum=float(np.max(np.abs(residual)));minimum_diagonal=max((min(abs(a),abs(b)) for a,b in diagnostics['diagonalErrors']),default=0.)
    if maximum>RESIDUAL or minimum_diagonal>MIN_DIAGONAL:raise ValueError('原 Root 方程未通过独立残差预算，不能采用。')
    return {'schema':'original-in2667-engineering-shared-apex-root-v2' if q['schema']=='original-in2667-shared-apex-query-v2' else SCHEMA,'sourceKey':q['sourceKey'],'query':q,'solutionVertices3D':pose.tolist(),'solver':{'method':'scipy-hybr-original-full-initial-analytic-product-jacobian','reportedSuccess':bool(answer.success),'message':str(answer.message),'nfev':int(answer.nfev),'initialJacobianRank':rank,'variables':len(x0),'initialSingularJacobian':rank<len(x0),'initialCoordinatesExactlyOriginalRx90':True,'stationaryAnchorUntranslated':initial[q['bottom'][0]].tolist()},'residuals':{'maximumOriginalConstraint':maximum,'maximumMinimumDiagonalError':minimum_diagonal,**diagnostics},'source':{'notebookSHA256':NB_SHA,'definitionCell':'In[2667]','savedExampleCells':['In[2669]'] if q['schema']=='original-in2667-shared-apex-query-v2' else ['In[2668]','In[2670]','In[2671]'],'originalDiagonalConstraint':'error13 * error24 == 0; not both errors zero','unitConvention':'1 original unit = 1 mm, unchanged','WolframExecuted':False,'originalWolframBranchUniquelyCertified':False,'rigidSceneCertified':False,'continuousMotionCertified':False,'wholeLayerOrderCertified':False},'numericalPolicy':{'originalConstraintAbsolute':RESIDUAL,'minimumOneDiagonalRelative':MIN_DIAGONAL,'maxfev':6000,'xtol':1e-11,'intervalCertificate':False}}
