"""Clip a finite, convex-faced crease pattern to one convex paper polygon.

This operates on the actual faces, not a decorative border.  Its deliberately
narrow input domain keeps every output edge accountable to either an original
crease or the new paper boundary.  It does not prove flat-foldability.
"""
from __future__ import annotations

from collections import defaultdict, deque
import math

from tessellation_patterns import make_fold


def _cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _area(poly):
    return sum(a[0] * b[1] - a[1] * b[0]
               for a, b in zip(poly, poly[1:] + poly[:1])) / 2


def _convex(poly, tolerance):
    turns = [_cross(a, b, c) for a, b, c in
             zip(poly, poly[1:] + poly[:1], poly[2:] + poly[:2])]
    return all(t > tolerance for t in turns) or all(t < -tolerance for t in turns)


def _on_segment(p, a, b, tolerance):
    length = math.dist(a, b)
    if length <= tolerance:
        return False
    t = ((p[0] - a[0]) * (b[0] - a[0]) +
         (p[1] - a[1]) * (b[1] - a[1])) / (length * length)
    return (-tolerance / length <= t <= 1 + tolerance / length and
            abs(_cross(a, b, p)) <= tolerance * length)


def _clip_face(face, paper, tolerance):
    result = face
    for a, b in zip(paper, paper[1:] + paper[:1]):
        previous = result
        result = []
        if not previous:
            break
        for p, q in zip(previous[-1:] + previous[:-1], previous):
            dp, dq = _cross(a, b, p), _cross(a, b, q)
            inside_p, inside_q = dp >= -tolerance, dq >= -tolerance
            if inside_p != inside_q:
                fraction = dp / (dp - dq)
                result.append([p[0] + fraction * (q[0] - p[0]),
                               p[1] + fraction * (q[1] - p[1])])
            if inside_q:
                result.append(q)
        distinct = []
        for p in result:
            if not distinct or math.dist(p, distinct[-1]) > tolerance:
                distinct.append(p)
        if len(distinct) > 1 and math.dist(distinct[0], distinct[-1]) <= tolerance:
            distinct.pop()
        result = distinct
    return result


def _weights(point, face, coords, tolerance):
    """Barycentric map in one of a convex face's fan triangles."""
    for j in range(1, len(face) - 1):
        ids = [face[0], face[j], face[j + 1]]
        a, b, c = (coords[i] for i in ids)
        denominator = _cross(a, b, c)
        if abs(denominator) <= tolerance * tolerance:
            continue
        weights = [_cross(point, b, c) / denominator,
                   _cross(point, c, a) / denominator,
                   _cross(point, a, b) / denominator]
        if min(weights) >= -tolerance / max(math.dist(a, b), math.dist(b, c), 1):
            return ids, weights
    raise ValueError('裁剪交点不能映射回原始纸面。')


def map_vertex_values(vertex_map, values):
    """Map per-vertex vectors, including source folded coordinates."""
    if not values:
        raise ValueError('原始逐点数据为空。')
    mapped = []
    for item in vertex_map:
        indices, weights = item['vertices'], item['weights']
        if any(i >= len(values) for i in indices):
            raise ValueError('原始逐点数据缺少顶点。')
        width = len(values[indices[0]])
        if any(len(values[i]) != width for i in indices):
            raise ValueError('原始逐点数据维度不一致。')
        mapped.append([sum(weight * values[i][axis]
                           for i, weight in zip(indices, weights))
                       for axis in range(width)])
    return mapped


def _paper_boundary(fold):
    """Return the sole original B cycle in traversal order."""
    neighbors = defaultdict(list)
    for (a, b), kind in zip(fold['edges_vertices'], fold['edges_assignment']):
        if kind == 'B':
            neighbors[a].append(b)
            neighbors[b].append(a)
    if len(neighbors) < 3 or any(len(pair) != 2 for pair in neighbors.values()):
        raise ValueError('原纸张外围须为一条无分叉闭环。')
    cycle, previous = [min(neighbors)], None
    while True:
        current = cycle[-1]
        following = next(v for v in neighbors[current] if v != previous)
        if following == cycle[0]:
            break
        if following in cycle or len(cycle) >= len(neighbors):
            raise ValueError('原纸张外围不是简单闭环。')
        previous = current
        cycle.append(following)
    if len(cycle) != len(neighbors):
        raise ValueError('原纸张外围存在多条闭环。')
    return [fold['vertices_coords'][i] for i in cycle]


def _inside_boundary(point, boundary, tolerance):
    if any(_on_segment(point, a, b, tolerance)
           for a, b in zip(boundary, boundary[1:] + boundary[:1])):
        return False  # A positive inset must never rest on the old B edge.
    inside = False
    x, y = point
    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        if (a[1] > y) != (b[1] > y):
            crossing = a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if crossing > x:
                inside = not inside
    return inside


def _segments_touch(a, b, c, d, tolerance):
    if any(_on_segment(p, u, v, tolerance)
           for p, u, v in ((a, c, d), (b, c, d), (c, a, b), (d, a, b))):
        return True
    left = _cross(a, b, c) * _cross(a, b, d) < 0
    right = _cross(c, d, a) * _cross(c, d, b) < 0
    return left and right


def _polygon_strictly_inside(polygon, boundary, tolerance):
    if not all(_inside_boundary(point, boundary, tolerance) for point in polygon):
        return False
    return not any(_segments_touch(a, b, c, d, tolerance)
                   for a, b in zip(polygon, polygon[1:] + polygon[:1])
                   for c, d in zip(boundary, boundary[1:] + boundary[:1]))


def inscribed_paper_polygon(fold, paper=None,*,minimum_area_ratio=.2):
    """Fit a convex paper shape inside the *current* actual B outline.

    ``paper`` accepts shape=square/rectangle/regular, aspect for rectangles,
    sides for regular polygons, and margin in [.02,.45].  Its bounding box is
    inset from the source B bounding box by that fraction on each side.  If
    a concave B edge intrudes further, the shape is reduced until contained.
    A paper retaining too little of the source area is rejected.
    This is a crop: outer source creases end at the new boundary.
    """
    paper = paper or {}
    if (isinstance(minimum_area_ratio,bool) or not isinstance(minimum_area_ratio,(int,float))
            or not math.isfinite(minimum_area_ratio) or not 0<=minimum_area_ratio<=1):
        raise ValueError('内切保留面积阈值无效。')
    if not isinstance(paper, dict):
        raise ValueError('纸张设置必须是对象。')
    if set(paper) - {'shape', 'aspect', 'sides', 'margin'}:
        raise ValueError('纸张设置包含不支持的参数。')
    shape = paper.get('shape', 'square')
    if shape not in ('square', 'rectangle', 'regular'):
        raise ValueError('纸张形状须为方形、矩形或正多边形。')
    margin = paper.get('margin', .1)
    if isinstance(margin, bool) or not isinstance(margin, (int, float)) or not math.isfinite(margin):
        raise ValueError('纸张内缩比例必须是有限数字。')
    if margin >= .5:
        raise ValueError('裁剪纸张内缩达到 0.5 后无面积。')
    if not .02 <= margin <= .45:
        raise ValueError('裁剪纸张的内缩比例须在 0.02 至 0.45 之间。')
    aspect = paper.get('aspect', 1.5)
    sides = paper.get('sides', 6)
    if shape == 'rectangle' and (isinstance(aspect, bool) or
            not isinstance(aspect, (int, float)) or not math.isfinite(aspect) or
            not .2 <= aspect <= 5):
        raise ValueError('矩形宽高比须为 0.2 至 5。')
    if shape == 'regular' and (isinstance(sides, bool) or
            not isinstance(sides, int) or not 3 <= sides <= 12):
        raise ValueError('正多边形纸张须有 3 至 12 条边。')
    boundary = _paper_boundary(fold)
    xs, ys = [p[0] for p in boundary], [p[1] for p in boundary]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    if span <= 0:
        raise ValueError('原纸张边界退化。')
    tolerance = max(span, 1) * 1e-9
    center = [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2]
    if not _inside_boundary(center, boundary, tolerance):
        raise ValueError('原纸张中心不在纸面内，不能安全地内接此纸形。')
    if shape == 'regular':
        unit = [[math.cos(-math.pi / 2 + math.tau * i / sides),
                 math.sin(-math.pi / 2 + math.tau * i / sides)]
                for i in range(sides)]
    else:
        ratio = 1 if shape == 'square' else float(aspect)
        unit = [[-ratio, -1], [ratio, -1], [ratio, 1], [-ratio, 1]]

    def scaled(radius):
        return [[center[0] + radius * x, center[1] + radius * y]
                for x, y in unit]

    usable_x = (max(xs) - min(xs)) * (1 - 2 * margin) / 2
    usable_y = (max(ys) - min(ys)) * (1 - 2 * margin) / 2
    bbox_limit = min(usable_x / max(abs(p[0]) for p in unit),
                     usable_y / max(abs(p[1]) for p in unit))
    high = bbox_limit
    low = 0.
    for _ in range(35):
        middle = (low + high) / 2
        if _polygon_strictly_inside(scaled(middle), boundary, tolerance):
            low = middle
        else:
            high = middle
    # A nonconvex indentation may be the active constraint; leave a small
    # numerical gap there instead of sitting directly on a source B segment.
    polygon = scaled(low * (.99 if low < bbox_limit * .999 else 1))
    old_area = abs(_area(boundary))
    if abs(_area(polygon)) <= tolerance*max(span,1) or abs(_area(polygon)) < old_area * minimum_area_ratio:
        raise ValueError('该纸形在原纸面内只能缩得过小；请换纸形或增大母结构。')
    # The face-based clip is the final topology/coverage proof.  This call is
    # also useful when the source B outline itself is geometrically invalid.
    clip_fold_to_convex_paper(fold, polygon)
    return polygon


def clip_fold_to_convex_paper(fold, polygon, folded_form=None):
    """Return a real clipped FOLD graph and source-vertex interpolation map.

    Only a connected disk with strictly convex, fully partitioned source faces
    is accepted.  ``polygon`` must be strictly convex and entirely inside its
    boundary; partial cuts through the old boundary are rejected.
    """
    coords = fold['vertices_coords']
    faces = fold['faces_vertices']
    edges = fold['edges_vertices']
    kinds = fold['edges_assignment']
    if not coords or not faces or len(edges) != len(kinds):
        raise ValueError('原始折痕缺少完整的面与边。')
    if not isinstance(polygon, (list, tuple)) or not 3 <= len(polygon) <= 24:
        raise ValueError('纸张形状需要 3 至 24 个有序顶点。')
    if any(len(p) != 2 or not all(math.isfinite(v) for v in p)
           for p in coords + list(polygon)):
        raise ValueError('纸张或折痕包含无效坐标。')
    span = max(max(p[axis] for p in coords) - min(p[axis] for p in coords)
               for axis in (0, 1))
    tolerance = max(span, 1.) * 1e-9
    area_tolerance = tolerance * max(span, 1.)
    paper = [list(p) for p in polygon]
    if not _convex(paper, area_tolerance):
        raise ValueError('纸张轮廓必须为严格凸多边形。')
    if _area(paper) < 0:
        paper.reverse()
    original_edges = {}
    for edge, kind in zip(edges, kinds):
        a, b = edge
        if not 0 <= a < len(coords) or not 0 <= b < len(coords) or a == b:
            raise ValueError('原始折痕包含无效边。')
        key = tuple(sorted(edge))
        if key in original_edges or math.dist(coords[a], coords[b]) <= tolerance:
            raise ValueError('原始折痕包含重复或退化边。')
        original_edges[key] = kind
    original_owners = defaultdict(list)
    for fi, face in enumerate(faces):
        if len(face) < 3 or len(set(face)) != len(face) or any(
                not 0 <= v < len(coords) for v in face):
            raise ValueError('原始折痕包含无效面。')
        subject = [coords[i] for i in face]
        if not _convex(subject, area_tolerance):
            raise ValueError('当前裁剪方案只支持严格凸的原始面。')
        for a, b in zip(face, face[1:] + face[:1]):
            key = tuple(sorted((a, b)))
            if key not in original_edges:
                raise ValueError('原始面边与折痕边不一致。')
            original_owners[key].append(fi)
    if any(len(original_owners[e]) != (1 if kind == 'B' else 2)
           for e, kind in original_edges.items()):
        raise ValueError('原始折痕不是完整单张纸面。')
    _paper_boundary(fold)
    if len(coords) - len(edges) + len(faces) != 1:
        raise ValueError('原始折痕不是单张无孔纸面。')

    # Each source face is a convex polygon, so its intersection stays one face.
    quantum = max(span, 1.) * 1e-11
    ids = {}
    clipped_coords, clipped_faces, face_map = [], [], []
    participating = defaultdict(set)
    for fi, face in enumerate(faces):
        clipped = _clip_face([coords[i] for i in face], paper, tolerance)
        # A small retained corner can still have well-separated vertices.
        # Use its own edge lengths to decide whether its width is below the
        # coordinate tolerance; a whole-sheet area threshold would erase it
        # and leave an internal crack beside a correctly clipped neighbour.
        perimeter = sum(math.dist(a,b) for a,b in zip(clipped,clipped[1:]+clipped[:1]))
        if len(clipped) < 3 or abs(_area(clipped)) <= tolerance*perimeter/2:
            continue
        indices = []
        for point in clipped:
            key = (round(point[0] / quantum), round(point[1] / quantum))
            if key not in ids:
                ids[key] = len(clipped_coords)
                clipped_coords.append(point)
            index = ids[key]
            if math.dist(clipped_coords[index], point) > tolerance:
                raise ValueError('裁剪交点数值不稳定。')
            participating[index].add(fi)
            indices.append(index)
        if len(set(indices)) != len(indices):
            raise ValueError('纸张边界过于接近原折痕顶点。')
        clipped_faces.append(indices)
        face_map.append(fi)
    if not clipped_faces:
        raise ValueError('纸张形状与原始折痕没有有效交集。')

    owners = defaultdict(list)
    for fi, face in enumerate(clipped_faces):
        for a, b in zip(face, face[1:] + face[:1]):
            owners[tuple(sorted((a, b)))].append(fi)
    if any(len(pair) > 2 for pair in owners.values()):
        raise ValueError('裁剪后出现重叠面。')
    edge_keys = sorted(owners)
    assignments = []
    for a, b in edge_keys:
        p, q = clipped_coords[a], clipped_coords[b]
        if math.dist(p, q) <= tolerance:
            raise ValueError('裁剪后出现退化边。')
        if len(owners[(a, b)]) == 1:
            if not any(_on_segment(p, u, v, tolerance) and
                       _on_segment(q, u, v, tolerance)
                       for u, v in zip(paper, paper[1:] + paper[:1])):
                raise ValueError('纸张超出原边界，或裁剪后出现内部裂缝。')
            assignments.append('B')
        else:
            matches = [kind for (i, j), kind in original_edges.items()
                       if _on_segment(p, coords[i], coords[j], tolerance) and
                       _on_segment(q, coords[i], coords[j], tolerance)]
            if len(matches) != 1 or matches[0] == 'B':
                raise ValueError('裁剪后面之间的折痕类型无法唯一追溯。')
            assignments.append(matches[0])
    area = sum(abs(_area([clipped_coords[i] for i in face]))
               for face in clipped_faces)
    if abs(area - abs(_area(paper))) > area_tolerance * max(10, len(clipped_faces)):
        raise ValueError('纸张未被原始面完整覆盖。')
    if len(clipped_coords) - len(edge_keys) + len(clipped_faces) != 1:
        raise ValueError('裁剪后纸面不是单个连通圆盘。')
    adjacency = defaultdict(set)
    for (a, b), pair in owners.items():
        if len(pair) == 2:
            adjacency[pair[0]].add(pair[1])
            adjacency[pair[1]].add(pair[0])
    reached, queue = {0}, deque([0])
    while queue:
        for other in adjacency[queue.popleft()]:
            if other not in reached:
                reached.add(other)
                queue.append(other)
    if len(reached) != len(clipped_faces):
        raise ValueError('裁剪后出现彼此断开的纸面。')

    vertex_map = []
    for vi, point in enumerate(clipped_coords):
        old = next((i for i, p in enumerate(coords)
                    if math.dist(point, p) <= tolerance), None)
        if old is not None:
            vertex_map.append({'kind': 'vertex', 'vertices': [old], 'weights': [1.]})
            clipped_coords[vi] = list(coords[old])
            continue
        source_edge = next(((a, b) for a, b in sorted(original_edges)
                            if _on_segment(point, coords[a], coords[b], tolerance)), None)
        if source_edge is not None:
            a, b = source_edge
            length2 = math.dist(coords[a], coords[b]) ** 2
            t = sum((point[k] - coords[a][k]) * (coords[b][k] - coords[a][k])
                    for k in (0, 1)) / length2
            vertex_map.append({'kind': 'edge', 'vertices': [a, b],
                               'weights': [1 - t, t]})
            continue
        fi = min(participating[vi])
        source, weights = _weights(point, faces[fi], coords, tolerance)
        vertex_map.append({'kind': 'face', 'face': fi,
                           'vertices': source, 'weights': weights})
    result = {'fold': make_fold(clipped_coords, [list(e) for e in edge_keys],
                                assignments, clipped_faces),
              'vertexMap': vertex_map,'faceMap':face_map}
    if folded_form is not None:
        result['foldedForm'] = map_vertex_values(vertex_map, folded_form)
        for face in clipped_faces:
            for pos, i in enumerate(face):
                for j in face[pos + 1:]:
                    error = abs(math.dist(clipped_coords[i], clipped_coords[j]) -
                                math.dist(result['foldedForm'][i], result['foldedForm'][j]))
                    if error > tolerance * 100:
                        raise ValueError('原始平折坐标与裁剪后的纸面面内距离不一致。')
    return result
