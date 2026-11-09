"""Finite literal In[3441] construction, with raw d/dd and its fixed CP chart.

This is not the current di/db constructor, nor a Wolfram FindMinimum emulator.
"""
import math
from collections import defaultdict,deque
import numpy as np
from tessellation_woven_graph import woven_graph_data
from tessellation_woven import inset_faces,_graph_inset_faces,_unfold
from tessellation_woven_merit import MeritBudget,solve_merit
from tessellation_patterns import make_fold

def _colored(data,parity,stationary):
    faces=data['sourceFaceCycles'];owners=defaultdict(list)
    for f,face in enumerate(faces):
        for a,b in zip(face,face[1:]+face[:1]):owners[tuple(sorted((a,b)))].append(f)
    links=defaultdict(list)
    for fs in owners.values():
        if len(fs)==2:a,b=fs;links[a].append(b);links[b].append(a)
    color={stationary:parity};pending=deque([stationary])
    while pending:
        a=pending.popleft()
        for b in links[a]:
            if b in color:
                if color[b]==color[a]:raise ValueError('原版本母图不能二着色。')
            else:color[b]=-color[a];pending.append(b)
    if len(color)!=len(faces):raise ValueError('原版本本有限域要求一个原材料部件；未猜测独立回展根。')
    return owners,color

def old_topology(data,inset,parity,stationary,budget):
    if not 0<=stationary<len(data['sourceFaceCycles']):raise ValueError('原版本原固定面编号越界。')
    points=np.asarray(data['mesh']['vertices_coords'],dtype=float);faces=data['sourceFaceCycles'];owners,color=_colored(data,parity,stationary)
    boundary={v for e,k in zip(data['mesh']['edges_vertices'],data['edgeLines']) if k<0 for v in e}
    beq=lambda a,b:a in boundary and b in boundary
    def bases_at(h):
        d=woven_graph_data({'vertices':points.tolist(),'edges':data['mesh']['edges_vertices']},h)
        return _graph_inset_faces(d,h) if d.get('concaveFaces') else inset_faces(d,h)
    insets=bases_at(inset);cp_insets=bases_at(.45*inset)
    base=[];cp_base=[];direction=[];groups=[];raw_index=[];corners={};anchors={};records=[];nd=ndd=0
    for f,face in enumerate(faces):
        record=[]
        for k,v in enumerate(face):
            prev,nex=face[k-1],face[(k+1)%len(face)];ep=points[v]-points[prev];ep/=np.linalg.norm(ep);en=points[nex]-points[v];en/=np.linalg.norm(en)
            sine=abs(float(en @ np.array([-ep[1],ep[0]])))
            if sine<1e-7:raise ValueError('原版本母图交角过小。')
            bp,bo=beq(prev,v),beq(v,nex);corner=len(base);corners[f,v]=corner
            if bp and bo:base.append(insets[f][k]);cp_base.append(cp_insets[f][k]);direction.append([0.,0.]);groups.append(None);raw_index.append(-1);record.append((v,corner,None));continue
            diverging=bp and color[f]==1 or bo and color[f]==-1
            vec=ep/sine if bp or not bo and color[f]==-1 else -en/sine
            index=ndd if diverging else nd
            if diverging:ndd+=1
            else:nd+=1
            base.append(insets[f][k]);cp_base.append(cp_insets[f][k]);direction.append(vec);groups.append('dd' if diverging else 'd');raw_index.append(index)
            anchor=None
            if bp or bo:anchor=len(base);anchors[f,v]=anchor;base.append(insets[f][k]);cp_base.append(cp_insets[f][k]);direction.append([0.,0.]);groups.append(None);raw_index.append(-1)
            record.append((v,corner,anchor))
        records.append(record)
    variable=np.array([index+(nd if group=='dd' else 0) if group else -1 for group,index in zip(groups,raw_index)],dtype=int)
    boundary_variable=np.array([False]*nd+[True]*ndd);base=np.asarray(base);direction=np.asarray(direction);cp_base=np.asarray(cp_base)
    initial=cp_base+direction*np.array([-.05*inset if g=='dd' else -.45*inset if g=='d' else 0. for g in groups])[:,None]
    edges=[];kinds=[];lookup={}
    def add(a,b,kind):
        if a is None or b is None or a==b:raise ValueError('原版本字面边引用退化或缺少原anchor；未补点修复作者输入。')
        key=tuple(sorted((a,b)))
        if key in lookup:raise ValueError('原版本字面构造产生重复原边；未静默去重。')
        lookup[key]=len(edges);edges.append((a,b));kinds.append(kind)
    for f,face in enumerate(faces):
        for a,b in zip(face,face[1:]+face[:1]):add(corners[f,a],corners[f,b],'B' if beq(a,b) else 'M')
    def neighbor(f,v,prev):
        face=faces[f];k=face.index(v);w=face[(k-1 if prev else k+1)%len(face)];return anchors.get((f,w),corners[f,w])
    for original in data['mesh']['edges_vertices']:
        a,b=sorted(original);fs=owners[a,b]
        if len(fs)!=2:continue
        left=next(f for f in fs if any(x==a and y==b for x,y in zip(faces[f],faces[f][1:]+faces[f][:1])));right=next(f for f in fs if f!=left)
        for v,is_first in ((a,True),(b,False)):
            sign=1 if is_first else -1
            if v not in boundary:
                if color[left]==sign:
                    add(neighbor(right,v,not is_first),neighbor(left,v,is_first),'V');add(corners[right,v],corners[left,v],'M')
            else:
                ar,al=anchors.get((right,v)),anchors.get((left,v));add(corners[right,v],ar,'B');add(corners[left,v],al,'B');add(ar,al,'B')
                if color[left]==-sign:add(neighbor(left,v,not is_first),al,'V');add(neighbor(right,v,is_first),ar,'V')
    around=[[] for _ in initial]
    for a,b in edges:around[a].append(b);around[b].append(a)
    for v,ns in enumerate(around):ns.sort(key=lambda n:math.atan2(initial[n,1]-initial[v,1],initial[n,0]-initial[v,0]))
    # Original AddTPlaneGraph consumes Edges, then reversed Edges, preserving
    # its first main-face indices rather than using a different face sort.
    seen=set();plane=[]
    for first in [*edges,*[(b,a) for a,b in edges]]:
        if first in seen:continue
        budget.spend();u,v=first;cycle=[]
        while (u,v) not in seen:seen.add((u,v));cycle.append(u);ns=around[v];u,v=v,ns[(ns.index(u)-1)%len(ns)]
        if (u,v)!=first or len(set(cycle))!=len(cycle):raise ValueError('原版本固定CP初值的原半边循环退化。')
        area=sum(initial[a,0]*initial[b,1]-initial[a,1]*initial[b,0] for a,b in zip(cycle,cycle[1:]+cycle[:1]))
        if area>1e-10:plane.append(cycle[::-1])
    if len(initial)-len(edges)+len(plane)!=1:raise ValueError('原版本固定CP初值未形成完整原纸面拓扑；没有改成新版探针。')
    main=[]
    for f,face in enumerate(faces):
        target={corners[f,v] for v in face};matches=[i for i,q in enumerate(plane) if set(q)==target]
        if len(matches)!=1:raise ValueError('原版本固定CP初值丢失原母面。')
        main.append(matches[0])
    if main!=list(range(len(faces))):raise ValueError('原版本原半边面顺序未保持原固定面索引；未重排掩盖。')
    counts=defaultdict(int)
    for face in plane:
        for a,b in zip(face,face[1:]+face[:1]):counts[tuple(sorted((a,b)))]+=1
    if any(counts[tuple(sorted(edge))] not in ((1,2) if kind=='B' else (2,)) for edge,kind in zip(edges,kinds)):raise ValueError('原版本原边面关联不完整。')
    cycles=np.array([[v,*ns] for v,ns in enumerate(around) if len(ns)==4],dtype=int).reshape(-1,5)
    return dict(base=base,directions=direction,variable=variable,boundaryVariable=boundary_variable,edges=edges,assignments=kinds,faces=plane,mainFaces=main,cycles=cycles,
        originalFaces=faces,corners=corners,anchors=anchors,colors=color),dict(dCount=nd,ddCount=ndd,initialCP=initial.tolist())

def construct_original_old(params):
    from tessellate import check_geometry,check_local_conditions
    budget=MeritBudget();inset=params['width']/2;data=woven_graph_data(params['graph'],inset,params.get('graphSource'))
    if data.get('motherComponents'):raise ValueError('原版本有限入口要求单个原母图，未添加原函数没有的独立回展根。')
    g,info=old_topology(data,inset,params['parity'],params['stationaryFace'],budget)
    lower=np.array([params['minPleat']*inset]*info['dCount']+[params['minBorderPleat']*inset]*info['ddCount'])
    solution,ff,report=solve_merit(g,lower,budget);budget.spend();cp,closure=_unfold(ff,g['edges'],g['faces'],params['stationaryFace'])
    budget.spend()
    if closure>2e-6:raise ValueError('原版本真实回展未闭合，未采用未认证候选。')
    fold=make_fold(cp,[list(e) for e in g['edges']],g['assignments'],g['faces']);geometry=check_geometry(fold);local=check_local_conditions(fold)
    budget.spend()
    if geometry['status']!='passed' or local['status'] not in ('passed','not_applicable'):raise ValueError('原版本候选未通过最终CP几何或局部门禁。')
    report={**report,'evaluationCount':budget.evaluations,'schema':'origamica-woven-old-merit-v1','objective':'sum-raw-d-dd-squared','variableUnits':'source-length','periodicContract':'not-in-original-old-definition'}
    contract={'schema':'origamica-woven-old-v1','function':'MakeSimpleWovenTessellationOld','definitionCell':'In[3441]',
        'inset':inset,'rawD':solution.x[:info['dCount']].tolist(),'rawDD':solution.x[info['dCount']:].tolist(),
        'originalStationaryFace':params['stationaryFace']+1,'signedStartFace':params['parity']*(params['stationaryFace']+1),
        'topologyInitialCP':info['initialCP'],'cpSubstitutions':{'h':.45*inset,'d':-.45*inset,'dd':-.05*inset},
        'unoptimizedFFSubstitutions':{'h':inset,'d':.8*inset,'dd':.2*inset},'originalOptimizer':'FindMinimum','wolframExecuted':False}
    source=dict(name='折纸工作台',license='GPL-3.0-only',algorithm='original woven d/dd / fixed CP chart',version=1,
        graph=params['graph'],edgeLines=data['edgeLines'],edgeWidths=data['edgeWidths'],sourceFaceCycles=data['sourceFaceCycles'],foldedForm=ff.tolist(),
        defaultInset=inset,borderInset=inset,stationaryFace=params['stationaryFace'],stationaryFoldFace=params['stationaryFace'],edgeOwnerMeaning='boundary=-1;finite-interior=0',
        closureError=closure,optimization='original-old-findminimum',oldWoven=contract,oldMeritReport=report)
    if params.get('graphSource'):
        source.update(graphSource=params['graphSource'],originalEdgeForSegment=data['graphSourceInfo']['originalEdgeForSegment'],invertFoldType=params['graphSource']['invertFoldType'])
        if params['graphSource']['invertFoldType']:fold['edges_assignment']=[{'M':'V','V':'M'}.get(k,k) for k in fold['edges_assignment']];fold['edges_foldAngle']=[-a if a is not None else None for a in fold['edges_foldAngle']]
    return fold,data['mesh'],None,len(data['sourceFaceCycles']),source
