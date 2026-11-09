"""Finite literal In[3411]: endpoint Indexify, then Intersectify/Indexify.

The TGraph returned by the original function has no Faces. Face discovery and
woven eligibility are separate adapter checks, and never rewrite this graph.
"""
import copy
import itertools
import math

CHOP_TOLERANCE = 1e-10


def _chop(x):
    return 0. if abs(x) < CHOP_TOLERANCE else x


def _sub(a, b):
    return [a[0]-b[0], a[1]-b[1]]


def _dot(a, b):
    return a[0]*b[0]+a[1]*b[1]


def _at(a, direction, t):
    return [a[k]+t*direction[k] for k in (0, 1)]


def indexify(segments, tolerance):
    """First matching existing representative; not transitive clustering."""
    vertices, edges = [], []
    for segment in segments:
        edge = []
        for point in segment:
            found = next((i for i, p in enumerate(vertices)
                          if sum((x-y)**2 for x, y in zip(p, point)) <= tolerance**2), None)
            if found is None:
                found = len(vertices)
                vertices.append(point[:])
            edge.append(found)
        edges.append(edge)
    return dict(vertices=vertices, edges=edges)


def segment_medial(p1, p2, q1, q2, *, all_minima=False):
    """In[179] candidate order, half-distance, and parallel overlap midpoint."""
    dp, dq = _sub(p2, p1), _sub(q2, q1)
    if all(_chop(x) == 0 for x in dp) or all(_chop(x) == 0 for x in dq):
        raise ValueError('原Graph首轮合点使线段退化，SegmentSegmentMedialInfo不能接零长段；未修补或输出CP。')
    pp, pq, qq = _dot(dp, dp), _dot(dp, dq), _dot(dq, dq)
    determinant = pq**2-pp*qq

    def candidate_points(rp, rq, tp, tq, from_q=False):
        middle = [(a+b)/2 for a, b in zip(rp, rq)]
        diff = _sub(middle, rq if from_q else rp)
        return middle, math.sqrt(_dot(diff,diff)), [tp, tq]

    def candidate(tp, tq):
        return candidate_points(_at(p1, dp, tp), _at(q1, dq, tq), tp, tq)

    candidates = []
    if _chop(determinant) == 0:
        low, high = sorted([_dot(_sub(q1, p1), dp)/pp, _dot(_sub(q2, p1), dp)/pp])
        if low <= 1 and high >= 0:
            tp = (max(low, 0)+min(high, 1))/2
            rp = _at(p1, dp, tp)
            result = candidate(tp, _dot(_sub(rp, q1), dq)/qq)
            return [result] if all_minima else result
    else:
        dqp = _sub(q1, p1)
        pd, qd = _dot(dp, dqp), _dot(dq, dqp)
        candidates.append(candidate((pq*qd-pd*qq)/determinant,
                                    (pp*qd-pq*pd)/determinant))
    candidates.extend(candidate_points(p, q, tp, tq)
                      for tp, p in ((0, p1), (1, p2)) for tq, q in ((0, q1), (1, q2)))
    for tp, p in ((0, p1), (1, p2)):
        tq = _dot(_sub(p, q1), dq)/qq
        candidates.append(candidate_points(p, _at(q1, dq, tq), tp, tq))
    for tq, q in ((0, q1), (1, q2)):
        tp = _dot(_sub(q, p1), dp)/pp
        candidates.append(candidate_points(_at(p1, dp, tp), q, tp, tq, True))
    admissible = [c for c in candidates if all(0 <= t <= 1 for t in c[2])]
    best = min(admissible, key=lambda c: c[1])
    # The strict source Sort does not specify equal-key stability. In this
    # finite machine domain every tied minimum must identify the same medial
    # geometry and endpoint/Chop branch. Material ambiguity is not guessed.
    for other in admissible:
        if other[1] == best[1] and (any(abs(x-y)>1e-12 for x,y in zip(other[0],best[0])) or
                any((_chop(x)==0,_chop(x-1)==0)!=(_chop(y)==0,_chop(y-1)==0)
                    for x,y in zip(other[2],best[2]))):
            raise ValueError('原Graph最小距离排序存在不同几何或端点分支的平局，当前有限数值域未猜测原Sort结果，未输出CP。')
    ties = []
    for item in admissible:
        if item[1] == best[1] and item not in ties:ties.append(item)
    return ties if all_minima else best


def _boxes_overlap(p1, p2, q1, q2, tolerance):
    return all(not (max(p1[k], p2[k]) < min(q1[k], q2[k])-tolerance or
                   max(q1[k], q2[k]) < min(p1[k], p2[k])-tolerance) for k in (0, 1))


def original_graph(complete_lines, same_pt_tolerance=1e-6, intersection_tolerance=1e-6):
    for value in (same_pt_tolerance, intersection_tolerance):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= .1:
            raise ValueError('原Graph两项公差须为0–0.1的有限数。')
    first = indexify(complete_lines, same_pt_tolerance)
    vertices, edges = first['vertices'], first['edges']
    # MakeTGraph stores these ordered vertices/edges verbatim; Faces starts [].
    pair_results = []
    for i, (a, b) in enumerate(edges):
        p1, p2 = vertices[a], vertices[b]
        for j in range(i+1, len(edges)):
            c, d = edges[j]
            q1, q2 = vertices[c], vertices[d]
            if not _boxes_overlap(p1, p2, q1, q2, intersection_tolerance):
                continue
            minima = segment_medial(p1, p2, q1, q2, all_minima=True)
            if _chop(minima[0][1]) <= intersection_tolerance/2:
                pair_results.append((i, j, minima))
    branch_count = math.prod(len(minima) for _, _, minima in pair_results)
    if branch_count > 64:
        raise ValueError('原Graph等距排序分支超过独立64分支预算，当前有限数值域未猜测排序或输出CP。')

    def embedded_result(selected):
        edge_points = [[(vertices[a][:], 0.), (vertices[b][:], 1.)] for a, b in edges]
        for (i, j, _), (middle, _, ts) in zip(pair_results, selected):
            for index, t in ((i, ts[0]), (j, ts[1])):
                if _chop(t) != 0 and _chop(t-1) != 0:
                    edge_points[index].append((middle[:], t))
        embedded, origins = [], []
        for i, points in enumerate(edge_points):
            for j, (p, t) in enumerate(points):
                if any(t == u and p != q for q, u in points[j+1:]):
                    raise ValueError('原Graph出现同参数的不同交点，当前有限数值域不能确定原Sort次序；未重排或输出CP。')
            ordered = [p for p, _ in sorted(points, key=lambda item: item[1])]
            for a, b in zip(ordered, ordered[1:]):
                embedded.append([a[:], b[:]])
                origins.append(i)
        second = indexify(embedded, same_pt_tolerance)
        removed = [i for i, (a, b) in enumerate(second['edges']) if a == b]
        kept = [i for i, (a, b) in enumerate(second['edges']) if a != b]
        graph = dict(vertices=copy.deepcopy(second['vertices']),
                     edges=[second['edges'][i][:] for i in kept], faces=[])
        return embedded, origins, second, removed, kept, graph

    reference = None
    for selected in itertools.product(*(minima for _, _, minima in pair_results)):
        result = embedded_result(selected)
        if reference is None:reference = result
        else:
            first_graph, other_graph = reference[-1], result[-1]
            same_topology = first_graph['edges'] == other_graph['edges'] and len(first_graph['vertices']) == len(other_graph['vertices'])
            same_points = same_topology and all(abs(x-y)<=1e-12 for p,q in zip(first_graph['vertices'],other_graph['vertices']) for x,y in zip(p,q))
            if not same_points or reference[1] != result[1] or reference[2]['edges'] != result[2]['edges'] or reference[3:5] != result[3:5]:
                raise ValueError('原Graph等距排序分支产生不同二轮索引或边来源，当前有限数值域未猜测原Sort结果，未输出CP。')
    embedded, origins, second, removed, kept, graph = reference
    proof = dict(schema='origamica-courteous-graph-v1', function='MakeCourteousAnarchyGraph',
                 definitionCells=['In[3410]', 'In[3411]'],
                 definitionLines=[[252214,252224],[252226,252266]],
                 indexConvention='zero-based; source traversal order',
                 samePtTolerance=same_pt_tolerance, intersectionTolerance=intersection_tolerance,
                 sameTest='SamePtQ=PtOnPtQ', startPoints=[], chopTolerance=CHOP_TOLERANCE,
                 numericalTiePolicy='all minimum-distance branches checked; identical ordered graph topology and roundoff-equivalent coordinates required',
                 medialTieBranchesChecked=branch_count, medialTieBranchLimit=64,
                 firstIndex=first, embeddedSegments=embedded, embeddedEdgeOrigins=origins,
                 secondIndex=second, removedSelfLoopSegments=removed,
                 edgeOrigins=[origins[i] for i in kept], graph=graph,
                 wolframExecuted=False, fullSymbolicOptionsImplemented=False,
                 finiteOptions=['SamePtTolerance','IntersectionTolerance'])
    return graph, proof


def courteous_graph_data(lines, info, boundary, width, same_pt_tolerance=1e-6, intersection_tolerance=1e-6):
    """Use the literal graph as mother; do not feed Lines to arrangement."""
    from tessellation_woven_graph import woven_graph_data
    graph, proof = original_graph(info['courteousAnarchy']['completeLines'], same_pt_tolerance, intersection_tolerance)
    try:
        data = woven_graph_data({'vertices': graph['vertices'], 'edges': graph['edges']}, width/2)
    except ValueError as exc:
        raise ValueError(f'原Graph公差生成的母图未通过编织几何门禁：{exc} 原图未合并重复边、删边或修补，未输出CP。') from exc
    owners = [-1 if i < len(boundary) else i-len(boundary) for i in proof['edgeOrigins']]
    if any((kind == 'B') != (owner < 0) for kind, owner in zip(data['mesh']['edges_assignment'], owners)):
        raise ValueError('原Graph公差改变了边界与内线归属，未通过编织来源门禁，未输出CP。')
    data.update(lines=copy.deepcopy(lines), edgeLines=owners,
                edgeWidths=[0 if i < 0 else lines[i][2] for i in owners],
                boundary=copy.deepcopy(boundary), graphMode=False)
    info = copy.deepcopy(info)
    info['courteousAnarchy'].update(motherGraphRoute='original-indexify-maketgraph-intersectify', originalGraphOptionsReproduced=True)
    info['courteousGraph'] = proof
    return data, info
