"""Independent constrained construction of a quadrilateral split-twist.

One opposite corner splits into two degree-four vertices; the base gains two
creases and has degree six. Solve the five Kawasaki equations while keeping
all faces oriented and every crease nonzero. No notebook implementation is
used. The angle/scale specify a geometric target, not an exact pleat angle.
"""
import math
import numpy as np
from scipy.optimize import minimize
from tessellation_patterns import make_fold, planar_faces, canonical_fold


DEFAULT_QUAD = [[-1., -1.], [1., -1.], [.8, 1.], [-.8, .8]]


def quadrilateral_split(params):
    from tessellation_advanced import assign_local_mv
    from tessellate import check_geometry, check_local_conditions
    polygon = np.array(params.get('polygon', DEFAULT_QUAD), dtype=float)
    base = params.get('splitVertex', 0)
    polygon = np.roll(polygon, -base, axis=0)
    area=sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(polygon,np.roll(polygon,-1,axis=0)))
    if area<0:polygon=np.vstack([polygon[0],polygon[:0:-1]])
    width = params.get('pleatWidth', .25)
    angle = math.radians(params['angle'])
    rotation = np.array([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]])
    center = polygon.mean(axis=0)
    q = (polygon-center) @ rotation.T * params['scale'] + center
    target = np.array([q[0], q[1], .7*q[2]+.3*q[1], q[3], .7*q[2]+.3*q[3]])
    # Face-adjacent order: 0,1,2,4,3. The triangles incident to 0 are
    # separated by the two added diagonals, with 2--4 the connecting crease.
    edges = [[0,1],[1,2],[2,4],[4,3],[3,0],[0,2],[0,4]]
    outer = []
    for i in range(4):
        a, b = polygon[i], polygon[(i+1)%4]
        outer.extend(a+(b-a)*fraction for fraction in (0, (1-width)/2, (1+width)/2))
        edges.extend([[4 if i==2 else i, 6+3*i], [(i+1)%4, 7+3*i]])
    outer = np.array(outer)
    boundary = list(range(5,17))
    edges.extend([[a,b] for a,b in zip(boundary, boundary[1:]+boundary[:1])])
    # Fix combinatorics from an interior convex placement independent of the
    # requested rotation, so an extreme target cannot silently change topology.
    seed = (polygon-center)*.35+center
    seed = np.array([seed[0],seed[1],.7*seed[2]+.3*seed[1],seed[3],.7*seed[2]+.3*seed[3]])
    coords = np.vstack([seed,outer])
    faces = planar_faces(coords.tolist(),edges)
    neighbors = [[] for _ in range(5)]
    for a,b in edges:
        if a<5:neighbors[a].append(b)
        if b<5:neighbors[b].append(a)
    for i,ns in enumerate(neighbors):ns.sort(key=lambda j:math.atan2(coords[j,1]-coords[i,1],coords[j,0]-coords[i,0]))
    span = float(np.ptp(polygon,axis=0).max())
    edge_indices = np.array(edges)
    face_a = np.array([a for f in faces for a in f]);face_b = np.array([b for f in faces for b in f[1:]+f[:1]])
    face_starts = np.cumsum([0]+[len(f) for f in faces])[:-1]
    def coordinates(x):return np.vstack([x.reshape(5,2),outer])
    def equations(x):
        c=coordinates(x);residual=[]
        for i,ns in enumerate(neighbors):
            v=c[ns]-c[i];angles=np.arctan2(v[:,1],v[:,0])
            sectors=(np.roll(angles,-1)-angles)%math.tau
            residual.append(sum(sectors[::2])-math.pi)
        return np.array(residual)
    def equation_jacobian(x):
        c=coordinates(x);jac=np.zeros((5,5,2))
        for i,ns in enumerate(neighbors):
            v=c[ns]-c[i]
            # d atan2(y,x) / d(x,y); sector differences alternate -,+.
            derivative=np.column_stack([-v[:,1],v[:,0]])/np.maximum(np.sum(v*v,axis=1)[:,None],1e-24)
            derivative*=np.array([-1 if k%2==0 else 1 for k in range(len(ns))])[:,None]
            jac[i,i]-=derivative.sum(axis=0)
            for n,d in zip(ns,derivative):
                if n<5:jac[i,n]+=d
        return jac.reshape(5,10)
    polygon_edges=np.roll(polygon,-1,axis=0)-polygon
    inside_jac=np.zeros((5,4,5,2))
    for i in range(5):inside_jac[i,:,i]=np.column_stack([-polygon_edges[:,1],polygon_edges[:,0]])
    inside_jac=inside_jac.reshape(20,10)
    def inequalities(x):
        c=coordinates(x)
        lengths=np.linalg.norm(c[edge_indices[:,0]]-c[edge_indices[:,1]],axis=1)-span*.015
        area=-(c[face_a,0]*c[face_b,1]-c[face_a,1]*c[face_b,0])
        areas=np.add.reduceat(area,face_starts)-span*span*.0005
        e=np.roll(polygon,-1,axis=0)-polygon
        delta=c[:5,None,:]-polygon
        inside=e[None,:,0]*delta[:,:,1]-e[None,:,1]*delta[:,:,0]-span*span*.001
        return np.concatenate([lengths,areas,inside.ravel()])
    def inequality_jacobian(x):
        c=coordinates(x)
        diff=c[edge_indices[:,0]]-c[edge_indices[:,1]]
        unit=diff/np.maximum(np.linalg.norm(diff,axis=1)[:,None],1e-24)
        lengths=np.zeros((len(edges),5,2))
        for i,(a,b) in enumerate(edges):
            if a<5:lengths[i,a]+=unit[i]
            if b<5:lengths[i,b]-=unit[i]
        areas=np.zeros((len(faces),5,2))
        for i,face in enumerate(faces):
            for a,b in zip(face,face[1:]+face[:1]):
                if a<5:areas[i,a]+=[-c[b,1],c[b,0]]
                if b<5:areas[i,b]+=[c[a,1],-c[a,0]]
        return np.vstack([lengths.reshape(-1,10),areas.reshape(-1,10),inside_jac])
    target=target.ravel()
    best=None
    for initial in (target,seed.ravel()):
        solved=minimize(lambda x:float(np.sum((x-target)**2)),initial,jac=lambda x:2*(x-target),method='SLSQP',
            constraints=[{'type':'eq','fun':equations,'jac':equation_jacobian},{'type':'ineq','fun':inequalities,'jac':inequality_jacobian}],
            options={'maxiter':180,'ftol':1e-11})
        if not np.isfinite(solved.x).all() or max(abs(equations(solved.x)))>1e-7 or min(inequalities(solved.x)) < -1e-7:continue
        fold=make_fold(coordinates(solved.x).tolist(),edges,['U']*15+['B']*12,faces)
        if check_geometry(fold)['status']!='passed':continue
        fold['edges_assignment'][2]=params.get('connection','M')
        try:fold=assign_local_mv(fold,preserve=True)
        except ValueError:continue
        if check_local_conditions(fold)['status']=='passed':best=fold;break
    if best is None:
        raise ValueError('该四边形和分裂设置没有找到有效解，请调整目标角、内接比例、褶宽或连接山谷。')
    mother=make_fold(polygon.tolist(),[[0,1],[1,2],[2,3],[3,0]],['B']*4,[[3,2,1,0]])
    source={'name':'折纸工作台','license':'GPL-3.0-only','algorithm':'quadrilateral-split / constrained Kawasaki geometry','version':1,
            'baseVertex':base,'connection':params.get('connection','M'),'targetAngle':params['angle'],'maxResidual':float(max(abs(equations(solved.x))))}
    return canonical_fold(best),mother,source
