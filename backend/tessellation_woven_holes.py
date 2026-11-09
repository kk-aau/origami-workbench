"""Explicit excision of bounded mother cells; never infer holes from nesting."""
from collections import Counter, defaultdict


def select_mother_holes(ids, faces, outer, edges, components):
    if not isinstance(ids,list) or not 1<=len(ids)<=32 or any(isinstance(i,bool) or not isinstance(i,int) or not 0<=i<len(faces) for i in ids) or len(set(ids))!=len(ids):
        raise ValueError('母图孔洞需要1–32个不重复的原半边面编号。')
    holes=[faces[i] for i in ids];border={v for ring in outer for v in ring}
    if any(border.intersection(ring) for ring in holes):raise ValueError('母图孔洞必须在纸面内部，不能接触外边界。')
    if any(set(ring).intersection(other) for i,ring in enumerate(holes) for other in holes[i+1:]):raise ValueError('母图孔洞不能相接或共用顶点；合并孔洞需另行定义。')
    kept=[f for i,f in enumerate(faces) if i not in ids]
    owners=defaultdict(list)
    for fi,face in enumerate(kept):
        for a,b in zip(face,face[1:]+face[:1]):owners[tuple(sorted((a,b)))].append(fi)
    if any(len(owners[tuple(sorted(edge))]) not in (1,2) for edge in edges):raise ValueError('孔洞移除后存在未被纸面使用的源边。')
    adjacent=defaultdict(list)
    for fs in owners.values():
        if len(fs)==2:
            a,b=fs;adjacent[a].append(b);adjacent[b].append(a)
    for comp in components:
        fs={i for i,face in enumerate(kept) if face[0] in comp}
        if not fs:raise ValueError('孔洞不能移除整个母图部件。')
        reached={min(fs)};pending=list(reached)
        while pending:
            for f in adjacent[pending.pop()]:
                if f not in reached:reached.add(f);pending.append(f)
        if reached!=fs:raise ValueError('孔洞移除后纸面通过点接触或断开，不能沿用原部件身份。')
    return kept,dict(motherHoleCycles=[list(f) for f in holes],motherHoleFaceIds=ids.copy(),motherRetainedFaceIds=[i for i in range(len(faces)) if i not in ids])


def without_hole_faces(plane_faces, data, corners, anchors):
    """Bind a probe void to the original hole cycle via corner provenance.

    Coordinates may move in negative topology charts. Centroid containment
    would misclassify such charts; use the cyclic original vertex sequence.
    """
    holes=data.get('motherHoleCycles',[])
    if not holes:return plane_faces
    def cycle_key(c):
        return min(tuple(q[i:]+q[:i]) for q in (c,c[::-1]) for i in range(len(q)))
    expected=Counter(cycle_key(h) for h in holes)
    source={corner:v for (_,v),corner in corners.items()}
    source.update({anchor:v for (_,v),anchor in anchors.items()})
    kept=[];matched=Counter()
    for face in plane_faces:
        collapsed=[]
        for vertex in face:
            v=source[vertex]
            if not collapsed or v!=collapsed[-1]:collapsed.append(v)
        if len(collapsed)>1 and collapsed[0]==collapsed[-1]:collapsed.pop()
        key=cycle_key(collapsed)
        if key in expected:matched[key]+=1
        else:kept.append(face)
    if matched!=expected:raise ValueError('负初值探测未唯一恢复每个母图孔洞，不能填补或猜测缺失的面。')
    return kept
