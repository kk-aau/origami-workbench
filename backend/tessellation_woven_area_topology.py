"""Certify small positive face areas without a fixed world-unit cutoff.

Input corners retain the woven evaluator's 32-epsilon resolution allowance.
An uncertain near-zero sign is excluded, even if binary64 exact area > 0.
This classifies previously recorded probes, never changes their coordinates.
"""
import math
from collections import defaultdict
import numpy as np

def _down(x):return math.nextafter(x,-math.inf)
def _up(x):return math.nextafter(x,math.inf)
def _sub(a,b):return (_down(a[0]-b[1]),_up(a[1]-b[0]))
def _add(a,b):return (_down(a[0]+b[0]),_up(a[1]+b[1]))
def _mul(a,b):
    values=[x*y for x in a for y in b]
    return (_down(min(values)),_up(max(values)))

def certified_area(points,face):
    uncertainty=32*np.finfo(float).eps*max(1.,float(np.max(np.abs(points))))
    origin=[(_down(points[face[0],j]-uncertainty),_up(points[face[0],j]+uncertainty)) for j in (0,1)]
    coordinates=[]
    for v in face:
        coordinates.append([_sub((_down(points[v,j]-uncertainty),_up(points[v,j]+uncertainty)),origin[j]) for j in (0,1)])
    area=(0.,0.)
    for a,b in zip(coordinates,coordinates[1:]+coordinates[:1]):area=_add(area,_sub(_mul(a[0],b[1]),_mul(a[1],b[0])))
    if not all(math.isfinite(x) for x in area):raise ValueError('原负初值图的面积包围非有限，不能恢复拓扑。')
    return area,uncertainty

def certified_faces(points,edges,budget):
    neighbors=[[] for _ in points]
    for a,b in edges:neighbors[a].append(b);neighbors[b].append(a)
    for v,ns in enumerate(neighbors):ns.sort(key=lambda x:math.atan2(points[x,1]-points[v,1],points[x,0]-points[v,0]))
    seen=set();faces=[];bounds=[];unresolved=0
    for a,ns in enumerate(neighbors):
        for b in ns:
            if (a,b) in seen:continue
            budget.spend();cycle=[];u,v=a,b
            while (u,v) not in seen:
                seen.add((u,v));cycle.append(u);around=neighbors[v];u,v=v,around[(around.index(u)-1)%len(around)]
            area,uncertainty=certified_area(points,cycle)
            if area[0]>0:faces.append(cycle[::-1]);bounds.append(list(area))
            elif area[1]>=0:unresolved+=1
    return faces,{'method':'translated-outward-area/32epsilon-corner-allowance',
        'areaBounds':bounds,'unresolvedCycles':unresolved,'coordinateUncertainty':uncertainty}

def restore_recorded_topology(record,budget):
    graph=record['graph'];initial=record['initial'];faces,proof=certified_faces(initial,graph['edges'],budget)
    expected_euler=1
    if 'cellHoleData' in record:
        from tessellation_woven_holes import without_hole_faces
        data=record['cellHoleData'];retained=without_hole_faces(faces,data,graph['corners'],graph['anchors'])
        keep={tuple(f) for f in retained};removed=[i for i,f in enumerate(faces) if tuple(f) not in keep]
        expected_euler=len(data.get('motherComponents',[None]))-len(data['motherHoleCycles'])
        proof['cellHoles']={'schema':'zhezhi-woven-cell-hole-area-v1','originalCycles':data['motherHoleCycles'],
            'excludedCycles':[faces[i] for i in removed],'excludedBounds':[proof['areaBounds'][i] for i in removed],
            'materialEuler':expected_euler}
        proof['areaBounds']=[b for f,b in zip(faces,proof['areaBounds']) if tuple(f) in keep];faces=retained
    if len(initial)-len(graph['edges'])+len(faces)!=expected_euler:raise ValueError('原记录负初值图的面积包围不能证明完整Euler拓扑。')
    counts=defaultdict(int)
    for face in faces:
        for a,b in zip(face,face[1:]+face[:1]):counts[tuple(sorted((a,b)))]+=1
    main=[]
    for f,face in enumerate(graph['originalFaces']):
        target={graph['corners'][f,v] for v in face};matches=[i for i,p in enumerate(faces) if set(p)==target]
        if len(matches)!=1:raise ValueError('原记录负初值图未保留每个原母面角点，不能恢复。')
        main.append(matches[0])
    if any(counts[e] not in ((1,2) if kind=='B' else (2,)) for e,kind in zip(graph['edges'],graph['assignments'])):
        raise ValueError('原记录负初值图的全部边面关联未闭合。')
    adjacency=defaultdict(list)
    for a,b in graph['edges']:adjacency[a].append(b);adjacency[b].append(a)
    cycles=[]
    for v,ns in adjacency.items():
        if len(ns)!=4:continue
        ns.sort(key=lambda n:math.atan2(*(initial[n]-initial[v])[::-1]));cycles.append([v,*ns])
    result={**graph,'faces':faces,'mainFaces':main,'cycles':np.asarray(cycles,dtype=int).reshape(-1,5),
        'topologyProbe':record['probe'],'areaTopologyProof':proof}
    return result
