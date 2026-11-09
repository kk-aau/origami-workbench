"""Exact 180-degree face reflections for a planar crease graph.

This checks geometric closure only.  It does not establish a consistent layer
order or a collision-free folding path.
"""
from collections import defaultdict, deque

import numpy as np


def flat_face_embedding(fold, stationary_face=0):
    coords = np.asarray(fold['vertices_coords'], dtype=float)
    span = float(np.ptp(coords, axis=0).max())
    if not np.isfinite(span) or span <= 0:
        raise ValueError('折痕范围须为有限的非退化平面。')
    if span < 1.:
        origin = coords[0].copy()
        positions, closure = _flat_face_embedding_unit(
            {**fold, 'vertices_coords': ((coords-origin)/span).tolist()}, stationary_face)
        return (np.asarray(positions)*span+origin).tolist(), closure*span
    return _flat_face_embedding_unit(fold, stationary_face)


def _flat_face_embedding_unit(fold, stationary_face):
    coords = np.asarray(fold['vertices_coords'], dtype=float)
    faces = fold['faces_vertices']
    if isinstance(stationary_face, bool) or not isinstance(stationary_face, int) or not 0 <= stationary_face < len(faces):
        raise ValueError('固定面须为已生成折痕面中的有效编号。')
    owners = defaultdict(list)
    for i, face in enumerate(faces):
        for a, b in zip(face, face[1:]+face[:1]):
            owners[tuple(sorted((a, b)))].append(i)
    adjacent = [[] for _ in faces]
    for (a, b), pair in owners.items():
        if len(pair) > 2:
            raise ValueError('折痕边连接超过两个面。')
        if len(pair) == 2:
            adjacent[pair[0]].append((pair[1], a, b))
            adjacent[pair[1]].append((pair[0], a, b))
    transforms = {stationary_face: (np.eye(2), np.zeros(2))}
    queue = deque([stationary_face])
    closure = 0.
    while queue:
        face = queue.popleft()
        matrix, offset = transforms[face]
        for other, a, b in adjacent[face]:
            fa, fb = matrix @ coords[a] + offset, matrix @ coords[b] + offset
            delta = fb - fa
            length = np.linalg.norm(delta)
            if length < 1e-10:
                raise ValueError('折后共享边退化。')
            unit = delta / length
            reflection = 2 * np.outer(unit, unit) - np.eye(2)
            shift = fa - reflection @ fa
            candidate = (reflection @ matrix, reflection @ offset + shift)
            if other not in transforms:
                transforms[other] = candidate
                queue.append(other)
            else:
                known, known_offset = transforms[other]
                closure = max(closure, max(float(np.linalg.norm(candidate[0] @ coords[v] + candidate[1] -
                                                            known @ coords[v] - known_offset)) for v in faces[other]))
    if len(transforms) != len(faces):
        raise ValueError('折痕面不连续，无法组成整片折后图。')
    positions = [[] for _ in coords]
    for face, vertices in enumerate(faces):
        matrix, offset = transforms[face]
        for v in vertices:
            positions[v].append(matrix @ coords[v] + offset)
    if any(not samples for samples in positions):
        raise ValueError('折痕中有不属于任何面的孤立顶点。')
    for samples in positions:
        closure = max(closure, max(float(np.linalg.norm(point - samples[0])) for point in samples))
    scale = max(1., float(np.ptp(coords, axis=0).max()))
    if closure > scale * 1e-7:
        raise ValueError('逐块折后面不能在共享顶点闭合；局部条件通过但整片平折几何无解。')
    return [samples[0].tolist() for samples in positions], closure
