"""Parallel-pleat flagstones via perpendicular duals and circumcenters.

Tiles are translated by their dual positions. At each interior junction the
Voronoi bisectors between its center and displaced corners define the central
polygon; strip pleats meet perpendicular bisectors of translated centers.
This is an independent analytic construction, not a notebook translation.
"""
import math
from collections import defaultdict
import numpy as np
from scipy.optimize import LinearConstraint, linprog, minimize
from tessellation_patterns import make_fold, planar_faces, canonical_fold
from tessellation_dual_faces import reciprocal_face_topology


def maxmin_flagstone_centers(mother, targets=None):
    """Origamica's default MaxMinPleat reciprocal, with a centroid tie-break.

    The perpendicular dual is not unique.  Its signed edge lengths must keep
    the initial total while the shortest edge is made as long as possible.
    Projecting face centroids onto perpendicularity alone can leave one pleat
    much narrower and change whether the resulting crease pattern can layer.
    A supplied reciprocal is already the TPrimalDualGraph input to the source
    flagstone constructor, so keep its exact vertices when it is feasible.
    """
    vertices = np.asarray(mother['vertices_coords'], dtype=float)
    faces = mother['faces_vertices']
    centroids = np.asarray([vertices[face].mean(axis=0) for face in faces])
    initial = centroids if targets is None else np.asarray(targets, dtype=float)
    if initial.shape != centroids.shape:
        raise ValueError('对偶点数量与当前母结构不一致，请清除对偶修改后重新生成。')
    incident = defaultdict(list)
    for face_index, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            incident[tuple(sorted((a, b)))].append(face_index)
    orthogonal, widths, dual_edges = [], [], []
    for (a, b), adjacent in sorted(incident.items()):
        if len(adjacent) != 2:
            continue
        tangent = vertices[b] - vertices[a]
        tangent /= np.linalg.norm(tangent)
        normal = np.array([-tangent[1], tangent[0]])
        if np.dot(normal, centroids[adjacent[1]] - centroids[adjacent[0]]) < 0:
            normal = -normal
        row = np.zeros((len(faces), 2))
        row[adjacent[1]], row[adjacent[0]] = tangent, -tangent
        orthogonal.append(row.ravel())
        row = np.zeros((len(faces), 2))
        row[adjacent[1]], row[adjacent[0]] = normal, -normal
        widths.append(row.ravel())
        dual_edges.append(adjacent)
    if not widths:
        raise ValueError('母结构至少需要两个共享边的面。')
    # Existing numeric callers may supply only coordinates and face rings.
    # Complete an audit-only edge view without changing their mother IDs/data.
    topology_mother = mother if 'edges_vertices' in mother else {
        **mother, 'edges_vertices': [list(edge) for edge in incident]}
    dual_faces, interior_vertices = reciprocal_face_topology(topology_mother, dual_edges)
    orthogonal, widths = np.asarray(orthogonal), np.asarray(widths)
    original = initial.ravel()
    scale = max(float(np.ptp(vertices, axis=0).max()), 1e-3)
    if targets is not None and np.isfinite(initial).all() \
            and np.max(np.abs(orthogonal @ original)) <= scale * 1e-8 \
            and np.min(widths @ original) > scale * 1e-7:
        centers = initial.tolist()
        dual = make_fold(centers, dual_edges, ['A'] * len(dual_edges), dual_faces)
        dual['zhezhi_dual_primal_vertices'] = interior_vertices
        return centers, dual
    total_width = float(np.sum(widths @ original))
    if total_width <= 0:
        raise ValueError('母结构没有稳定的正向双褶垂直对偶，请调整顶点位置或减少细分。')
    count = original.size
    objective = np.zeros(count + 1)
    objective[-1] = -1  # maximize the smallest signed pleat width
    # Translation is a free gauge; anchoring its mean makes the LP repeatable.
    mean = np.zeros((2, count))
    mean[0, 0::2], mean[1, 1::2] = 1 / len(faces), 1 / len(faces)
    equalities = np.block([
        [orthogonal, np.zeros((len(orthogonal), 1))],
        [widths.sum(axis=0)[None, :], np.zeros((1, 1))],
        [mean, np.zeros((2, 1))],
    ])
    target = np.r_[np.zeros(len(orthogonal)), total_width, initial.mean(axis=0)]
    result = linprog(objective, A_eq=equalities, b_eq=target,
                     A_ub=np.c_[-widths, np.ones(len(widths))],
                     b_ub=np.zeros(len(widths)),
                     bounds=[(None, None)] * (count + 1), method='highs')
    if not result.success or result.x[-1] < scale * 1e-7:
        raise ValueError('母结构没有稳定的正向双褶垂直对偶，请调整顶点位置或减少细分。')
    # Among equally wide reciprocal diagrams, keep the one closest to the
    # supplied face centers. This does not alter the MaxMinPleat optimum.
    value = result.x[:count]
    floor = result.x[-1] - scale * 1e-9
    refined = minimize(lambda x: float(np.sum((x - original) ** 2)), value,
                       jac=lambda x: 2 * (x - original), method='SLSQP',
                       constraints=[LinearConstraint(equalities[:, :count], target, target),
                                    LinearConstraint(widths, floor, np.inf)],
                       options={'maxiter': 300, 'ftol': 1e-12})
    if refined.success and np.max(np.abs(equalities[:, :count] @ refined.x - target)) < scale * 1e-7 \
            and np.min(widths @ refined.x) >= floor - scale * 1e-7:
        value = refined.x
    centers = value.reshape(-1, 2).tolist()
    dual = make_fold(centers, dual_edges, ['A'] * len(dual_edges), dual_faces)
    dual['zhezhi_dual_primal_vertices'] = interior_vertices
    return centers, dual


def parallel_flagstone(mother, centers, width, shrinkage=None, assignment='original'):
    vertices=np.array(mother['vertices_coords']);centers=np.array(centers)
    faces=mother['faces_vertices'];face_at=defaultdict(set);edge_at=defaultdict(list)
    for f,face in enumerate(faces):
        for a,b in zip(face,face[1:]+face[:1]):
            face_at[a].add(f);edge_at[tuple(sorted((a,b)))].append(f)
    border={v for edge,fs in edge_at.items() if len(fs)==1 for v in edge}
    coords=[];index={};edges={}
    def vertex(p):
        key=tuple(round(float(x),9)+0. for x in p)
        if key not in index:index[key]=len(coords);coords.append(list(key))
        return index[key]
    def edge(a,b,assignment='U'):
        a,b=vertex(a),vertex(b)
        if a==b:raise ValueError('铺石分子退化，请调整褶宽或母结构。')
        key=tuple(sorted((a,b)))
        if key not in edges or assignment=='B':edges[key]=assignment
    primal_scale,dual_scale=(1.,width) if shrinkage is None else (shrinkage,1-shrinkage)
    corners={(v,f):primal_scale*vertices[v]+dual_scale*centers[f] for v,fs in face_at.items() for f in fs}
    for (a,b),fs in edge_at.items():
        for f in fs:edge(corners[a,f],corners[b,f],'B' if len(fs)==1 else 'M')
    endpoints={}
    for v,fs in face_at.items():
        if v in border:
            for primal,adjacent in edge_at.items():
                if v not in primal or len(adjacent)!=2:continue
                f,g=adjacent;a,b=corners[v,f],corners[v,g]
                m,n=(3*a+b)/4,(a+3*b)/4
                for p,q in ((a,m),(m,n),(n,b)):edge(p,q,'B')
                endpoints[v,primal,f]=m;endpoints[v,primal,g]=n
            continue
        origin=np.mean([corners[v,f] for f in fs],axis=0)
        ordered=sorted(fs,key=lambda f:math.atan2(*(corners[v,f]-origin)[::-1]))
        # The notebook assigns every junction bridge V and every cross-pleat
        # fold M. The old directional tuck remains available for saved projects.
        central=[]
        for f,g in zip(ordered,ordered[1:]+ordered[:1]):
            a,b=corners[v,f],corners[v,g]
            delta=b-a;length=np.linalg.norm(delta);x=delta/length;y=np.array([-x[1],x[0]])
            p=np.array([np.dot(origin-a,x),np.dot(origin-a,y)])
            if p[1]<=1e-9:raise ValueError('铺石对偶分子不是凸多边形。')
            # Circumcenter of (a,b,origin), expressed in the edge frame.
            local_l=np.array([length/2,(np.dot(p,p)-p[0]*length)/(2*p[1])])
            convergence=np.array([length/2,0.])
            translation=convergence-p;midpoint=local_l+translation/2
            # The two pleats lie one quarter of the strip width from its sides.
            points=[]
            for xx in (length/4,3*length/4):
                yy=midpoint[1]-translation[0]*(xx-midpoint[0])/translation[1]
                points.append(a+xx*x+yy*y)
            l=a+local_l[0]*x+local_l[1]*y;m,n=points
            central.append(l)
            bridge='M' if assignment=='tuck' and np.dot(l-origin,[1.,-.5])>0 else 'V'
            for u,w in ((l,m),(l,n)):edge(u,w,bridge)
            for u,w in ((a,m),(b,n)):edge(u,w,'V')
            edge(m,n,'V' if bridge=='M' else 'M')
            edge(a,l,'M');edge(b,l,'M')
            primal=next((e for e,adjacent in edge_at.items() if v in e and len(adjacent)==2 and set(adjacent)=={f,g}),None)
            if primal is None:raise ValueError('铺石对偶邻接不一致。')
            endpoints[v,primal,f]=m;endpoints[v,primal,g]=n
        for a,b in zip(central,central[1:]+central[:1]):edge(a,b,'V')
    for primal,fs in edge_at.items():
        if len(fs)!=2:continue
        a,b=primal
        for f in fs:edge(endpoints[a,primal,f],endpoints[b,primal,f],'V')
    edge_list=[list(e) for e in edges]
    return canonical_fold(make_fold(coords,edge_list,list(edges.values()),planar_faces(coords,edge_list)))
