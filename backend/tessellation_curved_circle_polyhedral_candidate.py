"""Exact polyhedral development of In[3992]/In[3995]'s circular cone pair.

The original FoldAcrossRight3D returns smooth ruled surfaces, not a FOLD
graph.  Each requested station samples its *exact* 3D circle/rulings.  The
planar angle between consecutive stations is corrected so that each conical
trapezoid is congruent to its 3D four-vertex facet.  This is a finite
polyhedral companion to the smooth construction, not its exact smooth CP.
"""

import math
import time

import numpy as np

from tessellation_flasher_candidate import _verify_spatial_faces
from tessellation_flasher_solver import _assign_fold_types
from tessellation_patterns import make_fold


def _number(data, name, default, lower, upper):
    value = data.get(name, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{name} 须为有限数值。')
    value = float(value)
    if not math.isfinite(value) or not lower <= value <= upper:
        raise ValueError(f'{name} 须在 {lower} 至 {upper} 之间。')
    return value


def validate_curved_circle_polyhedral(data):
    if not isinstance(data, dict) or data.get('family') != 'curved-circle-polyhedral':
        raise ValueError('圆弧跨面多面体构造类型无效。')
    allowed = {'family', 'foldAngleDeg', 'parameterStartPi', 'parameterEndPi',
               'leftWidth', 'rightWidth', 'curveSegments', 'minimumAngleDeg'}
    if set(data) - allowed:
        raise ValueError('圆弧跨面多面体含不支持的参数。')
    angle = _number(data, 'foldAngleDeg', 120, 30, 150)
    start = _number(data, 'parameterStartPi', 0, 0, 1)
    end = _number(data, 'parameterEndPi', 1, 0, 1)
    if end - start < .01:
        raise ValueError('圆弧区间须至少为 0.01π。')
    left = _number(data, 'leftWidth', 1, .05, 4)
    right = _number(data, 'rightWidth', 1, .05, 4)
    cosine = math.cos(math.radians(angle) / 2)
    if left >= (1 - 1e-8) / cosine:
        raise ValueError('左侧宽度必须严格停在圆锥顶点之前。')
    count = data.get('curveSegments', 32)
    if type(count) is not int or not 4 <= count <= 96:
        raise ValueError('圆弧离散段数须为 4–96 的整数。')
    minimum = _number(data, 'minimumAngleDeg', .5, 0, 90)
    return {'family': 'curved-circle-polyhedral', 'foldAngleDeg': angle,
            'parameterStartPi': start, 'parameterEndPi': end,
            'leftWidth': left, 'rightWidth': right,
            'curveSegments': count, 'minimumAngleDeg': minimum}


def _points(params):
    n = params['curveSegments']
    u0 = math.pi * params['parameterStartPi']
    u1 = math.pi * params['parameterEndPi']
    delta = (u1 - u0) / n
    c = math.cos(math.radians(params['foldAngleDeg']) / 2)
    s = math.sin(math.radians(params['foldAngleDeg']) / 2)
    radius = 1 / c
    # A 3D crease chord has length 2 sin(delta/2).  At planar radius 1/c,
    # the congruent sector angle is 2 asin(c sin(delta/2)), rather than
    # the continuous development's c*delta.  This also matches every
    # corresponding cross-diagonal of a conical trapezoid.
    flat_delta = 2 * math.asin(c * math.sin(delta / 2))
    us = [u0 + delta * i for i in range(n + 1)]
    qs = [c * u0 + flat_delta * i for i in range(n + 1)]
    flat, folded = [], []
    for v, side in ((0., 'seam'), (params['leftWidth'], 'left'),
                    (params['rightWidth'], 'right')):
        sign = 0 if side == 'seam' else -1 if side == 'left' else 1
        for u, q in zip(us, qs):
            flat.append([(radius + sign * v) * math.cos(q),
                         (radius + sign * v) * math.sin(q)])
            folded.append([(1 + sign * c * v) * math.cos(u),
                           (1 + sign * c * v) * math.sin(u),
                           s * v])
    return flat, folded, us, qs, flat_delta


def generate_curved_circle_polyhedral(params, check_geometry):
    started = time.perf_counter()
    flat, folded, us, qs, flat_delta = _points(params)
    c = math.cos(math.radians(params['foldAngleDeg']) / 2)
    n = params['curveSegments']
    seam = lambda i: i
    left = lambda i: n + 1 + i
    right = lambda i: 2 * (n + 1) + i
    faces = []
    for i in range(n):
        faces.append([seam(i), seam(i + 1), left(i + 1), left(i)])
        faces.append([seam(i), right(i), right(i + 1), seam(i + 1)])
    distance_error, plane_error = _verify_spatial_faces(flat, folded, faces)
    if distance_error > 1e-9 or plane_error > 1e-9:
        raise ValueError('圆弧多面体展开与空间面不等距。')
    edges, angles, kinds = _assign_fold_types(
        np.asarray(flat), np.asarray(folded), faces,
        params['minimumAngleDeg'])
    fold = make_fold(flat, edges, kinds, faces)
    fold['edges_foldAngle'] = [None if kind == 'B' else math.degrees(angle)
                               for kind, angle in zip(kinds, angles)]
    fold['file_creator'] = '折纸工作台 / Origamica FoldAcrossRight3D polyhedral companion'
    fold['frame_description'] = ('In[3992]/[3995] 光滑圆弧曲折的精确等距多面体近似；'
                                 '非原版光滑曲面本身，也不是平折层序。')
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('圆弧多面体单纸折痕图二维几何未通过检查。')
    # The sector is a radial strip with strictly increasing angles and
    # positive inner radius, so its non-adjacent facet interiors are disjoint.
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(flat), 'edges': len(edges), 'faces': len(faces),
            'tiles': n, 'mountainEdges': kinds.count('M'),
            'valleyEdges': kinds.count('V'), 'boundaryEdges': kinds.count('B'),
            'unassignedEdges': kinds.count('U'),
            'elapsedMs': round((time.perf_counter() - started) * 1000),
            'parameters': params,
            'checks': {'geometry': geometry,
                       'local': {'status': 'not_applicable',
                                 'kind': 'spatial-not-flat-foldable',
                                 'maximumError': max(distance_error, plane_error)},
                       'layerOrder': {'status': 'not_checked'}},
            'foldability': 'static-spatial-state',
            'kind': 'curved-circle-polyhedral',
        },
        'warnings': [
            '按原版 In[3992]/[3995] 的圆弧两侧直纹面采样真实三维顶点；二维扇角经过弦长修正，逐面精确等距。',
            '这是原版光滑曲面的有限多面体近似，不是光滑曲线的精确直折痕表示；不宣称平折层序或连续无碰撞折叠。',
        ],
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only',
            'algorithm': 'Origamica FoldAcrossRight3D circular cone polyhedral companion',
            'version': 1, 'output': 'spatial-3d',
            'spatialKind': 'origamica-circular-across-right-polyhedral',
            'originalSymbolicCell': 'In[3992]',
            'originalNumericalCell': 'In[3995]',
            'originalSmoothSurfaceExact': False,
            'sampledSmoothSpatialVerticesExact': True,
            'exactPolyhedralFacetIsometry': True,
            'foldedForm3D': folded,
            'maximumFaceDistanceError': distance_error,
            'maximumFacePlaneError': plane_error,
            'maximumSmoothDevelopmentAngleDrift': abs(qs[-1] - qs[0] - c * (us[-1] - us[0])),
            'staticGlobalIsometryChecked': True,
            'continuousRigidPathChecked': False,
            'selfCollisionChecked': False,
        },
    }
