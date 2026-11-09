"""Finite, exactly developable triangular companion to the saved linked first band.

Origamica In[4086] specifies a smooth ruled surface.  Its sampled planar and
spatial chords have different lengths, so they must not be paired as a FOLD
graph.  A strip with only two transverse vertex rows has no interior vertices:
triangulating the actual spatial samples and unfolding consecutive triangles
produces one planar sheet with precisely the same facet edge lengths.
"""

import math
import time

import numpy as np

from tessellation_curved_linked_first_band_query import query_linked_first_band
from tessellation_flasher_candidate import _verify_spatial_faces
from tessellation_flasher_solver import _assign_fold_types
from tessellation_patterns import make_fold


FAMILY = 'linked-first-band-polyhedral'


def validate_linked_first_band_polyhedral(data):
    if not isinstance(data, dict) or data.get('family') != FAMILY:
        raise ValueError('关联同心圆首带多面体构造类型无效。')
    if set(data) - {'family', 'curveSegments', 'minimumAngleDeg'}:
        raise ValueError('关联同心圆首带多面体含不支持的参数。')
    segments = data.get('curveSegments', 32)
    if type(segments) is not int or not 8 <= segments <= 96:
        raise ValueError('关联同心圆首带多面体段数须为 8–96 的整数。')
    minimum = data.get('minimumAngleDeg', .5)
    if isinstance(minimum, bool) or not isinstance(minimum, (int, float)) or not math.isfinite(minimum) or not 0 <= minimum <= 90:
        raise ValueError('山谷阈值须为 0°–90° 的有限数值。')
    return {'family': FAMILY, 'curveSegments': segments,
            'minimumAngleDeg': float(minimum)}


def _third(a, b, distance_a, distance_b, side):
    """Locate one triangle vertex from two edge lengths and oriented side."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    base = math.hypot(dx, dy)
    if base < 1e-10:
        raise ValueError('首带多面体的已展开底边退化。')
    along = (distance_a * distance_a - distance_b * distance_b + base * base) / (2 * base)
    height_sq = distance_a * distance_a - along * along
    if height_sq <= 1e-14:
        raise ValueError('首带多面体的三角面退化。')
    height = math.sqrt(height_sq) * side
    return [a[0] + (along * dx - height * dy) / base,
            a[1] + (along * dy + height * dx) / base]


def _unfold(first, second):
    """Unfold the dual-path triangle strip without changing any 3D vertex."""
    n = len(first) - 1
    flat_first = [[0., 0.]]
    flat_second = [[math.dist(first[0], second[0]), 0.]]
    for i in range(n):
        next_first = _third(flat_first[i], flat_second[i],
                            math.dist(first[i], first[i + 1]),
                            math.dist(second[i], first[i + 1]), 1)
        next_second = _third(flat_second[i], next_first,
                             math.dist(second[i], second[i + 1]),
                             math.dist(first[i + 1], second[i + 1]), -1)
        flat_first.append(next_first)
        flat_second.append(next_second)
    flat = flat_first + flat_second
    spatial = first + second
    faces = []
    for i in range(n):
        faces.extend(([i, n + 1 + i, i + 1],
                      [n + 1 + i, n + 1 + i + 1, i + 1]))
    return flat, spatial, faces


def generate_linked_first_band_polyhedral(params, check_geometry):
    started = time.perf_counter()
    sample = query_linked_first_band({'family': 'linked-concentric-first-band',
                                      'segments': params['curveSegments']})
    rows = sample['sample']['rows']
    first = [row['foldedFirst'] for row in rows]
    second = [row['foldedSecond'] for row in rows]
    flat, spatial, faces = _unfold(first, second)
    distance_error, plane_error = _verify_spatial_faces(flat, spatial, faces)
    if distance_error > 1e-9 or plane_error > 1e-9:
        raise ValueError('首带多面体展开与空间三角面不等距。')
    edges, angles, kinds = _assign_fold_types(np.asarray(flat),
                                               np.asarray(spatial), faces,
                                               params['minimumAngleDeg'])
    fold = make_fold(flat, edges, kinds, faces)
    fold['edges_foldAngle'] = [None if kind == 'B' else math.degrees(angle)
                               for kind, angle in zip(kinds, angles)]
    fold['file_creator'] = '折纸工作台 / Origamica linked first-band polyhedral companion'
    fold['frame_description'] = ('In[4086] 保存输入首带的精确等距三角纸面近似；'
                                 '不是原光滑曲面本身，也不是五折链或平折层序。')
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('首带多面体展开纸面交叉或退化。')
    # Align the unfolded first ruling with the notebook's planar (1,0)-(1.1,0)
    # for a scale-independent indication of the approximation's visible drift.
    drift = max(math.dist((flat[i][0] + 1., flat[i][1]), rows[i]['flatFirst'])
                for i in range(len(rows)))
    drift = max(drift, *(math.dist((flat[len(rows) + i][0] + 1.,
                                    flat[len(rows) + i][1]), rows[i]['flatSecond'])
                         for i in range(len(rows))))
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(flat), 'edges': len(edges), 'faces': len(faces),
            'tiles': params['curveSegments'],
            'mountainEdges': kinds.count('M'), 'valleyEdges': kinds.count('V'),
            'boundaryEdges': kinds.count('B'), 'unassignedEdges': kinds.count('U'),
            'elapsedMs': round((time.perf_counter() - started) * 1000),
            'parameters': params,
            'checks': {'geometry': geometry,
                       'local': {'status': 'not_applicable',
                                 'kind': 'spatial-not-flat-foldable',
                                 'maximumError': max(distance_error, plane_error)},
                       'layerOrder': {'status': 'not_checked'}},
            'foldability': 'static-spatial-state',
            'kind': FAMILY,
        },
        'warnings': [
            '原版 In[4086] 非零扰动五折输入仅取首条直纹带：按真实空间样点逐三角面展开，得到同索引、逐面精确等距的有限单纸。',
            '这是光滑首带的多面体近似，展开轮廓经过弦长修正；不等于原光滑二维参数曲线或其有限采样直连。',
            '原版后续带的参数及测地曲率有冲突；本构造不表示五折整串、平折层序或连续无碰撞折叠。',
        ],
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only',
            'algorithm': 'Origamica linked first-band triangle-strip polyhedral companion',
            'version': 1, 'output': 'spatial-3d',
            'spatialKind': FAMILY,
            'originalSavedCell': 'In[4086]',
            'originalSmoothSurfaceExact': False,
            'sampledSmoothSpatialVerticesExact': False,
            'numericalDarbouxIntegration': True,
            'exactPolyhedralFacetIsometry': True,
            'foldedForm3D': spatial,
            'maximumFaceDistanceError': distance_error,
            'maximumFacePlaneError': plane_error,
            'maximumSmoothFlatLandmarkDrift': drift,
            'staticGlobalIsometryChecked': True,
            'continuousRigidPathChecked': False,
            'selfCollisionChecked': False,
            'wholeSavedPerturbedChainCertified': False,
        },
    }
