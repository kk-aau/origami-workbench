"""In[3428] nwper and ordered perconds; original indices are zero-based here."""
from collections import Counter
import numpy as np


def original_period_records(data, graph, pairs):
    points=np.asarray(data['mesh']['vertices_coords'],dtype=float)
    incidence=Counter(tuple(sorted((a,b))) for face in graph['faces']
                      for a,b in zip(face,face[1:]+face[:1]))
    # In[3428] takes geometric BoundaryEdges, independent of assigned B.
    interior=[tuple(edge) for edge in graph['edges'] if incidence[tuple(sorted(edge))]==2]
    ordered=interior+[edge[::-1] for edge in interior]
    records=[]
    for pair in pairs:
        if not isinstance(pair,list) or len(pair)!=2 or any(isinstance(v,bool) or not isinstance(v,int) or not 0<=v<len(points) for v in pair) or pair[0]==pair[1]:
            raise ValueError('周期配对需要两个不同的有效母结构顶点编号。')
        delta=points[pair[1]]-points[pair[0]]
        for color in (1,-1):
            corners=[];far=[]
            for v in pair:
                # Literal Select[ocnmap,...][[1,-1]]: original face order.
                faces=[f for f,face in enumerate(graph['originalFaces'])
                       if v in face and graph['colors'][f]==color]
                if not faces:raise ValueError('原周期配对缺少对应相位的母面角点。')
                corner=graph['corners'][faces[0],v]
                neighbors=[b for a,b in ordered if a==corner]
                if not neighbors:raise ValueError('原周期角点没有几何内部边，无法建立面积约束。')
                corners.append(corner);far.append(neighbors[0])
            records.append(dict(mother=pair.copy(),color=color,corners=corners,far=far,delta=delta.tolist()))
    return records


def period_values_jacobian(points,directions,variable,records,nv):
    """Raw (p_b-p_a-dr)·R90(dr), area(n_a+dr,p_b,n_b), in source order."""
    values=[];rows=[]
    def cross(a,b):return a[0]*b[1]-a[1]*b[0]
    def add(row,point,gradient):
        i=variable[point]
        if i>=0:row[i]+=float(gradient @ directions[point])
    for record in records:
        a,b=record['corners'];c,d=record['far'];delta=np.asarray(record['delta'])
        normal=np.array([-delta[1],delta[0]])
        row=np.zeros(nv);add(row,b,normal);add(row,a,-normal)
        values.append(float((points[b]-points[a]-delta) @ normal));rows.append(row)
        # Signed triangle area, not the parallel-tangent surrogate.
        translated=points[c]+delta
        u=points[b]-translated;v=points[d]-translated
        gu=np.array([v[1],-v[0]])/2;gv=np.array([-u[1],u[0]])/2
        row=np.zeros(nv);add(row,b,gu);add(row,d,gv);add(row,c,-gu-gv)
        values.append(float(cross(u,v)/2));rows.append(row)
    return np.array(values),np.asarray(rows).reshape(-1,nv)
