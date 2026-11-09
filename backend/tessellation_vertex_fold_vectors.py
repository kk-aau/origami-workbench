"""Origamica MakeTVertex3DFromFoldVectors numerical core (153229–153475).

The original class also builds a symbolic 2D crease representation and style
properties. This module returns its intrinsic 3D fold, sector and midfold
vectors and angles; nondevelopable vertices are retained as in the notebook.
"""

import math

from tessellation_vertex_fan3d import _cross, _dot, _norm, _rotate, _signed_angle, _unit


def vertex_from_fold_vectors(fold_vectors):
    """Analyze cyclic fold rays, in notebook order, with radians as angles."""
    if not isinstance(fold_vectors, (list, tuple)) or len(fold_vectors) < 3:
        raise ValueError('至少需要按环向给出三条三维折线向量。')
    rays = []
    for vector in fold_vectors:
        if (not isinstance(vector, (list, tuple)) or len(vector) != 3
                or any(isinstance(x, bool) or not isinstance(x, (int, float))
                       for x in vector)):
            raise ValueError('每条折线向量必须包含三个有限坐标。')
        try:
            length = math.hypot(*vector)
            if not math.isfinite(length) or length == 0:
                raise ValueError('零向量或非有限折线向量无法定义方向。')
            rays.append(tuple(value / length for value in vector))
        except OverflowError as exc:
            raise ValueError('折线向量坐标超出数值范围。') from exc

    normals = []
    sectors = []
    for i, ray in enumerate(rays):
        following = rays[(i + 1) % len(rays)]
        cross = _cross(ray, following)
        if _norm(cross) <= 1e-12:
            raise ValueError('相邻折线向量共线，无法确定扇面法向。')
        normals.append(_unit(cross))
        sectors.append(math.atan2(_norm(cross), _dot(ray, following)))

    folds = [_signed_angle(normals[i - 1], normals[i], rays[i])
             for i in range(len(rays))]
    midfolds = [_unit(_rotate(normals[i - 1], rays[i], folds[i] / 2))
                for i in range(len(rays))]
    sector_sum = math.fsum(sectors)
    return {
        'kind': 'origamica-single-vertex-from-fold-vectors',
        'foldVectors': rays,
        'sectorVectors': normals,
        'midfoldVectors': midfolds,
        'sectorAnglesRad': sectors,
        'foldAnglesRad': folds,
        'sectorSumRad': sector_sum,
        'developable': abs(sector_sum - 2 * math.pi) <= 1e-8,
        'globalRigidFoldingChecked': False,
        'selfCollisionChecked': False,
    }


def vertex_from_fold_vectors_query(data):
    """Strict JSON-facing query for the 3D intrinsic quantities."""
    if (not isinstance(data, dict)
            or set(data) != {'operation', 'foldVectors'}
            or data['operation'] != 'vertex-from-fold-vectors'):
        raise ValueError('折线向量分析只接受 foldVectors 三维向量列表。')
    vectors = data['foldVectors']
    if not isinstance(vectors, list) or len(vectors) > 32:
        raise ValueError('三维折线向量数量必须为 3–32 条。')
    result = vertex_from_fold_vectors(vectors)
    result['sectorAnglesDeg'] = [math.degrees(a) for a in result['sectorAnglesRad']]
    result['foldAnglesDeg'] = [math.degrees(a) for a in result['foldAnglesRad']]
    result['sectorSumDeg'] = math.degrees(result['sectorSumRad'])
    return result
