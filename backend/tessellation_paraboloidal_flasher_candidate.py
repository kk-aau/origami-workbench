"""Studio candidate for Origamica's cut paraboloidal Flasher sheet."""

from collections import defaultdict
import math
import time

from tessellation_flasher import flasher_sector_quads
from tessellation_flasher_candidate import _verify_spatial_faces
from tessellation_paraboloidal_flasher import (
    cut_paraboloidal_flasher, solve_paraboloidal_flasher,
)
from tessellation_patterns import make_fold


def validate_paraboloidal_flasher(data):
    """Keep the application entry in the verified numerical domain."""
    if not isinstance(data, dict) or data.get('family') != 'paraboloidal-flasher':
        raise ValueError('抛物面 Flasher 构造类型无效。')
    allowed = {'family', 'rings', 'heightOrder', 'rotationalOrder',
               'focalLength', 'radialIncrement', 'diagonal',
               'minimumAngleDeg', 'cutMinimumAngleDeg'}
    if set(data) - allowed:
        raise ValueError('抛物面 Flasher 含不支持的参数。')
    params = {
        'rings': data.get('rings', 2),
        'heightOrder': data.get('heightOrder', 2),
        'rotationalOrder': data.get('rotationalOrder', 4),
        'focalLength': data.get('focalLength', 6),
        'radialIncrement': data.get('radialIncrement', .05),
        'diagonal': data.get('diagonal', 'Y'),
        'minimumAngleDeg': data.get('minimumAngleDeg', 10),
        'cutMinimumAngleDeg': data.get('cutMinimumAngleDeg', 10),
    }
    for key, low, high in (('rings', 1, 2), ('heightOrder', 1, 3),
                           ('rotationalOrder', 3, 8)):
        value = params[key]
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f'抛物面 Flasher {key} 须为 {low}–{high} 的整数。')
    if params['rings'] * params['heightOrder'] > 6:
        raise ValueError('抛物面 Flasher 当前最多支持 6 个径向增量。')
    quads = len(flasher_sector_quads(params['rings'], params['heightOrder'],
                                     params['rotationalOrder']))
    faces = params['rotationalOrder'] * (2 * quads + 2 * params['rings']) + 1
    if faces > 600:
        raise ValueError('抛物面 Flasher 当前最多支持 600 个面。')
    for key, low, high in (('focalLength', .1, 1e7),
                           ('radialIncrement', 0, .5),
                           ('minimumAngleDeg', 0, 180),
                           ('cutMinimumAngleDeg', 0, 180)):
        value = params[key]
        if (isinstance(value, bool) or not isinstance(value, (int, float)) or
                not math.isfinite(value) or not low <= value <= high):
            raise ValueError(f'抛物面 Flasher {key} 须在 {low}–{high} 之间。')
        params[key] = float(value)
    if params['diagonal'] not in ('X', 'Y', 'Z'):
        raise ValueError('抛物面 Flasher 对角折线须为 X、Y 或 Z。')
    return {'family': 'paraboloidal-flasher', **params}


def _check_cut_topology(fold):
    """Check that the cut object is one disk with one boundary cycle."""
    vertices = fold['vertices_coords']
    faces = fold['faces_vertices']
    edges = fold['edges_vertices']
    assignments = fold['edges_assignment']
    if (len(vertices) > 3000 or len(edges) > 6000 or len(faces) > 600 or
            len(vertices) - len(edges) + len(faces) != 1):
        raise ValueError('抛物面 Flasher 剪后拓扑超限或不是单个圆盘。')
    incidence = defaultdict(int)
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            incidence[tuple(sorted((a, b)))] += 1
    if (len(incidence) != len(edges) or
            any(count not in (1, 2) for count in incidence.values())):
        raise ValueError('抛物面 Flasher 剪后面边邻接不一致。')
    boundary = defaultdict(list)
    for edge, kind in zip(edges, assignments):
        key = tuple(sorted(edge))
        count = incidence.get(key)
        if count != (1 if kind == 'B' else 2):
            raise ValueError('抛物面 Flasher 边界赋型与面邻接不一致。')
        if kind == 'B':
            a, b = edge
            boundary[a].append(b)
            boundary[b].append(a)
    if not boundary or any(len(neighbors) != 2 for neighbors in boundary.values()):
        raise ValueError('抛物面 Flasher 剪后边界不是闭合单环。')
    seen = {next(iter(boundary))}
    stack = list(seen)
    while stack:
        for neighbor in boundary[stack.pop()]:
            if neighbor not in seen:
                seen.add(neighbor)
                stack.append(neighbor)
    if len(seen) != len(boundary):
        raise ValueError('抛物面 Flasher 剪后存在多个边界环。')
    return len(boundary)


def _cross(a, b, p):
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def _area(polygon):
    return abs(sum(a[0] * b[1] - b[0] * a[1]
                   for a, b in zip(polygon, polygon[1:] + polygon[:1]))) / 2


def _triangle_overlap_area(first, second):
    """Area of intersection of two convex triangles, including containment."""
    subject = [tuple(point) for point in first]
    clip = [tuple(point) for point in second]
    if _cross(clip[0], clip[1], clip[2]) < 0:
        clip.reverse()
    for a, b in zip(clip, clip[1:] + clip[:1]):
        if not subject:
            return 0.
        output = []
        previous = subject[-1]
        previous_side = _cross(a, b, previous)
        for current in subject:
            current_side = _cross(a, b, current)
            previous_inside = previous_side >= 0
            current_inside = current_side >= 0
            if previous_inside != current_inside:
                fraction = previous_side / (previous_side - current_side)
                output.append((previous[0] + fraction * (current[0] - previous[0]),
                               previous[1] + fraction * (current[1] - previous[1])))
            if current_inside:
                output.append(current)
            previous, previous_side = current, current_side
        subject = output
    return _area(subject) if len(subject) >= 3 else 0.


def _check_face_overlap(coords, triangles):
    """Reject positive-area overlaps that edge-crossing checks can miss."""
    span = max(max(point[i] for point in coords) - min(point[i] for point in coords)
               for i in (0, 1))
    tolerance = max(span, 1.) ** 2 * 1e-10
    polygons = [[coords[vertex] for vertex in face] for face in triangles]
    boxes = [(min(p[0] for p in polygon), max(p[0] for p in polygon),
              min(p[1] for p in polygon), max(p[1] for p in polygon))
             for polygon in polygons]
    for i, first in enumerate(polygons):
        left, right, bottom, top = boxes[i]
        for j in range(i + 1, len(polygons)):
            other_left, other_right, other_bottom, other_top = boxes[j]
            if (right <= other_left or other_right <= left or
                    top <= other_bottom or other_top <= bottom):
                continue
            area = _triangle_overlap_area(first, polygons[j])
            if area > tolerance:
                raise ValueError(f'抛物面 Flasher 展开面 {i} 与 {j} 发生面积重叠：{area:.6g}。')
    return tolerance


def generate_paraboloidal_flasher(params, check_geometry):
    started = time.perf_counter()
    solved = solve_paraboloidal_flasher(
        params['rings'], params['heightOrder'], params['rotationalOrder'],
        params['focalLength'], params['radialIncrement'], params['diagonal'],
        minimum_angle_deg=params['minimumAngleDeg'])
    cut = cut_paraboloidal_flasher(
        solved, minimum_angle_deg=params['cutMinimumAngleDeg'])
    flat = cut['vertices_coords']
    ff = cut['folded_vertices_coords']
    dp = cut['deployed_vertices_coords']
    faces = cut['faces_vertices']
    edges = cut['edges_vertices']
    assignments = cut['edge_types']
    fold = make_fold(flat, edges, assignments, faces)
    fold['edges_foldAngle'] = [None if kind == 'B' else math.degrees(angle)
                               for angle, kind in zip(cut['fold_angles_rad'], assignments)]
    fold['file_creator'] = '折纸工作台 / Origamica CutParaboloidalFlasher reconstruction'
    fold['frame_description'] = '抛物面部署形剪裁后的真实二维开发图，逐面等距对应三维部署形与折后形。'
    boundary_vertices = _check_cut_topology(fold)
    ff_error, ff_plane = _verify_spatial_faces(flat, ff, faces)
    dp_error, dp_plane = _verify_spatial_faces(flat, dp, faces)
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('抛物面 Flasher 剪后二维展开未通过非相邻边交叉检查。')
    overlap_tolerance = _check_face_overlap(flat, cut['audit_triangles_vertices'])
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
                'local': {'status': 'not_applicable',
                          'kind': 'curved-deployed-spatial-fold',
                          'maximumError': max(ff_error, ff_plane,
                                              dp_error, dp_plane)},
                'layerOrder': {'status': 'not_checked'},
            },
            'foldability': 'static-spatial-state',
            'kind': 'paraboloidal-flasher',
        },
        'warnings': [
            '已核验原版剪裁后的二维开发图与三维部署形、折后形逐面等距，且二维面片无面积重叠。',
            '原版对象中的 CP 是抛物面竖直投影；该投影仅作来源参考，不作为本候选折痕图。',
            '静态三维形态已验证；连续折叠路径和三维面间自碰撞仍未验证。',
            '原版笔记本没有保存最终顶点数值；本结果是从原版初值及方程求得的可检验分支。',
        ],
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only',
            'algorithm': 'Origamica MakeParaboloidalFlasher + CutParaboloidalFlasher reconstruction',
            'version': 1, 'output': 'spatial-3d',
            'spatialKind': 'origamica-paraboloidal-flasher-cut',
            'foldedForm3D': ff, 'deployedForm3D': dp,
            'originalProjectedVertices2D': solved['projected_vertices_coords'],
            'originalVertexIJK': solved['vertex_ijk'],
            'cutSourceVertexIndices': cut['source_vertex_indices'],
            'cutSourceEdges': cut['source_cut_edges_vertices'],
            'maximumFaceDistanceError': ff_error,
            'maximumFacePlaneError': ff_plane,
            'maximumDeployedFaceDistanceError': dp_error,
            'maximumDeployedFacePlaneError': dp_plane,
            'staticGlobalIsometryChecked': True,
            'planarFaceOverlapChecked': True,
            'planarFaceOverlapAreaTolerance': overlap_tolerance,
            'boundaryCycleVertices': boundary_vertices,
            'continuousRigidPathChecked': False,
            'selfCollisionChecked': False,
            'deployedPatternChecked': True,
            'isometryResidualSum': solved['isometryResidualSum'],
            'outerHeightAdjustment': solved['outerHeightAdjustment'],
        },
    }
