"""Circularly bounded polygon twist, following Origamica's ray construction.

The original ``CircularPolygonTwistGraph2D`` creates two parallel rays per
central edge, clips those rays to a circle about the vertex centroid, then
completes alternating pleat and wedge faces with circular boundary segments.
This module keeps the circle as a polygonal paper boundary, with an explicit
number of angular divisions.  It only accepts convex polygons and outward
ray directions, for which the resulting planar graph can be certified.
"""

import math

import numpy as np

from tessellation_flat_embedding import flat_face_embedding
from tessellation_patterns import make_fold, planar_faces


def validate_circular_twist_request(data):
    """Bound the independent circular construction before numerical geometry."""
    allowed = {'family', 'polygon', 'angle', 'radius', 'circleDivisions',
               'centralTypes', 'stationaryFace'}
    if set(data) - allowed or data.get('family') != 'circular-twist':
        raise ValueError('圆形扭转包含当前构造不支持的参数。')
    raw = data.get('polygon')
    try:
        polygon = np.asarray(raw, dtype=float)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError('中心多边形顶点必须是有限二维坐标。') from exc
    if (polygon.ndim != 2 or polygon.shape[1] != 2 or
            not 3 <= len(polygon) <= 64 or not np.isfinite(polygon).all() or
            np.max(np.abs(polygon)) > 1000):
        raise ValueError('中心多边形须有 3–64 个坐标绝对值不超过 1000 的有限二维顶点。')
    sides = len(polygon)
    angle = data.get('angle', 30)
    radius = data.get('radius', 2)
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or
           not math.isfinite(value) for value in (angle, radius)):
        raise ValueError('扭角和圆半径必须是有限数字。')
    if not 1 <= abs(angle) <= 179 or not 0 < radius <= 1000:
        raise ValueError('扭角须为 ±1° 至 ±179°，圆半径须在 0–1000 之间。')
    divisions = data.get('circleDivisions', 64)
    if isinstance(divisions, bool) or not isinstance(divisions, int) or not 8 <= divisions <= 360:
        raise ValueError('圆周分段数须为 8–360 的整数。')
    types = data.get('centralTypes', ['U'] * sides)
    if not isinstance(types, list) or len(types) != sides or any(t not in ('M', 'V', 'U') for t in types):
        raise ValueError('中心折痕须逐边指定山 M、谷 V 或待定 U。')
    stationary = data.get('stationaryFace', 'auto')
    if stationary != 'auto' and (isinstance(stationary, bool) or
                                 not isinstance(stationary, int) or
                                 not 1 <= stationary <= 2 * sides + 1):
        raise ValueError('固定面编号须在 1 至 2n+1 之间。')
    return {
        'family': 'circular-twist', 'polygon': polygon.tolist(),
        'angle': float(angle), 'radius': float(radius),
        'circleDivisions': divisions, 'centralTypes': types.copy(),
        'stationaryFace': stationary,
    }


def _signed_area(points):
    return sum(a[0] * b[1] - a[1] * b[0]
               for a, b in zip(points, points[1:] + points[:1])) / 2


def _circle_hit(origin, direction, center, radius):
    vector = origin - center
    projection = float(vector @ direction)
    discriminant = projection * projection + radius * radius - float(vector @ vector)
    if discriminant <= 0:
        raise ValueError('圆形纸边未与扭转褶线形成有效交点。')
    distance = -projection + math.sqrt(discriminant)
    if distance <= 1e-9:
        raise ValueError('圆形纸张须完整包住中心多边形。')
    return origin + distance * direction


def _face_order(faces, sides):
    central, pleats, wedges = [], {}, {}
    for face in faces:
        inner = set(face) & set(range(sides))
        if len(inner) == sides and len(face) == sides:
            central.append(face)
        elif len(inner) == 2:
            edge = next((i for i in range(sides)
                         if inner == {i, (i + 1) % sides}), None)
            if edge is None or edge in pleats:
                raise ValueError('圆形扭转褶面拓扑无效。')
            pleats[edge] = face
        elif len(inner) == 1:
            vertex = next(iter(inner))
            if vertex in wedges:
                raise ValueError('圆形扭转楔面拓扑无效。')
            wedges[vertex] = face
        else:
            raise ValueError('圆形扭转中出现了非预期面。')
    if len(central) != 1 or len(pleats) != sides or len(wedges) != sides:
        raise ValueError('圆形扭转未形成连续的中心、褶面和楔面。')
    return central + [pleats[i] for i in range(sides)] + [wedges[i] for i in range(sides)]


def _stationary_embedding(fold, stationary_face):
    """Reflect all faces, then keep the selected face in its CP orientation."""
    folded, closure = flat_face_embedding(fold)
    if stationary_face == 0:
        return folded, closure
    face = fold['faces_vertices'][stationary_face]
    source = np.asarray([fold['vertices_coords'][i] for i in face])
    target = np.asarray([folded[i] for i in face])
    source_center, target_center = source.mean(axis=0), target.mean(axis=0)
    u, _, vt = np.linalg.svd((target - target_center).T @ (source - source_center))
    transform = u @ vt
    if np.max(np.linalg.norm((target - target_center) @ transform -
                             (source - source_center), axis=1)) > 1e-7:
        raise ValueError('指定固定面的折后形状与原始面不等距。')
    return [((np.asarray(p) - target_center) @ transform + source_center).tolist()
            for p in folded], closure


def circularize_folded_boundary(fold, folded, center_vertices, radius):
    """Reproduce Origamica's final circular boundary drawing adjustment.

    The raw face-reflected coordinates are isometric.  Origamica subsequently
    slides each ray-connected boundary vertex along its folded ray to a circle
    about the folded central polygon, then redistributes the intervening arc
    points evenly.  These adjusted points are useful for the original-style
    folded *drawing*, but are not an isometry-preserving physical flat fold.
    """
    coords = np.asarray(folded, dtype=float).copy()
    boundary = [a for (a, _), t in zip(fold['edges_vertices'], fold['edges_assignment'])
                if t == 'B']
    boundary_set = set(boundary)
    if len(boundary) != len(boundary_set):
        # Boundary edges were added as one consistently ordered circular loop.
        raise ValueError('圆形纸张边界顶点顺序无效。')
    center = coords[:center_vertices].mean(axis=0)
    connected = {}
    for index in boundary:
        inner = [b if a == index else a
                 for (a, b) in fold['edges_vertices']
                 if index in (a, b) and (a not in boundary_set or b not in boundary_set)]
        if len(inner) > 1:
            raise ValueError('圆形纸边顶点连接了多条内部折痕。')
        if len(inner) == 1:
            direction = coords[index] - coords[inner[0]]
            length = np.linalg.norm(direction)
            if length < 1e-9:
                raise ValueError('折后圆边射线退化。')
            coords[index] = _circle_hit(coords[inner[0]], direction / length,
                                        center, radius)
            connected[index] = True
    if not connected:
        raise ValueError('圆形纸张边界没有可延长的折痕端点。')
    count = len(boundary)
    anchors = [position for position, index in enumerate(boundary) if index in connected]
    for left, right in zip(anchors, anchors[1:] + [anchors[0] + count]):
        first, last = boundary[left], boundary[right % count]
        start = math.atan2(*(coords[first] - center)[::-1])
        end = math.atan2(*(coords[last] - center)[::-1])
        # The original boundary may contain retrograde arcs after folding;
        # keep the shorter signed angular interpolation in that case.
        span = (end - start + math.pi) % math.tau - math.pi
        steps = right - left
        for part in range(1, steps):
            angle = start + span * part / steps
            coords[boundary[(left + part) % count]] = center + radius * np.array(
                [math.cos(angle), math.sin(angle)])
    return coords.tolist()


def circular_polygon_twist(vertices, angle_deg, radius, types=None,
                           circle_divisions=64, stationary_face='auto'):
    """Return (FOLD crease graph, folded coordinates, construction details).

    ``angle_deg`` is the signed rotation of each central edge's reverse unit
    vector.  ``types`` are central M/V/U assignments; an omitted list matches
    Origamica's unspecified U assignment.  Faces are numbered as in Origamica:
    center 1, pleats 2..n+1, wedges n+2..2n+1.  ``stationary_face`` is either
    that one-based number or ``'auto'`` (the last wedge).
    """
    try:
        polygon = np.asarray(vertices, dtype=float)
    except (TypeError, ValueError) as exc:
        raise ValueError('中心多边形顶点必须是有限二维坐标。') from exc
    if polygon.ndim != 2 or polygon.shape[1] != 2 or not 3 <= len(polygon) <= 64 or not np.isfinite(polygon).all():
        raise ValueError('中心多边形需要 3–64 个有限二维顶点。')
    sides = len(polygon)
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
           for v in (angle_deg, radius)):
        raise ValueError('扭转角和圆半径必须是有限数字。')
    if not 1 <= abs(angle_deg) <= 179 or radius <= 0:
        raise ValueError('扭转角须在 ±1° 至 ±179°，圆半径须为正。')
    if isinstance(circle_divisions, bool) or not isinstance(circle_divisions, int) or not 8 <= circle_divisions <= 360:
        raise ValueError('圆周分段数须为 8–360 的整数。')
    if types is None:
        types = ['U'] * sides
    if not isinstance(types, list) or len(types) != sides or any(t not in ('M', 'V', 'U') for t in types):
        raise ValueError('中心折痕赋型须逐边指定 M、V 或 U。')
    if stationary_face != 'auto' and (isinstance(stationary_face, bool) or
                                      not isinstance(stationary_face, int) or
                                      not 1 <= stationary_face <= 2 * sides + 1):
        raise ValueError('固定面编号超出圆形扭转面数。')

    signed = _signed_area(polygon.tolist())
    if abs(signed) < 1e-9 or signed * angle_deg <= 0:
        raise ValueError('中心多边形方向与扭转角须让射线朝纸张外侧。')
    edge_vectors = np.roll(polygon, -1, axis=0) - polygon
    if np.min(np.linalg.norm(edge_vectors, axis=1)) < 1e-8:
        raise ValueError('中心多边形边不能退化。')
    next_edges = np.roll(edge_vectors, -1, axis=0)
    turn = edge_vectors[:, 0] * next_edges[:, 1] - edge_vectors[:, 1] * next_edges[:, 0]
    if np.any(turn * signed <= 1e-9):
        raise ValueError('圆形扭转当前仅支持严格凸中心多边形。')
    center = polygon.mean(axis=0)
    if radius <= np.max(np.linalg.norm(polygon - center, axis=1)) + 1e-8:
        raise ValueError('圆形纸张须完整包住中心多边形。')

    angle = math.radians(angle_deg)
    rotation = np.array([[math.cos(angle), -math.sin(angle)],
                         [math.sin(angle), math.cos(angle)]])
    coords = polygon.tolist()
    edges = [[i, (i + 1) % sides] for i in range(sides)]
    assignments = types.copy()
    ends = []
    ccw = abs(angle_deg) < 90
    opposite = {'M': 'V', 'V': 'M', 'U': 'U'}
    for i in range(sides):
        j = (i + 1) % sides
        ray = rotation @ (-edge_vectors[i] / np.linalg.norm(edge_vectors[i]))
        first = _circle_hit(polygon[i], ray, center, radius)
        second = _circle_hit(polygon[j], ray, center, radius)
        first_index = len(coords)
        coords.append(first.tolist())
        second_index = len(coords)
        coords.append(second.tolist())
        edges.extend([[i, first_index], [j, second_index]])
        assignments.extend(([types[i], opposite[types[i]]] if ccw else
                            [opposite[types[i]], types[i]]))
        ends.extend((first_index, second_index))

    # Origamica divides *each* circular face arc into
    # max(round(CircleDivisions * arc_angle / 2π), 2) chords.  It does not use a
    # global angular grid: the exact ray/circle intersections anchor each arc.
    angle_of = lambda p: math.atan2(p[1] - center[1], p[0] - center[0]) % math.tau
    ray_ends = sorted(ends, key=lambda i: angle_of(coords[i]))
    if any(math.dist(coords[a], coords[b]) < 1e-8
           for a, b in zip(ray_ends, ray_ends[1:] + ray_ends[:1])):
        raise ValueError('多条扭转射线落在同一个圆周位置。')
    ends = []
    for a, b in zip(ray_ends, ray_ends[1:] + ray_ends[:1]):
        start = angle_of(coords[a])
        span = (angle_of(coords[b]) - start) % math.tau
        divisions = max(math.floor(circle_divisions * span / math.tau + .5), 2)
        ends.append(a)
        for part in range(1, divisions):
            phase = start + span * part / divisions
            coords.append([float(center[0] + radius * math.cos(phase)),
                           float(center[1] + radius * math.sin(phase))])
            ends.append(len(coords) - 1)
    edges.extend([[a, b] for a, b in zip(ends, ends[1:] + ends[:1])])
    assignments.extend(['B'] * len(ends))
    faces = _face_order(planar_faces(coords, edges), sides)
    fold = make_fold(coords, edges, assignments, faces)
    from tessellate import check_geometry
    if check_geometry(fold)['status'] != 'passed':
        raise ValueError('圆形扭转褶线相交；请增大半径或调整中心多边形与角度。')
    stationary = 2 * sides if stationary_face == 'auto' else stationary_face - 1
    flat, closure = _stationary_embedding(fold, stationary)
    circularized = circularize_folded_boundary(fold, flat, sides, radius)
    return fold, flat, {
        'center': center.tolist(), 'radius': radius,
        'circleDivisions': circle_divisions, 'stationaryFace': stationary + 1,
        'boundaryVertices': len(ends), 'closureError': closure,
        'circularizedFoldedForm': circularized,
        'faceOrder': {'central': 1, 'pleats': list(range(2, sides + 2)),
                      'wedges': list(range(sides + 2, 2 * sides + 2))},
    }
