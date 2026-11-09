"""A local folded 3D fan from compatible Origamica vertex angles.

Origamica's MakeTVertex3DFromAngles (notebook lines 153677–153784) starts
with the first fold ray on +X and the first face in the XY plane. It then
rotates each following face about its entering fold ray and advances by its
sector angle. The mesh here has only one centre and unit fold rays; it is
not a folded crease-pattern graph or a collision-free rigid motion.
"""

import math

from tessellation_vertex_consistency import vertex_rotation_closure


_TOLERANCE = 1e-6  # radians, matching the local closure query


def _dot(a, b):
    return math.fsum(a[i] * b[i] for i in range(3))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _norm(a):
    return math.sqrt(_dot(a, a))


def _unit(a):
    length = _norm(a)
    if length < 1e-12:
        raise ValueError('单顶点折面退化，无法生成单位折线向量。')
    return tuple(value / length for value in a)


def _rotate(vector, axis, angle):
    """Right-handed Rodrigues rotation about a unit fold ray."""
    cosine, sine = math.cos(angle), math.sin(angle)
    cross = _cross(axis, vector)
    parallel = _dot(axis, vector) * (1 - cosine)
    return tuple(cosine * vector[i] + sine * cross[i] + parallel * axis[i]
                 for i in range(3))


def _signed_angle(a, b, axis):
    return math.atan2(_dot(axis, _cross(a, b)), _dot(a, b))


def _angle_error(actual, expected):
    return abs(math.atan2(math.sin(actual - expected),
                          math.cos(actual - expected)))


def folded_vertex_fan(sector_angles, fold_angles):
    """Return an oriented triangular unit fan for a *closed* local vertex.

    Inputs are radians, ordered around the vertex. ``fold_angles[i]`` is
    the signed rotation from face i-1 to face i around ray i. The loop
    closure, all sectors, and all signed rotations are checked; incompatible
    angles raise ValueError instead of silently moving the final face.
    """
    _, closure_error = vertex_rotation_closure(sector_angles, fold_angles)
    if closure_error > _TOLERANCE:
        raise ValueError(f'折角环不闭合（偏差 {math.degrees(closure_error):.9g}°）。')

    ray = (1.0, 0.0, 0.0)
    normal = (0.0, 0.0, 1.0)
    rays = []
    normals = []
    for i, sector in enumerate(sector_angles):
        rays.append(ray)
        if i:
            normal = _unit(_rotate(normal, ray, fold_angles[i]))
        normals.append(normal)
        tangent = _unit(_cross(normal, ray))
        ray = _unit(tuple(math.cos(sector) * ray[j]
                          + math.sin(sector) * tangent[j] for j in range(3)))

    loop_gap = _norm(tuple(ray[j] - rays[0][j] for j in range(3)))
    if loop_gap > 2 * _TOLERANCE:
        raise ValueError('折线向量没有回到起点。')

    measured_sectors = []
    mesh_normals = []
    normal_deviations = []
    for i in range(len(rays)):
        next_ray = rays[(i + 1) % len(rays)]
        face_normal = _unit(_cross(rays[i], next_ray))
        if _dot(face_normal, normals[i]) < 0:
            raise ValueError('折面方向与环向扇区不一致。')
        mesh_normals.append(face_normal)
        normal_deviations.append(math.atan2(
            _norm(_cross(face_normal, normals[i])), _dot(face_normal, normals[i])))
        measured_sectors.append(math.atan2(_norm(_cross(rays[i], next_ray)),
                                           _dot(rays[i], next_ray)))
    measured_folds = [_signed_angle(mesh_normals[i - 1], mesh_normals[i], rays[i])
                      for i in range(len(rays))]

    sector_error = max(abs(actual - expected) for actual, expected
                       in zip(measured_sectors, sector_angles))
    fold_error = max(_angle_error(actual, expected) for actual, expected
                     in zip(measured_folds, fold_angles))
    if max(sector_error, fold_error, *normal_deviations) > 2 * _TOLERANCE:
        raise ValueError('三维折面反算角度与输入不一致。')

    return {
        'kind': 'local-single-vertex-fan3d',
        'vertices3D': [(0.0, 0.0, 0.0), *rays],
        'faces': [(0, i + 1, (i + 1) % len(rays) + 1)
                  for i in range(len(rays))],
        'foldRays': rays,
        'faceNormals': mesh_normals,
        'sectorAnglesRad': list(sector_angles),
        'foldAnglesRad': list(fold_angles),
        'measuredSectorAnglesRad': measured_sectors,
        'measuredFoldAnglesRad': measured_folds,
        'closureErrorRad': closure_error,
        'rayLoopGap': loop_gap,
        'maxSectorErrorRad': sector_error,
        'maxFoldErrorRad': fold_error,
        'maxNormalDeviationRad': max(normal_deviations),
        'unitRadius': 1.0,
        'selfCollisionChecked': False,
        'globalFoldabilityChecked': False,
    }


def degree4_vertex_fan_query(data):
    """JSON-facing degree-four query with angles in degrees."""
    if (not isinstance(data, dict)
            or set(data) != {'operation', 'sectorAnglesDeg', 'foldAnglesDeg'}
            or data['operation'] != 'degree4-vertex-fan3d'):
        raise ValueError('三维单顶点查询只接受四个扇区角与四个有向折角。')
    sectors = data['sectorAnglesDeg']
    folds = data['foldAnglesDeg']
    if (not isinstance(sectors, list) or not isinstance(folds, list)
            or len(sectors) != 4 or len(folds) != 4):
        raise ValueError('四度顶点须按环向给出四个扇区角与四个有向折角。')
    if (any(isinstance(value, bool) or not isinstance(value, (int, float))
            or not 0 < value < 180 or not math.isfinite(value)
            for value in sectors)
            or any(isinstance(value, bool) or not isinstance(value, (int, float))
                   or not -180 <= value <= 180 or not math.isfinite(value)
                   for value in folds)):
        raise ValueError('扇区角须在 0° 到 180° 之间，折角须在 −180° 到 180° 之间。')
    fan = folded_vertex_fan([math.radians(value) for value in sectors],
                            [math.radians(value) for value in folds])
    fan['sectorAnglesDeg'] = sectors.copy()
    fan['foldAnglesDeg'] = folds.copy()
    fan['measuredSectorAnglesDeg'] = [math.degrees(value) for value in
                                      fan.pop('measuredSectorAnglesRad')]
    fan['measuredFoldAnglesDeg'] = [math.degrees(value) for value in
                                    fan.pop('measuredFoldAnglesRad')]
    return fan
