"""Five Resch star tilings from angle-compatible periodic polygon meshes.

At each vertex exactly one star tip and one reflex corner replace the two
regular polygon corners. Develop their unit edges in the plane; the resulting
translations, rather than bounding-box guesses, define the star lattice.
"""
import cmath
import math
from collections import defaultdict, deque
from functools import lru_cache

from tessellation_uniform import recover_cell, uniform_cell, _shape, _cross
from tessellation_meshes import polygon_mesh


@lru_cache(maxsize=5)
def _base(index):
    if index==2:return uniform_cell(16)
    if index==3:
        u=complex(1.5,math.sqrt(3)/2);v=complex(0,math.sqrt(3))
        # Three-color a honeycomb; retain one hexagon and deform the other two.
        return dict(polygons=[[[p.real,p.imag] for p in (z+c for z in _shape(6))]
                              for c in (0j,u,v)],lattice=[[3,0],[1.5,3*math.sqrt(3)/2]])
    n,regular={1:(6,3),4:(8,4),5:(12,3)}[index]
    periods=[1,1] if index==1 else [2,1]
    adjacent=[[[1,0,False]],[[0,0,False]]] if index==1 else [[[1,0,False],[0,1,False]],[[0,0,False]]]
    return recover_cell(dict(sides=[n,regular],periods=periods,adjacent=adjacent,vertexTypes=[],reference='regular polygon angle closure'))


def _topology(polygons,lattice,stars):
    u,v=(complex(*p) for p in lattice);det=_cross(u,v)
    def fractions(p):return _cross(p,v)/det,_cross(u,p)/det
    def wrapped(p):
        a,b=fractions(p)
        return round(a%1,7)%1,round(b%1,7)%1
    vertices=defaultdict(list);edges=defaultdict(list)
    for f,polygon in enumerate(polygons):
        for e,a in enumerate(polygon):
            b=polygon[(e+1)%len(polygon)]
            if stars[f]:vertices[wrapped(a)].append((f,e))
            d=b-a
            if d.real < -1e-7 or (abs(d.real)<1e-7 and d.imag<0):d=-d
            edges[(wrapped((a+b)/2),round(d.real,7),round(d.imag,7))].append((f,e))
    constraints=defaultdict(list)
    for corners in vertices.values():
        if len(corners)!=2:raise ValueError('Resch 内点必须恰有两个星形角。')
        (a,i),(b,j)=corners; parity=1^(i%2)^(j%2)
        constraints[a].append((b,parity));constraints[b].append((a,parity))
    phase={}
    for f in range(len(polygons)):
        if not stars[f] or f in phase:continue
        phase[f]=0;queue=deque([f])
        while queue:
            a=queue.popleft()
            for b,parity in constraints[a]:
                wanted=phase[a]^parity
                if b in phase:
                    if phase[b]!=wanted:raise ValueError('星形周期需要扩大。')
                else:phase[b]=wanted;queue.append(b)
    adjacent={}
    for pair in edges.values():
        if len(pair)!=2:raise ValueError('Resch 周期边未配对。')
        for (f,e),(g,h) in (pair,pair[::-1]):
            delta=polygons[f][e]-polygons[g][(h+1)%len(polygons[g])]
            a,b=fractions(delta)
            if abs(a-round(a))+abs(b-round(b))>1e-5:raise ValueError('Resch 周期边方向不一致。')
            adjacent[f,e]=(g,h,round(a),round(b))
    return phase,adjacent


def _star(n,angle,phase):
    ratio=math.sin(angle/2)/math.sin(angle/2+2*math.pi/n)
    polygon=[(1 if i%2==phase else ratio)*cmath.exp(2j*math.pi*i/n) for i in range(n)]
    size=abs(polygon[1]-polygon[0])
    return tuple(p/size for p in polygon)


@lru_cache(maxsize=32)
def resch_cell(index,tip_degrees):
    if isinstance(index,bool) or index not in range(1,6):raise ValueError('Resch 编号必须为 1–5。')
    if not math.isfinite(tip_degrees) or not 0<tip_degrees<60:raise ValueError('星尖角必须大于 0° 且小于 60°。')
    base=_base(index);base_polygons=[[complex(*p) for p in polygon] for polygon in base['polygons']]
    base_u,base_v=(complex(*p) for p in base['lattice'])
    base_stars=[(index!=3 or i!=0) and len(p)=={1:6,2:6,3:6,4:8,5:12}[index]
                for i,p in enumerate(base_polygons)]
    for factor in (1,2):
        polygons=[tuple(z+i*base_u+j*base_v for z in p) for i in range(factor) for j in range(factor) for p in base_polygons]
        stars=base_stars*(factor*factor)
        lattice=[[factor*base_u.real,factor*base_u.imag],[factor*base_v.real,factor*base_v.imag]]
        try:phase,adjacent=_topology(polygons,lattice,stars);break
        except ValueError:
            if factor==2:raise
    shapes=[_star(len(p),math.radians(tip_degrees),phase[f]) if stars[f] else _shape(len(p)) for f,p in enumerate(polygons)]
    positions={(0,0,0):(1+0j,0j)};queue=deque([(0,0,0)])
    while queue:
        f,i,j=queue.popleft();r,c=positions[f,i,j];shape=shapes[f]
        for e in range(len(shape)):
            g,h,di,dj=adjacent[f,e];ni,nj=i+di,j+dj
            if abs(ni)>2 or abs(nj)>2:continue
            a,b=c+r*shape[e],c+r*shape[(e+1)%len(shape)]
            q=shapes[g];nr=(a-b)/(q[(h+1)%len(q)]-q[h]);nc=b-nr*q[h]
            key=g,ni,nj
            if key in positions:
                old_r,old_c=positions[key]
                if abs(nr-old_r)+abs(nc-old_c)>1e-6:raise ValueError('星形铺砌的角度闭合不一致。')
            else:positions[key]=(nr,nc);queue.append(key)
    u=positions[0,1,0][1];v=positions[0,0,1][1]
    if abs(positions[0,1,0][0]-1)+abs(positions[0,0,1][0]-1)>1e-6:raise ValueError('星形周期不是平移。')
    result=[]
    for f,shape in enumerate(shapes):
        r,c=positions[f,0,0]
        result.append([[z.real,z.imag] for z in (c+r*p for p in shape)])
    return dict(polygons=result,stars=stars,lattice=[[u.real,u.imag],[v.real,v.imag]],starTipAngle=tip_degrees,index=index)


def resch_mesh(index,tip_degrees,rings):
    cell=resch_cell(index,tip_degrees);u,v=cell['lattice'];polygons=[]
    for p,star in zip(cell['polygons'],cell['stars']):
        if not star:pieces=[p]
        else:
            # Alternating reflex vertices form a convex central polygon.
            reflex=[i for i,b in enumerate(p) if _cross(complex(*b)-complex(*p[i-1]),complex(*p[(i+1)%len(p)])-complex(*b))<0]
            pieces=[[p[i] for i in reflex]]+[[p[i-1],p[i],p[(i+1)%len(p)]] for i in range(len(p)) if i not in reflex]
        for i in range(rings+1):
            for j in range(rings+1):
                polygons.extend([[[x+i*u[0]+j*v[0],y+i*u[1]+j*v[1]] for x,y in piece] for piece in pieces])
    return polygon_mesh(polygons)
