"""Finite In[1527] MinTotalPleat, including the common final RMS fit.

The supplied dual determines every width sign. This is not the existing
centroid projection or MaxMinPleat objective, and no alternative is a fallback.
Only connected finite inputs with a certified unique anchored LP are emitted.
"""
import copy
import math


def validate_min_total_request(data):
    mother = data.get('motherParams')
    allowed = {'family', 'vertices', 'faces', 'repeatX', 'repeatY', 'angle', 'scale', 'customOutput'}
    if data.get('family') != 'primal-dual' or data.get('reciprocalMethod') != 'original-min-total-pleat' or not isinstance(mother, dict) or mother.get('family') != 'custom' or set(mother) - allowed or mother.get('repeatX', 1) != 1 or mother.get('repeatY', 1) != 1 or mother.get('customOutput', 'twist') != 'twist' or any(k in data for k in ('dualEdgeFlips', 'pruneBoundary', 'paper')) or data.get('postRotation', 'none') != 'none':
        raise ValueError('原最小总褶宽仅接单份显式自定义母结构与输入对偶，不接拓扑扩展、翻转、裁剪、纸张或追加旋转。')
    faces, vertices, dual = mother.get('faces'), mother.get('vertices'), data.get('dualTargets')
    if not isinstance(faces, list) or not 2 <= len(faces) <= 16 or any(not isinstance(f, list) or not 3 <= len(f) <= 8 for f in faces) or not isinstance(vertices, list) or not 3 <= len(vertices) <= 64 or not isinstance(dual, list) or len(dual) != len(faces):
        raise ValueError('原最小总褶宽需2–16个母面（每面3–8点）、3–64个母点及逐母面输入对偶点。')


def _points(value, minimum, maximum, label):
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ValueError(f'{label}数量超出原最小总褶宽有限入口。')
    if any(not isinstance(p, list) or len(p) != 2 or any(
            isinstance(x, bool) or not isinstance(x, (int, float)) or
            abs(x) > 1000 or not math.isfinite(x) for x in p) for p in value):
        raise ValueError(f'{label}须为有限二维数值，坐标绝对值不超过1000。')
    return [[float(x) for x in p] for p in value]


def _edges(value, count, label):
    if not isinstance(value, list) or not 1 <= len(value) <= 32 or any(
            not isinstance(e, list) or len(e) != 2 or any(type(i) is not int or
            not 0 <= i < count for i in e) or e[0] == e[1] for e in value):
        raise ValueError(f'{label}须为1–32条有序非自环整数索引边。')
    if len({tuple(sorted(e)) for e in value}) != len(value):
        raise ValueError(f'{label}含重复边，当前有限入口未猜测重复配对。')
    return copy.deepcopy(value)


def make_min_total_pleat(vertices, interior_edges, dual_vertices, dual_edges):
    import numpy as np
    from scipy.optimize import linprog
    vertices = _points(vertices, 2, 256, '原始点')
    initial = _points(dual_vertices, 2, 16, '输入对偶点')
    interior_edges = _edges(interior_edges, len(vertices), '内部原始边')
    dual_edges = _edges(dual_edges, len(initial), '对偶边')
    if len(interior_edges) != len(dual_edges):
        raise ValueError('内部原始边与对偶边须按原输入顺序逐项配对。')
    reached = {0}
    while True:
        expanded = reached | {b for a, b in dual_edges if a in reached} | {a for a, b in dual_edges if b in reached}
        if expanded == reached:
            break
        reached = expanded
    if len(reached) != len(initial):
        raise ValueError('原最小总褶宽有限入口仅接受连通对偶图，未补锚定或移动孤点。')
    count = 2 * len(initial)
    orthogonal, widths, signs = [], [], []
    for (a, b), (f, g) in zip(interior_edges, dual_edges):
        tangent = np.asarray(vertices[a]) - vertices[b]  # source Subtract@@pair
        norm = math.sqrt(float(tangent @ tangent))       # NormalizeReal / Mag
        if norm < 1e-8:
            raise ValueError('内部原始边退化或过短，未输出原最小总褶宽结果。')
        tangent /= norm
        normal = np.array([-tangent[1], tangent[0]])     # Rotate90
        initial_width = float(normal @ (np.asarray(initial[f]) - initial[g]))
        sign = 1 if initial_width > 0 else -1 if initial_width < 0 else 0
        if sign == 0:
            raise ValueError('输入对偶使原Sign为零，dplens恒为零不能满足>=1；未替换输入符号。')
        signs.append(sign)
        row = np.zeros((len(initial), 2));row[f], row[g] = tangent, -tangent
        orthogonal.append(row.ravel())
        row = np.zeros((len(initial), 2));row[f], row[g] = sign * normal, -sign * normal
        widths.append(row.ravel())
    orthogonal, widths = np.asarray(orthogonal), np.asarray(widths)
    anchor = np.zeros((2, count));anchor[0, 0] = anchor[1, 1] = 1
    equalities = np.vstack([anchor, orthogonal])
    objective = widths.sum(axis=0)
    result = linprog(objective, A_eq=equalities, b_eq=np.zeros(len(equalities)),
                     A_ub=-widths, b_ub=-np.ones(len(widths)),
                     bounds=[(None, None)] * count, method='highs')
    if not result.success:
        raise ValueError('原MinTotalPleat锚定线性规划无有限可行解；未回退其它方法或输出CP。')
    value = result.x
    equality_multipliers = result.eqlin.marginals
    width_multipliers = -result.ineqlin.marginals
    floor = widths @ value
    threshold = 1e-9 * max(1, float(np.max(width_multipliers)))
    positive = [i for i, v in enumerate(width_multipliers) if v > threshold]
    unique_matrix = np.vstack([equalities, widths[positive]])
    rank = int(np.linalg.matrix_rank(unique_matrix, tol=1e-9))
    residual = max(float(np.max(np.abs(equalities @ value))),
                   float(np.max(np.abs(objective - equalities.T @ equality_multipliers - widths.T @ width_multipliers))),
                   float(np.max(np.abs(width_multipliers * (floor - 1)))),
                   abs(float(objective @ value - np.sum(width_multipliers))))
    if np.min(floor) < 1 - 1e-8 or np.min(width_multipliers) < -1e-9 or residual > 1e-8:
        raise ValueError('原MinTotalPleat线性规划最优证书未通过，未输出CP。')
    if rank != count:
        raise ValueError('原MinTotalPleat最优坐标未通过唯一性证书，当前有限入口未猜测FindMinimum的平局选择。')
    normalized = value.reshape(-1, 2)
    supplied = np.asarray(initial)
    q = normalized - normalized.mean(axis=0)
    p = supplied - supplied.mean(axis=0)
    denominator = float(np.sum(q * q))
    if denominator <= 1e-12:
        raise ValueError('原MinTotalPleat公共尺度拟合退化，未输出CP。')
    scale = float(np.sum(q * p) / denominator)
    translation = supplied.mean(axis=0) - scale * normalized.mean(axis=0)
    fitted = scale * normalized + translation
    if not math.isfinite(scale) or scale <= 1e-8 or not np.isfinite(fitted).all():
        raise ValueError('原MinTotalPleat公共尺度拟合未形成稳定正向对偶，当前有限入口拒绝输出CP。')
    proof = dict(schema='origamica-reciprocal-min-total-pleat-v1', function='MakeReciprocalDiagram',
                 definitionCell='In[1527]', definitionLines=[105170, 105763], method='MinTotalPleat',
                 branchLines=[105409, 105435], commonSolveLines=[105595, 105625],
                 commonFitLines=[105627, 105674], indexConvention='zero-based; supplied pairing order',
                 input=dict(vertices=vertices, interiorEdges=interior_edges, dualVertices=initial, dualEdges=dual_edges),
                 inputSigns=signs, anchor=[0, 0], minimumNormalizedPleat=1,
                 normalizedDualVertices=normalized.tolist(), normalizedPleatLengths=floor.tolist(),
                 totalNormalizedPleat=float(objective @ value),
                 certificate=dict(equalityMultipliers=equality_multipliers.tolist(), widthMultipliers=width_multipliers.tolist(),
                                  positiveWidthConstraints=positive, uniqueRank=rank, variableCount=count,
                                  tolerance=1e-8, rankTolerance=1e-9, positiveThreshold=threshold),
                 fit=dict(scale=scale, translation=translation.tolist(),
                          squaredDeviation=float(np.sum((fitted - supplied) ** 2))),
                 returnedDualVertices=fitted.tolist(), solver='SciPy HiGHS linear programming; closed-form common RMS fit',
                 uniqueOptimumRequired=True, wolframExecuted=False, symbolicOptionsImplemented=False)
    return fitted.tolist(), proof


def min_total_pleat_from_mother(mother, initial):
    """Explicit adapter creates the ordered TPrimalDual input from the current mother."""
    from collections import defaultdict
    from tessellation_patterns import make_fold
    from tessellation_dual_faces import reciprocal_face_topology
    if len(initial) != len(mother['faces_vertices']):
        raise ValueError('原最小总褶宽输入对偶点须与母面顺序一一对应。')
    incident = defaultdict(list)
    for f, face in enumerate(mother['faces_vertices']):
        for a, b in zip(face, face[1:] + face[:1]):
            incident[tuple(sorted((a, b)))].append(f)
    pairs = [(list(edge), adjacent) for edge, adjacent in sorted(incident.items()) if len(adjacent) == 2]
    centers, proof = make_min_total_pleat(mother['vertices_coords'], [edge for edge, _ in pairs],
                                        initial, [adjacent for _, adjacent in pairs])
    dual_edges = [adjacent for _, adjacent in pairs]
    dual_faces, owners = reciprocal_face_topology(mother, dual_edges)
    dual = make_fold(centers, dual_edges, ['A'] * len(dual_edges), dual_faces)
    dual['zhezhi_dual_primal_vertices'] = owners
    proof['motherAdapter'] = 'sorted undirected shared primal edges; paired face traversal order; explicit input duals'
    return centers, dual, proof


def validate_custom_mother_input(params, mother):
    """Bind this finite route to a single unmodified explicit custom input."""
    coords, faces, lookup = [], [], {}
    for face in params['faces']:
        ids = []
        for i in face:
            key = tuple(round(float(v), 9) + 0.0 for v in params['vertices'][i])
            if key not in lookup:
                lookup[key] = len(coords);coords.append(list(key))
            ids.append(lookup[key])
        area = sum(coords[a][0] * coords[b][1] - coords[b][0] * coords[a][1]
                   for a, b in zip(ids, ids[1:] + ids[:1]))
        faces.append(ids[::-1] if area > 0 else ids)
    if coords != mother['vertices_coords'] or faces != mother['faces_vertices']:
        raise ValueError('原最小总褶宽有限入口不接合并退化点、T接头补分段或改变母面次序的输入。')
