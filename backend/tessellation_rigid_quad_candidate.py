"""Workspace adapter for the verified static branch of Origamica's quad mesh.

The original rigid mesh returns a crease graph and one spatial state.  This
adapter preserves both in the standard tessellation response.  It makes no
claim about a continuous collision-free folding motion.
"""

import math
import time

from tessellation_rigid_quad_mesh import rigid_rectangular_quad_mesh_query


def validate_rigid_quad_candidate(data):
    allowed = {'family', 'bottomDirectionsDeg', 'bottomFoldAnglesDeg',
               'leftDirectionsDeg', 'leftFoldAnglesDeg',
               'minimumEdgeLength', 'minimumEdgeLengths', 'baseFaces',
               'rectangular', 'cornerAnglesDeg', 'samePtTolerance',
               'addPlaneGraph', 'printSectorsOnFail'}
    if not isinstance(data, dict) or data.get('family') != 'rigid-quad' or set(data) - allowed:
        raise ValueError('刚性四边网格包含不支持的参数。')
    values = {}
    for prefix in ('bottom', 'left'):
        direction_key = prefix + 'DirectionsDeg'
        fold_key = prefix + 'FoldAnglesDeg'
        directions, folds = data.get(direction_key), data.get(fold_key)
        if (not isinstance(directions, list) or not isinstance(folds, list)
                or not 1 <= len(directions) == len(folds) <= 12):
            raise ValueError('每个边界须提供 1–12 对方向角和折角。')
        for value in directions + folds:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError('边界方向角与折角须为有限数值。')
        if any(abs(value) >= 180 for value in folds):
            raise ValueError('边界有向折角须严格位于 ±180° 内。')
        values[direction_key] = [float(value) for value in directions]
        values[fold_key] = [float(value) for value in folds]
    minimum = data.get('minimumEdgeLength', 1)
    if isinstance(minimum, bool) or not isinstance(minimum, (int, float)) or not math.isfinite(minimum) or not 1e-5 <= minimum <= 1000:
        raise ValueError('最短边长须在 0.00001–1000 之间。')
    overrides = data.get('minimumEdgeLengths', [])
    if not isinstance(overrides, list) or len(overrides) > 256:
        raise ValueError('逐边最短长度列表过长或无效。')
    for row in overrides:
        if (not isinstance(row, list) or len(row) != 4 or
                any(isinstance(value, bool) or not isinstance(value, (int, float)) or
                    not math.isfinite(value) for value in row)):
            raise ValueError('逐边最短长度须为 [方向, 横序, 纵序, 长度]。')
    base_faces = data.get('baseFaces', [])
    if (not isinstance(base_faces, list) or len(base_faces) > 256
            or any(not isinstance(face, list) or len(face) != 2
                   or any(type(index) is not int for index in face)
                   for face in base_faces)):
        raise ValueError('基准面须为 [横序, 纵序] 列表。')
    rectangular = data.get('rectangular', True)
    if type(rectangular) is not bool:
        raise ValueError('Rectangular 须为布尔值。')
    corner_angles = data.get('cornerAnglesDeg', 90)
    if isinstance(corner_angles, list):
        if len(corner_angles) != 4:
            raise ValueError('CornerAngles 须为单个角度或四个角度。')
    else:
        corner_angles = [corner_angles]*4
    if any(isinstance(angle, bool) or not isinstance(angle, (int, float)) or
           not math.isfinite(angle) or not 0 < angle <= 180
           for angle in corner_angles):
        raise ValueError('CornerAngles 须位于 (0°, 180°]。')
    tolerance = data.get('samePtTolerance', 1e-6)
    if (tolerance is not None and (isinstance(tolerance, bool)
            or not isinstance(tolerance, (int, float))
            or not math.isfinite(tolerance) or tolerance < 0)):
        raise ValueError('SamePtTolerance 须为非负有限数值或 null。')
    add_plane_graph = data.get('addPlaneGraph', True)
    print_sectors = data.get('printSectorsOnFail', False)
    if type(add_plane_graph) is not bool or type(print_sectors) is not bool:
        raise ValueError('AddPlaneGraph 和 PrintSectorsOnFail 须为布尔值。')
    if not add_plane_graph:
        raise ValueError('不构建平面图时没有面结构，不能采用为标准刚性网格候选；请在分析弹窗中查看线框。')
    return {'family': 'rigid-quad', **values,
            'minimumEdgeLength': float(minimum),
            'minimumEdgeLengths': [list(row) for row in overrides],
            'baseFaces': [list(face) for face in base_faces],
            'rectangular': rectangular,
            'cornerAnglesDeg': [float(angle) for angle in corner_angles],
            'samePtTolerance': tolerance,
            'printSectorsOnFail': print_sectors}


def generate_rigid_quad_candidate(params, check_geometry):
    started = time.perf_counter()
    query = {'operation': 'rigid-quad-mesh',
             **{key: value for key, value in params.items() if key != 'family'}}
    graph = rigid_rectangular_quad_mesh_query(query)
    fold = {
        'vertices_coords': graph['vertices_coords'],
        'edges_vertices': graph['edges_vertices'],
        'edges_assignment': graph['edges_assignment'],
        'edges_foldAngle': graph['edges_foldAngleDeg'],
        'faces_vertices': graph['faces_vertices'],
        'file_creator': '折纸工作台 / Origamica rigid quad mesh reconstruction',
        'frame_description': ('矩形' if graph['rectangular'] else '非矩形')
                             + '刚性四边网格的二维折痕和一个静态三维等距状态。',
    }
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('刚性四边网格折痕图的二维几何未通过检查。')
    error = max(graph['maximumGridClosureError'],
                graph['maximumFaceDistanceError'],
                graph['maximumFoldAngleErrorRad'])
    if not graph['staticGlobalIsometryChecked'] or error > 1e-7:
        raise ValueError('刚性四边网格的静态三维面等距检查未通过。')
    assignments = graph['edges_assignment']
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(fold['vertices_coords']),
            'edges': len(fold['edges_vertices']),
            'faces': len(fold['faces_vertices']),
            'tiles': len(fold['faces_vertices']),
            'mountainEdges': assignments.count('M'),
            'valleyEdges': assignments.count('V'),
            'boundaryEdges': assignments.count('B'),
            'unassignedEdges': assignments.count('U'),
            'elapsedMs': round((time.perf_counter() - started) * 1000),
            'parameters': params,
            'checks': {
                'geometry': geometry,
                'local': {'status': 'passed', 'kind': 'static-global-isometry',
                          'maximumError': error},
                'layerOrder': {'status': 'not_checked'},
            },
            'foldability': 'static-rigid-state', 'kind': 'rigid-quad',
        },
        'warnings': [
            '已验证当前折角下的静态三维面等距、共享边与折痕几何；未验证连续刚性折叠路径或自碰撞。',
            '该构造不是平折层序结果；三维坐标与二维折痕一起保存在工程来源信息中。',
        ] + (['非矩形边界以局部非线性优化求得；原版没有该分支的输出样例，未验证全局最小边长。']
             if not graph['rectangular'] else []) +
            (['非矩形与 BaseFaces 联用按原版方程重建并通过静态几何验收；没有原版数值输出可直接对照。']
             if not graph['rectangular'] and graph['baseFaces'] else []),
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only',
            'algorithm': ('Origamica RigidlyFoldableQuadMesh rectangular reconstruction'
                          if graph['rectangular'] else
                          'Origamica RigidlyFoldableQuadMesh irregular boundary reconstruction'),
            'version': 1, 'output': 'rigid-3d',
            'foldedForm3D': graph['vertices_coords3d'],
            'maximumFaceDistanceError': graph['maximumFaceDistanceError'],
            'maximumGridClosureError': graph['maximumGridClosureError'],
            'maximumFoldAngleErrorRad': graph['maximumFoldAngleErrorRad'],
            'baseFaces': graph['baseFaces'],
            'rectangular': graph['rectangular'],
            'cornerAnglesDeg': graph['cornerAnglesDeg'],
            'boundaryDirectionsDeg': graph['boundaryDirectionsDeg'],
            'paperArea': graph['paperArea'],
            'samePtTolerance': graph['samePtTolerance'],
            'planeGraphBuilt': graph['planeGraphBuilt'],
            'maximumBaseFaceHeightError': graph['maximumBaseFaceHeightError'],
            'minimumOtherVertexHeight': graph['minimumOtherVertexHeight'],
            'staticGlobalIsometryChecked': True,
            'continuousRigidPathChecked': False,
            'selfCollisionChecked': False,
            'unsupportedOrigamicaOptions': graph['unsupportedOrigamicaOptions'],
            'unverifiedOrigamicaOptions': graph['unverifiedOrigamicaOptions'],
        },
    }
