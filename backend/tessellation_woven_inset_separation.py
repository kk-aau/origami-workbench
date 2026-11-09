"""Original-style inset vertex separation for a planar woven mother graph.

Origamica's InsetSeparationFn insets every bounded face by the same
perpendicular distance, then takes the minimum distance over *all* pairs of
inset face vertices.  It is a point-separation diagnostic, not an edge
intersection or a guarantee that a woven folded form exists.
"""

import math

import numpy as np

from tessellation_patterns import planar_faces


def _finite_points(vertices):
    try:
        points = np.asarray(vertices, dtype=float)
    except (TypeError, ValueError) as exc:
        raise ValueError('母结构顶点必须是有限二维坐标。') from exc
    if points.ndim != 2 or points.shape[1] != 2 or len(points) < 3 or not np.isfinite(points).all():
        raise ValueError('母结构顶点必须是有限二维坐标。')
    return points


def _edge_list(edges, vertex_count):
    try:
        values = list(edges)
    except TypeError as exc:
        raise ValueError('母结构边必须是两个不同的有效顶点编号。') from exc
    result = []
    seen = set()
    for edge in values:
        if not isinstance(edge, (list, tuple)) or len(edge) != 2:
            raise ValueError('母结构边必须是两个不同的有效顶点编号。')
        a, b = edge
        if any(isinstance(v, (bool, np.bool_)) or not isinstance(v, (int, np.integer)) or v < 0 or v >= vertex_count for v in (a, b)) or a == b:
            raise ValueError('母结构边必须是两个不同的有效顶点编号。')
        key = tuple(sorted((int(a), int(b))))
        if key in seen:
            raise ValueError('母结构边不能重复。')
        seen.add(key)
        result.append(key)
    if len(result) < 3:
        raise ValueError('母结构至少需要三个边。')
    return result, seen


def _bounded_faces(vertices, edges, faces):
    if faces is None:
        faces = planar_faces(vertices.tolist(), edges)
    try:
        values = [list(face) for face in faces]
    except TypeError as exc:
        raise ValueError('母结构需要有效的有界面。') from exc
    if not values:
        raise ValueError('母结构没有有界面。')
    edge_set = set(edges)
    result = []
    for face in values:
        if len(face) < 3 or len(set(face)) != len(face):
            raise ValueError('母结构面至少需要三个不重复顶点。')
        if any(isinstance(v, (bool, np.bool_)) or not isinstance(v, (int, np.integer)) or v < 0 or v >= len(vertices) for v in face):
            raise ValueError('母结构面顶点编号无效。')
        if any(tuple(sorted((int(a), int(b)))) not in edge_set for a, b in zip(face, face[1:] + face[:1])):
            raise ValueError('母结构面存在不属于图的边。')
        polygon = vertices[face]
        area = float(np.sum(polygon[:, 0] * np.roll(polygon[:, 1], -1) - polygon[:, 1] * np.roll(polygon[:, 0], -1)))
        if abs(area) <= 1e-12:
            raise ValueError('母结构面退化。')
        result.append(face if area > 0 else face[::-1])
    return result


class InsetSeparation:
    """Callable original-style inset diagnostic with affine vertex motion."""

    def __init__(self, vertices, edges, faces=None):
        points = _finite_points(vertices)
        edge_list, _ = _edge_list(edges, len(points))
        bounded = _bounded_faces(points, edge_list, faces)
        origins = []
        directions = []
        for face in bounded:
            poly = points[face]
            vectors = np.roll(poly, -1, axis=0) - poly
            lengths = np.linalg.norm(vectors, axis=1)
            if np.any(lengths <= 1e-12):
                raise ValueError('母结构面存在零长边。')
            normals = np.stack((-vectors[:, 1], vectors[:, 0]), axis=1) / lengths[:, None]
            for i, vertex in enumerate(poly):
                previous, current = normals[i - 1], normals[i]
                determinant = float(np.linalg.det(np.stack((previous, current))))
                if abs(determinant) < 1e-10:
                    raise ValueError('母结构面有 180° 顶点，内缩角不稳定。')
                origins.append(vertex)
                directions.append([(current[1] - previous[1]) / determinant,
                                   (previous[0] - current[0]) / determinant])
        self.origins = np.asarray(origins, dtype=float)
        self.directions = np.asarray(directions, dtype=float)
        self.face_count = len(bounded)
        self.point_count = len(origins)

    def __call__(self, inset):
        """Minimum pairwise Euclidean distance at perpendicular inset h."""
        if isinstance(inset, bool) or not isinstance(inset, (int, float)) or not math.isfinite(inset) or inset < 0:
            raise ValueError('内缩量必须是非负有限数字。')
        positioned = self.origins + inset * self.directions
        minimum_sq = math.inf
        for first in range(self.point_count - 1):
            delta = positioned[first + 1:] - positioned[first]
            squared = np.einsum('ij,ij->i', delta, delta)
            if squared.size:
                minimum_sq = min(minimum_sq, float(squared.min()))
        return math.sqrt(max(0., minimum_sq))

    def first_positive_collision(self, upper=None):
        """First h>0 at which two of the original inset points coincide.

        Shared un-inset graph vertices naturally coincide at h=0; those
        trivial pairs are excluded.  A later zero may mark a collapsed cell,
        but does not alone certify a feasible woven construction beforehand.
        """
        if upper is not None and (isinstance(upper, bool) or not isinstance(upper, (int, float)) or not math.isfinite(upper) or upper <= 0):
            raise ValueError('碰撞查询上界必须是正有限数字。')
        scale = max(1., float(np.max(np.abs(self.origins))))
        tolerance = 1e-9 * scale
        earliest = math.inf
        for first in range(self.point_count - 1):
            delta_origin = self.origins[first] - self.origins[first + 1:]
            delta_direction = self.directions[first] - self.directions[first + 1:]
            speed_sq = np.einsum('ij,ij->i', delta_direction, delta_direction)
            candidate = np.divide(-np.einsum('ij,ij->i', delta_origin, delta_direction), speed_sq,
                                  out=np.full_like(speed_sq, np.nan), where=speed_sq > 1e-20)
            valid = np.isfinite(candidate) & (candidate > tolerance) & (candidate < earliest)
            if upper is not None:
                valid &= candidate <= upper + tolerance
            if not np.any(valid):
                continue
            residual = delta_origin[valid] + candidate[valid, None] * delta_direction[valid]
            coincident = np.linalg.norm(residual, axis=1) <= tolerance
            if np.any(coincident):
                earliest = min(earliest, float(candidate[valid][coincident].min()))
        return None if math.isinf(earliest) else earliest

    def plot_samples(self, start, stop, count=41):
        """Numerical data for InsetSeparationPlot; no plotting dependency."""
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (start, stop)) or start < 0 or stop <= start or stop > 100:
            raise ValueError('分离曲线范围必须在 0–100 内递增。')
        if isinstance(count, bool) or not isinstance(count, int) or not 2 <= count <= 201:
            raise ValueError('分离曲线采样数必须为 2–201。')
        insets = np.linspace(start, stop, count).tolist()
        return {'insets': insets, 'separations': [self(value) for value in insets],
                'firstPositiveVertexCollision': self.first_positive_collision(stop),
                'faceCount': self.face_count, 'insetPointCount': self.point_count}


def inset_separation_fn(vertices, edges, faces=None):
    """Build a callable equivalent to Origamica's InsetSeparationFn.

    Indices are zero-based.  Pass FOLD ``faces_vertices`` when available;
    otherwise bounded planar faces are derived from ``edges``.
    """
    return InsetSeparation(vertices, edges, faces)


def inset_separation_from_mesh(mesh):
    """Build the diagnostic directly from ``arrangement(...)['mesh']``."""
    return inset_separation_fn(mesh['vertices_coords'], mesh['edges_vertices'], mesh.get('faces_vertices'))


def woven_inset_separation_query(request):
    """HTTP worker query for the current woven-line mother arrangement.

    ``h`` is uniform across *all* mother edges, as in the original function.
    Per-line width multipliers affect the woven construction, but do not
    change this hypothetical uniform-inset diagnostic.
    """
    from tessellation_line_groups import arrangement, chord_lines, random_lines
    from tessellation_woven import BOX, validate_woven

    if not isinstance(request, dict) or set(request) - {'operation', 'params', 'start', 'stop', 'count'}:
        raise ValueError('编织内缩查询参数无效。')
    raw = request.get('params')
    if not isinstance(raw, dict) or raw.get('family') != 'woven-lines':
        raise ValueError('编织内缩查询需要线组编织参数。')
    params = validate_woven(raw)
    mode = params['mode']
    boundary = params.get('boundary', BOX)
    if mode == 'graph':
        from tessellation_woven_graph import woven_graph_data
        mother = woven_graph_data(params['graph'],graph_source=params.get('graphSource'))['mesh']
    elif mode == 'random':
        lines, info = random_lines(params['count'], params['minDistance'], boundary,
                                params['seed'], params['maxTries'], params['width'],
                                **({'original_courteous': True} if params.get('randomVersion') in ('original-courteous','original-courteous-graph') else {}))
        if params.get('randomVersion') == 'original-courteous-graph':
            from tessellation_courteous_graph import courteous_graph_data
            data, _ = courteous_graph_data(lines,info,boundary,params['width'],params['samePtTolerance'],params['intersectionTolerance'])
            mother = data['mesh']
    else:
        lines = [[angle, distance, params['width'] * ratio] for angle, distance, ratio in params['lines']]
        if mode == 'chord':
            lines, boundary = chord_lines(lines, params['order'], params.get('boundary'))
    function = inset_separation_from_mesh(mother if mode == 'graph' or params.get('randomVersion') == 'original-courteous-graph' else arrangement(lines, boundary)['mesh'])
    result = function.plot_samples(request.get('start', 0), request.get('stop', .2), request.get('count', 64))
    return {**result, 'uniformInset': True}
