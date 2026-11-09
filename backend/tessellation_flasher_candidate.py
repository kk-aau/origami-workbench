"""Application candidate for Origamica section 46 planar MakeFlasher."""

import math
import time

import numpy as np

from tessellation_flasher_solver import solve_flasher
from tessellation_patterns import make_fold


def validate_flasher(data):
    if not isinstance(data, dict) or data.get('family') != 'flasher':
        raise ValueError('Flasher 构造类型无效。')
    allowed = {'family', 'rings', 'heightOrder', 'rotationalOrder',
               'radialIncrement', 'diagonal', 'minimumAngleDeg'}
    if set(data) - allowed:
        raise ValueError('Flasher 含不支持的参数。')
    values = {'rings': data.get('rings', 2), 'heightOrder': data.get('heightOrder', 2),
              'rotationalOrder': data.get('rotationalOrder', 4),
              'radialIncrement': data.get('radialIncrement', .05),
              'diagonal': data.get('diagonal', 'Y'),
              'minimumAngleDeg': data.get('minimumAngleDeg', 10.)}
    # Keep the existing rh<=9 and <=600 actual-face resource budgets.
    # Every sector has at least four facets, so that budget derives m<=149.
    for key, minimum, maximum in (('rings', 1, 9), ('heightOrder', 1, 9),
                                  ('rotationalOrder', 3, (600 - 1) // 4)):
        value = values[key]
        # JSON 2 and 2.0 represent the same integer in the frontend. Bounds
        # reject nonfinite values before int conversion; booleans stay invalid.
        if (isinstance(value, bool) or not isinstance(value, (int, float)) or
                not minimum <= value <= maximum or value != int(value)):
            raise ValueError(f'Flasher {key} 须为 {minimum}–{maximum} 的整数。')
        values[key] = int(value)
    if values['rings'] * values['heightOrder'] > 9:
        raise ValueError('Flasher 当前最多支持 9 个径向增量。')
    # In[4116]/[4118]: quads=r(r+1)h-r, two facets per quad and 2r
    # triangles per sector, plus the center. Reject before seed allocation.
    face_count = 2 * values['rotationalOrder'] * values['rings'] * (
        values['rings'] + 1) * values['heightOrder'] + 1
    if face_count > 600:
        raise ValueError('Flasher 当前最多支持 600 个面。')
    for key, minimum, maximum in (('radialIncrement', 0., .5),
                                  ('minimumAngleDeg', 0., 90.)):
        value = values[key]
        if (isinstance(value, bool) or not isinstance(value, (int, float)) or
                not minimum <= value <= maximum or not math.isfinite(value)):
            raise ValueError(f'Flasher {key} 须在 {minimum}–{maximum} 之间。')
        values[key] = float(value)
    if not isinstance(values['diagonal'], str) or values['diagonal'] not in ('X', 'Y', 'Z'):
        raise ValueError('Flasher 对角折线须为 X、Y 或 Z。')
    return {'family': 'flasher', **values}


def _verify_spatial_faces(flat, spatial, faces):
    developed = np.asarray(flat, dtype=float)
    folded = np.asarray(spatial, dtype=float)
    worst_distance = worst_plane = 0.
    for face in faces:
        planar = developed[face]
        points = folded[face]
        normal = np.cross(points[1] - points[0], points[2] - points[0])
        length = float(np.linalg.norm(normal))
        if length <= 1e-10:
            raise ValueError('Flasher 三维面退化。')
        for i, first in enumerate(face):
            for second in face[i + 1:]:
                worst_distance = max(worst_distance,
                                     abs(math.dist(flat[first], flat[second]) -
                                         math.dist(spatial[first], spatial[second])))
        for vertex in points[3:]:
            worst_plane = max(worst_plane,
                              abs(float(np.dot(normal, vertex - points[0]))) / length)
        area = sum(planar[i, 0] * planar[(i + 1) % len(face), 1] -
                   planar[(i + 1) % len(face), 0] * planar[i, 1]
                   for i in range(len(face)))
        if abs(area) <= 1e-10:
            raise ValueError('Flasher 展开面退化。')
    scale = max(1., *(abs(value) for point in flat for value in point))
    if max(worst_distance, worst_plane) > 1e-7 * scale:
        raise ValueError('Flasher 展开面与三维面不等距或不共面。')
    return worst_distance, worst_plane


def generate_flasher(params, check_geometry):
    started = time.perf_counter()
    solved = solve_flasher(params['rings'], params['heightOrder'],
                           params['rotationalOrder'], params['radialIncrement'],
                           params['diagonal'], minimum_angle_deg=params['minimumAngleDeg'])
    flat = solved['vertices_coords']
    spatial = solved['folded_vertices_coords']
    edges = solved['edges_vertices']
    assignments = solved['edge_types']
    faces = [*solved['faces_vertices'], solved['center_vertices']]
    if len(faces) > 600:
        raise ValueError('Flasher 当前最多支持 600 个面。')
    distance_error, plane_error = _verify_spatial_faces(flat, spatial, faces)
    fold = make_fold(flat, edges, assignments, faces)
    fold['edges_foldAngle'] = [None if kind == 'B' else math.degrees(angle)
                               for angle, kind in zip(solved['fold_angles_rad'], assignments)]
    fold['file_creator'] = '折纸工作台 / Origamica MakeFlasher reconstruction'
    fold['frame_description'] = '平面 Flasher 展开折痕与逐面等距静态三维形态；不是平折层序。'
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('Flasher 展开折痕的二维几何未通过检查。')
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(flat), 'edges': len(edges), 'faces': len(faces),
            'tiles': len(solved['quads_vertices']),
            'mountainEdges': assignments.count('M'),
            'valleyEdges': assignments.count('V'),
            'boundaryEdges': assignments.count('B'),
            'unassignedEdges': assignments.count('U'),
            'elapsedMs': round((time.perf_counter() - started) * 1000),
            'parameters': params,
            'checks': {
                'geometry': geometry,
                'local': {'status': 'not_applicable', 'kind': 'spatial-not-flat-foldable',
                          'maximumError': max(distance_error, plane_error)},
                'layerOrder': {'status': 'not_checked'},
            },
            'foldability': 'static-spatial-state', 'kind': 'flasher',
        },
        'warnings': [
            '已核验 Flasher 展开折痕与静态三维构形逐面等距；四边形沿所选 X/Y/Z 对角线弯曲。',
            '该构形不是平折层序；部署形 DP、连续折叠路径和面间自碰撞尚未验证。',
            *(['X 保存图 In[4123] 仅给初始拓扑；当前 dr 与山谷阈值是本地输入，求得的 CP/FF 不是原版保存数值 Out。']
              if params['diagonal'] == 'X' else []),
            '原版笔记本没有保存 MakeFlasher 最终顶点数值；本结果是按原版方程从初值求得的可检验分支。',
        ],
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only',
            'algorithm': 'Origamica MakeFlasher planar reconstruction',
            'version': 1, 'output': 'spatial-3d',
            'spatialKind': 'origamica-planar-flasher',
            'foldedForm3D': spatial,
            'maximumFaceDistanceError': distance_error,
            'maximumFacePlaneError': plane_error,
            'staticGlobalIsometryChecked': True,
            'continuousRigidPathChecked': False,
            'selfCollisionChecked': False,
            'deployedPatternChecked': False,
            'isometryResidualSum': solved['isometryResidualSum'],
            'outerHeightAdjustment': solved['outerHeightAdjustment'],
        },
    }
