"""Bounded, local-only Pleat CLI: JSON on stdin, one JSON result on stdout.

This emits candidate 2D crease patterns. Independent necessary-condition checks
below are not a proof of global flat foldability or a collision-free fold path.
"""
from __future__ import annotations

import contextlib
import io
import json
import math
import os
from pathlib import Path
import sys
import time
import warnings

ROOT = Path(__file__).resolve().parents[1]
REVISION = "6a7015834b3357290a1678abf35b613987b07c44"
TILINGS = {"square": 4, "triangle": 3, "hexagon": 6}
TITLES = {"square": "方格", "triangle": "三角格", "hexagon": "六角格"}
MAX_INPUT_BYTES = 131072
MAX_VERTICES = 3000
MAX_EDGES = 6000
ANGLE_TOLERANCE_DEG = 0.001


def validate_request(data: object) -> dict:
    if not isinstance(data, dict):
        raise ValueError("输入必须是 JSON 对象。")
    if 'reciprocalMethod' in data:
        from tessellation_reciprocal_min_total import validate_min_total_request
        validate_min_total_request(data)
    if not isinstance(data.get('family','primal-dual'),str):
        raise ValueError("构造类型 family 无效。")
    if 'paper' in data:
        from tessellation_paper import validate_paper_spec
        from tessellation_paper_inscribed import INSCRIBABLE
        paper=validate_paper_spec(data['paper'])
        family=data.get('family','primal-dual')
        if paper.get('fit')=='inscribed' and family not in INSCRIBABLE:
            raise ValueError('此构造不支持二维内切纸张，空间结构和自带纸张不能套用平面裁剪。')
        if family in INSCRIBABLE and (family!='circular-twist' or paper.get('fit')=='inscribed'):
            return {**validate_request({key:value for key,value in data.items() if key!='paper'}),'paper':paper}
    if data.get('family') == 'circular-twist':
        from tessellation_circular_twist import validate_circular_twist_request

        return validate_circular_twist_request(data)
    if data.get('family') == 'rigid-quad':
        from tessellation_rigid_quad_candidate import validate_rigid_quad_candidate

        return validate_rigid_quad_candidate(data)
    if data.get('family') == 'radial-pot':
        from tessellation_radial_pot import validate_radial_pot

        return validate_radial_pot(data)
    if data.get('family') == 'discrete-curve-cp':
        from tessellation_discrete_curve_cp import validate_discrete_curve_cp
        return validate_discrete_curve_cp(data)
    if data.get('family') == 'gore-paper':
        from tessellation_gore import validate_gore_paper
        return validate_gore_paper(data)
    if data.get('family') == 'rectangular-pot':
        from tessellation_rectangular_pot import validate_rectangular_pot

        return validate_rectangular_pot(data)
    if data.get('family') == 'twisted-pot':
        from tessellation_twisted_pot import validate_twisted_pot

        return validate_twisted_pot(data)
    if data.get('family') == 'flasher':
        from tessellation_flasher_candidate import validate_flasher

        return validate_flasher(data)
    if data.get('family') == 'paraboloidal-flasher':
        from tessellation_paraboloidal_flasher_candidate import validate_paraboloidal_flasher

        return validate_paraboloidal_flasher(data)
    if data.get('family') == 'curved-circle-polyhedral':
        from tessellation_curved_circle_polyhedral_candidate import validate_curved_circle_polyhedral

        return validate_curved_circle_polyhedral(data)
    if data.get('family') == 'linked-first-band-polyhedral':
        from tessellation_curved_linked_first_band_polyhedral import validate_linked_first_band_polyhedral

        return validate_linked_first_band_polyhedral(data)
    if data.get('family') == 'twist-joined-tube':
        from tessellation_twist_joined_tubes import validate_twist_joined_tube

        return validate_twist_joined_tube(data)
    if data.get('family') == 'double-joined-tube':
        from tessellation_double_joined_tubes import validate_double_joined_tube

        return validate_double_joined_tube(data)
    if data.get('family') == 'closed-twist-topped-tube':
        from tessellation_closed_twist_topped_tube import validate_closed_twist_topped_tube

        return validate_closed_twist_topped_tube(data)
    if 'paper' in data:
        from tessellation_paper import validate_paper_spec
        paper = validate_paper_spec(data['paper'])
        return {**validate_request({key: value for key, value in data.items() if key != 'paper'}), 'paper': paper}
    from tessellation_parameters import KEYS, validate_parameters
    if KEYS.intersection(data):
        return validate_parameters(data, validate_request)
    if 'pruneBoundary' in data:
        from tessellation_prune import PRUNABLE
        from tessellation_line_groups import convex_boundary
        if data.get('family', 'primal-dual') not in PRUNABLE:
            raise ValueError('当前构造不支持母结构修剪。')
        if data.get('family')=='ring' and data.get('ringMode')=='origamica':
            raise ValueError('原版环状传播已直接生成折痕，不支持母结构修剪。')
        boundary = convex_boundary(data['pruneBoundary'])
        unpruned = {k:v for k,v in data.items() if k!='pruneBoundary'}
        if unpruned.get('family')=='custom' and unpruned.get('customOutput')=='tile-twists':
            from tessellation_advanced import validate_advanced
            checked = validate_advanced(unpruned, allow_pruned_tile_twists=True)
        else:
            checked = validate_request(unpruned)
        return {**checked, 'pruneBoundary': boundary}
    family = data.get("family", "primal-dual")
    from tessellation_advanced import ADVANCED, validate_advanced
    if isinstance(family, str) and family in ADVANCED:
        return validate_advanced(data)
    if not isinstance(family, str) or family not in ("twist", "periodic", "primal-dual"):
        raise ValueError("构造类型 family 无效。")
    allowed = {"family", "angle", "scale"} | ({"sides", "offsetX", "offsetY", "splitCount", "polygon", "mode", "pleatWidth", "splitVertex", "connection"} if family == "twist" else {"tiling", "rows", "columns", "dualTargets"} if family == "periodic" else {"tiling", "rings", "dualTargets", "motherParams", "dualEdgeFlips", "visibleTopFace", "faceupFace", "reciprocalMethod"})
    if set(data) - allowed:
        raise ValueError("含当前构造不支持的参数。")
    extra = {}
    if 'reciprocalMethod' in data:extra['reciprocalMethod'] = data['reciprocalMethod']
    for name, default, low, high in (("sides", 4, 3, 12),) if family == "twist" else (("rows", 3, 2, 6), ("columns", 3, 2, 6)) if family == "periodic" else ():
        value = data.get(name, default)
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValueError(f"{name} 必须是 {low} 至 {high} 的整数。")
        extra[name] = value
    tiling = data.get("tiling", "square")
    if not isinstance(tiling, str) or tiling not in TILINGS:
        raise ValueError("平铺类型只支持 square、triangle 或 hexagon。")
    rings = data.get("rings", 1)
    if isinstance(rings, bool) or not isinstance(rings, int) or not 0 <= rings <= 3:
        raise ValueError("扩展圈数 rings 必须是 0 至 3 的整数。")
    values = {}
    for name, default in (("angle", 36.0), ("scale", 0.3 if family == "periodic" else 0.5)):
        value = data.get(name, default)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"参数 {name} 必须是有限数字。")
        try:
            value = float(value)
        except (OverflowError, ValueError):
            raise ValueError(f"参数 {name} 必须是有限数字。") from None
        if not math.isfinite(value):
            raise ValueError(f"参数 {name} 不接受 NaN 或无穷大。")
        values[name] = value
    if not -80 <= values["angle"] <= 80:
        raise ValueError("旋转角度 angle 的探索范围为 -80° 至 80°。")
    if rings > 0 and abs(values["angle"]) < 0.1:
        raise ValueError("旋转角绝对值必须至少为 0.1°，以避免零角度退化。")
    if not 0.2 <= values["scale"] <= 0.85:
        raise ValueError("缩放系数 scale 必须在 0.20 至 0.85 之间。")
    if family == "twist" and 'polygon' not in data and extra["sides"] == 3 and abs(values["angle"]) <= 30:
        raise ValueError("三角扭转的旋转角绝对值需大于 30°，以满足当前山谷赋型的局部扇区条件。")
    if family == "twist":
        from tessellation_advanced import number
        mode=data.get('mode','polygon')
        if mode not in ('polygon','quad-split'):raise ValueError('单元扭转结构无效。')
        if 'mode' in data:extra['mode']=mode
        if 'polygon' in data:
            from tessellation_advanced import points
            polygon=points(data['polygon'],-1,1,3,12)
            crosses=[_cross(a,b,c) for a,b,c in zip(polygon,polygon[1:]+polygon[:1],polygon[2:]+polygon[:2])]
            if not(all(x>1e-8 for x in crosses) or all(x < -1e-8 for x in crosses)):
                raise ValueError('扭转轮廓必须为严格凸多边形，顶点按边界顺序排列。')
            extra['polygon']=polygon if crosses[0]>0 or mode=='quad-split' else polygon[::-1]
            extra['sides']=len(polygon)
        for key in ('offsetX', 'offsetY', 'splitCount'):
            if key in data:
                extra[key] = number(data, key, 1 if key == 'splitCount' else 0, 1 if key == 'splitCount' else -.6, 4 if key == 'splitCount' else .6, key == 'splitCount')
        if mode=='quad-split':
            if extra['sides']!=4 or extra.get('splitCount',1)!=1 or extra.get('offsetX',0)!=0 or extra.get('offsetY',0)!=0:
                raise ValueError('四边形分裂扭转需要四个顶点，不支持镜像拼接数或旧偏移参数。')
            connection=data.get('connection','M')
            if connection not in ('M','V'):raise ValueError('连接折痕只能是山折或谷折。')
            extra.update(pleatWidth=number(data,'pleatWidth',.25,.1,.45),splitVertex=number(data,'splitVertex',0,0,3,True),connection=connection)
        elif any(key in data for key in ('pleatWidth','splitVertex','connection')):
            raise ValueError('分裂专用参数只能用于四边形分裂扭转。')
        if mode=='polygon' and max(abs(extra.get('offsetX', 0)), abs(extra.get('offsetY', 0))) + values['scale'] >= .98:
            raise ValueError('偏移后的扭转多边形必须位于纸张内部，请减小偏移或半径。')
        return {"family": family, **extra, **values}
    if family == "periodic":
        if 'dualTargets' in data:
            from tessellation_advanced import points
            extra['dualTargets'] = points(data['dualTargets'], -100, 100, maximum=256)
        return {"family": family, "tiling": tiling, **extra, **values}
    if 'dualTargets' in data:
        from tessellation_advanced import points
        extra['dualTargets'] = points(data['dualTargets'], -100, 100, maximum=256)
    if 'motherParams' in data:
        source = data['motherParams']
        if not isinstance(source, dict) or source.get('family') not in ('periodic', 'archimedean', 'nonperiodic', 'custom', 'ring'):
            raise ValueError('原始—对偶母结构须为受支持的有限平面网格构造，不能递归引用自身。')
        if source.get('family') == 'ring' and source.get('ringMode') == 'origamica':
            raise ValueError('原版环状传播直接生成折痕，不能作为原始—对偶母结构。')
        extra['motherParams'] = validate_request(source)
    if 'dualEdgeFlips' in data:
        flips = data['dualEdgeFlips']
        if (not isinstance(flips, list) or len(flips) > 256 or
                any(not isinstance(pair, list) or len(pair) != 2 or
                    any(type(v) is not int or not 0 <= v < 256 for v in pair) or
                    pair[0] >= pair[1] for pair in flips) or
                len({tuple(pair) for pair in flips}) != len(flips)):
            raise ValueError('对偶边翻转须为不重复的母结构内部边顶点对 [小编号,大编号]。')
        extra['dualEdgeFlips'] = [pair.copy() for pair in flips]
    if 'visibleTopFace' in data:
        face = data['visibleTopFace']
        if type(face) is not int or face == 0 or abs(face) > 4096:
            raise ValueError('可见顶面须为非零的有符号折痕面编号。')
        extra['visibleTopFace'] = face
    if 'faceupFace' in data:
        face = data['faceupFace']
        if type(face) is not int or face == 0 or abs(face) > 4096:
            raise ValueError('FaceupFace 须为非零的有符号折痕面编号。')
        extra['faceupFace'] = face
    return {**({"family": family} if "family" in data else {}), "tiling": tiling, "rings": rings, **extra, **values}


def _cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def check_geometry(fold: dict) -> dict:
    """Check straight-edge degeneracy and nonincident crossings independently."""
    coords = fold["vertices_coords"]
    edges = fold["edges_vertices"]
    span = max(max(p[i] for p in coords) - min(p[i] for p in coords) for i in (0, 1))
    # The same mesh at a different scale must keep the same intersections.
    # Retain a machine-resolution floor when coordinates are translated far
    # from the origin; this still rejects edges smaller than representable.
    magnitude = max(abs(c) for p in coords for c in p[:2])
    epsilon = max(span * 1e-8, math.ulp(magnitude) * 4)
    area_epsilon = epsilon * span
    zero, duplicates, crossings = [], [], []
    seen = {}
    bounds = []
    for index, (u, v) in enumerate(edges):
        a, b = coords[u], coords[v]
        if math.dist(a, b) <= epsilon:
            zero.append(index)
        key = tuple(sorted((u, v)))
        if key in seen:
            duplicates.append(index)
        seen[key] = index
        bounds.append((min(a[0], b[0]), max(a[0], b[0]), min(a[1], b[1]), max(a[1], b[1])))
    crossing_count = 0
    for i, (u, v) in enumerate(edges):
        a, b = coords[u], coords[v]
        box = bounds[i]
        for j in range(i + 1, len(edges)):
            s, t = edges[j]
            if u in (s, t) or v in (s, t):
                continue
            other = bounds[j]
            if box[1] < other[0] - epsilon or other[1] < box[0] - epsilon or box[3] < other[2] - epsilon or other[3] < box[2] - epsilon:
                continue
            c, d = coords[s], coords[t]
            c1, c2, c3, c4 = _cross(a, b, c), _cross(a, b, d), _cross(c, d, a), _cross(c, d, b)
            # Inclusive: coincident vertices not joined topologically and
            # collinear overlaps are also a geometry warning.
            if ((c1 <= area_epsilon and c2 >= -area_epsilon) or (c2 <= area_epsilon and c1 >= -area_epsilon)) and ((c3 <= area_epsilon and c4 >= -area_epsilon) or (c4 <= area_epsilon and c3 >= -area_epsilon)):
                crossing_count += 1
                if len(crossings) < 100:
                    crossings.append([i, j])
    return {
        "status": "failed" if zero or duplicates or crossing_count else "passed",
        "zeroLengthEdges": zero, "duplicateEdges": duplicates,
        "crossingCount": crossing_count, "crossingPairs": crossings,
        "crossingPairsTruncated": crossing_count > len(crossings),
        "tolerance": epsilon,
    }


def check_local_conditions(fold: dict) -> dict:
    """Necessary per-interior-vertex conditions computed from FOLD coordinates."""
    coords = fold["vertices_coords"]
    incident = [[] for _ in coords]
    border = set()
    for (u, v), assignment in zip(fold["edges_vertices"], fold["edges_assignment"]):
        incident[u].append((v, assignment))
        incident[v].append((u, assignment))
        if assignment == "B":
            border.update((u, v))
    odd, kawasaki, maekawa, unknown = [], [], [], []
    max_error = 0.0
    interior = 0
    for index, neighbors in enumerate(incident):
        if index in border:
            continue
        interior += 1
        x, y = coords[index]
        if len(neighbors) % 2 or len(neighbors) < 2:
            odd.append(index)
            continue
        angles = sorted(math.atan2(coords[v][1] - y, coords[v][0] - x) for v, _ in neighbors)
        sectors = [(angles[(i + 1) % len(angles)] - a) % math.tau for i, a in enumerate(angles)]
        error_deg = math.degrees(abs(sum(sectors[::2]) - math.pi))
        max_error = max(max_error, error_deg)
        if error_deg > ANGLE_TOLERANCE_DEG:
            kawasaki.append({"vertex": index, "errorDeg": error_deg})
        assignments = [a for _, a in neighbors]
        if any(a not in ("M", "V") for a in assignments):
            unknown.append(index)
        elif abs(assignments.count("M") - assignments.count("V")) != 2:
            maekawa.append(index)
    status = "not_applicable" if not interior else "failed" if odd or kawasaki or maekawa else "incomplete" if unknown else "passed"
    return {
        "status": status, "interiorVertices": interior,
        "oddDegreeVertices": odd, "kawasakiViolations": kawasaki,
        "maekawaViolations": maekawa, "unknownAssignmentVertices": unknown,
        "maxKawasakiErrorDeg": max_error, "toleranceDeg": ANGLE_TOLERANCE_DEG,
    }


def generate(data: object) -> dict:
    params = validate_request(data)
    if params.get('paper',{}).get('fit')=='inscribed':
        from tessellation_paper_inscribed import generate_inscribed_paper
        return generate_inscribed_paper(params, generate)
    if params.get('family') == 'circular-twist':
        return _generate_circular_twist(params)
    if params.get('family') == 'rigid-quad':
        from tessellation_rigid_quad_candidate import generate_rigid_quad_candidate

        return generate_rigid_quad_candidate(params, check_geometry)
    if params.get('family') == 'radial-pot':
        from tessellation_radial_pot import generate_radial_pot

        return generate_radial_pot(params, check_geometry)
    if params.get('family') == 'discrete-curve-cp':
        from tessellation_discrete_curve_cp import generate_discrete_curve_cp
        return generate_discrete_curve_cp(params, check_geometry, check_local_conditions)
    if params.get('family') == 'gore-paper':
        from tessellation_gore import generate_gore_paper
        return generate_gore_paper(params, check_geometry)
    if params.get('family') == 'rectangular-pot':
        from tessellation_rectangular_pot import generate_rectangular_pot

        return generate_rectangular_pot(params, check_geometry)
    if params.get('family') == 'twisted-pot':
        from tessellation_twisted_pot import generate_twisted_pot

        return generate_twisted_pot(params, check_geometry)
    if params.get('family') == 'flasher':
        from tessellation_flasher_candidate import generate_flasher

        return generate_flasher(params, check_geometry)
    if params.get('family') == 'paraboloidal-flasher':
        from tessellation_paraboloidal_flasher_candidate import generate_paraboloidal_flasher

        return generate_paraboloidal_flasher(params, check_geometry)
    if params.get('family') == 'curved-circle-polyhedral':
        from tessellation_curved_circle_polyhedral_candidate import generate_curved_circle_polyhedral

        return generate_curved_circle_polyhedral(params, check_geometry)
    if params.get('family') == 'linked-first-band-polyhedral':
        from tessellation_curved_linked_first_band_polyhedral import generate_linked_first_band_polyhedral

        return generate_linked_first_band_polyhedral(params, check_geometry)
    if params.get('family') in ('twist-joined-tube', 'double-joined-tube', 'closed-twist-topped-tube'):
        return _generate_joined_tube(params)
    if 'paper' in params:
        from tessellation_paper_extend import generate_extended_paper
        return generate_extended_paper(params, _generate_validated)
    return _generate_validated(params)


def _generate_joined_tube(params: dict) -> dict:
    """Adapt Origamica's developed tubes and spatial forms to the studio API."""
    if params['family'] == 'twist-joined-tube':
        from tessellation_twist_joined_tubes import twist_joined_tube_geometry
        construct = twist_joined_tube_geometry
        label = '扭转连接管'
    elif params['family'] == 'double-joined-tube':
        from tessellation_double_joined_tubes import double_joined_tube_geometry
        construct = double_joined_tube_geometry
        label = '双连接管'
    else:
        from tessellation_closed_twist_topped_tube import closed_twist_topped_tube_geometry
        construct = closed_twist_topped_tube_geometry
        label = '封顶扭转管'

    started = time.perf_counter()
    candidate = construct(params)
    fold = candidate['fold']
    assignments = fold['edges_assignment']
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError(f'{label}的二维展开几何未通过检查。')
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(fold['vertices_coords']),
            'edges': len(fold['edges_vertices']),
            'faces': len(fold['faces_vertices']),
            'tiles': len(params['points'] if params['family'] == 'closed-twist-topped-tube'
                         else params['bottomPoints']),
            'mountainEdges': assignments.count('M'),
            'valleyEdges': assignments.count('V'),
            'boundaryEdges': assignments.count('B'),
            'unassignedEdges': assignments.count('U'),
            'elapsedMs': round((time.perf_counter()-started)*1000),
            'parameters': params,
            'checks': {
                'geometry': geometry,
                'local': {'status': 'not_applicable', 'kind': 'spatial-not-flat-foldable',
                          'maximumError': candidate['source']['maximumFaceDistanceError']},
                'layerOrder': {'status': 'not_checked'},
            },
            'foldability': 'static-spatial-state', 'kind': params['family'],
        },
        'warnings': [
            f'已核验{label}的展开纸面与静态三维面逐面等距；未验证连续折叠路径或自碰撞。',
            '该结构不是平折层序结果；其他管状构造仍需独立验收。',
        ],
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only', 'version': 1,
            **candidate['source'],
        },
    }


def _generate_circular_twist(params: dict) -> dict:
    """Generate the notebook's circular twist with a face-isometric flat form."""
    started = time.perf_counter()
    from tessellation_circular_twist import circular_polygon_twist
    from tessellation_lff import analyze_lff_graph

    fold, flat, details = circular_polygon_twist(
        params['polygon'], params['angle'], params['radius'],
        params['centralTypes'], params['circleDivisions'],
        params['stationaryFace'])
    coords = fold['vertices_coords']
    if not coords or len(coords) > MAX_VERTICES or len(fold['edges_vertices']) > MAX_EDGES:
        raise ValueError('圆形扭转结果为空或超过安全规模限制。')
    geometry = check_geometry(fold)
    local = check_local_conditions(fold)
    lff = analyze_lff_graph(fold, geometry_status=geometry['status'])
    assignments = fold['edges_assignment']
    warnings = [
        '已生成原版圆形扭转的折痕与逐面等距平折坐标；整片层序、碰撞及连续折叠路径仍需独立验证。',
        '原版折后外缘圆化是绘图调整，会改变面内距离；本工作区严格平折使用逐面等距坐标。',
    ]
    if local['status'] == 'failed':
        warnings.append('局部山谷或角度条件未通过；请调整中心赋型和轮廓。')
    elif local['status'] == 'incomplete':
        warnings.append('中心存在未指定山谷的折痕，无法完整检查 Maekawa 条件。')
    fold['file_creator'] = '折纸工作台 / Origamica circular polygon twist reconstruction'
    fold['frame_description'] = '圆形纸张扭转候选；严格逐面平折坐标不含层序。'
    source = {
        'name': '折纸工作台', 'license': 'GPL-3.0-only',
        'algorithm': 'Origamica CircularPolygonTwistGraph2D reconstruction',
        'version': 1, 'foldedForm': flat,
        'foldedFormMethod': 'strict face reflection',
        'foldedFormMaxIsometryError': details['closureError'],
        'closureError': details['closureError'],
        'foldedFormStationaryFace': details['stationaryFace'],
        'circularizedFoldedForm': details['circularizedFoldedForm'],
        'circularizedFoldedFormIsometric': False,
        'circleDivisions': details['circleDivisions'],
        'circleRadius': details['radius'],
        'faceOrder': details['faceOrder'],
    }
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(coords), 'edges': len(fold['edges_vertices']),
            'faces': len(fold['faces_vertices']), 'tiles': 1,
            'mountainEdges': assignments.count('M'),
            'valleyEdges': assignments.count('V'),
            'boundaryEdges': assignments.count('B'),
            'unassignedEdges': assignments.count('U'),
            'elapsedMs': round((time.perf_counter() - started) * 1000),
            'parameters': params,
            'checks': {'geometry': geometry, 'local': local, 'lff': lff,
                       'layerOrder': {'status': 'not_checked'}},
            'foldability': 'candidate', 'kind': 'circular-twist',
        },
        'warnings': warnings, 'source': source,
    }


def _generate_validated(params: dict) -> dict:
    started = time.perf_counter()
    os.environ.setdefault("MPLBACKEND", "Agg")
    # These small graphs do not benefit from Numba's per-process JIT startup.
    os.environ.setdefault("NUMBA_DISABLE_JIT", "1")
    vendor_path = str(ROOT / "vendor" / "pleat")
    if vendor_path not in sys.path:
        sys.path.insert(0, vendor_path)
    messages = []
    library_output = io.StringIO()
    with contextlib.redirect_stdout(library_output), contextlib.redirect_stderr(library_output), warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        import numpy as np
        from pleat.example_graphs import from_tiles
        from pleat.example_tilesets import platonic
        from pleat.io.fold import graph_to_fold, fold_to_graph
        from pleat.shrink_rotate import assign_this_way_from_center, shrink_rotate_pattern
        from pleat.shrink_rotate.crease_orientation import assign_this_way_by_bfs
        from tessellation_patterns import polygon_twist, regular_patch, canonical_fold, split_twist
        from tessellation_advanced import ADVANCED, advanced_construct

        family = params.get("family", "primal-dual")
        mother = dual = source_override = None
        if family in ADVANCED or family == 'primal-dual' and ('motherParams' in params or 'dualEdgeFlips' in params):
            fold, mother, dual, tile_count, source_override = advanced_construct(params)
        elif family == "twist":
            if params.get('mode')=='quad-split':
                from tessellation_split import quadrilateral_split
                fold,mother,source_override=quadrilateral_split(params)
            else:
                fold = polygon_twist(params["sides"], params["angle"], params["scale"], params.get('offsetX', 0), params.get('offsetY', 0), params.get('polygon'))
                if 'polygon' in params:
                    from tessellation_advanced import assign_local_mv
                    fold=assign_local_mv(fold,preferred=fold['edges_assignment'].copy())
            tile_count = params.get('splitCount', 1)
            if tile_count > 1:
                fold = split_twist(fold, tile_count)
        else:
            if family == "periodic":
                mother = regular_patch(params["tiling"], params["rows"], params["columns"])
                graph = fold_to_graph(mother)
                # Regular adjacent polygons have perpendicular centroid duals.
                for face in graph.faces:
                    face["reciprocal_pos"] = np.mean([v["pos"] for v in face.vertex_iter()], axis=0)
            else:
                graph = from_tiles(platonic(TILINGS[params["tiling"]]), rings=params["rings"])
                mother = graph_to_fold(graph)
            if 'pruneBoundary' in params:
                from tessellation_prune import prune_mesh
                mother = prune_mesh(mother, params['pruneBoundary'])
                graph = fold_to_graph(mother)
                for face in graph.faces:
                    face['reciprocal_pos'] = np.mean([v['pos'] for v in face.vertex_iter()], axis=0)
            tile_count = len(graph.faces)
            graph.check_consistency()
            if 'dualTargets' in params:
                from tessellation_meshes import reciprocal_centers
                centers, dual = reciprocal_centers(mother, params['dualTargets'])
                for face, center in zip(sorted(graph.faces, key=lambda f:f['id']), centers):
                    face['reciprocal_pos'] = np.array(center)
            if len(graph.faces) == 1:
                result_graph = graph
                messages.append("单块母结构没有共边褶线，保留空白多边形。")
            else:
                if family == "periodic" or 'pruneBoundary' in params:
                    center = np.mean([v["pos"] for v in graph.vertices], axis=0)
                    # Small patches may have no face free of boundary edges.
                    source = min(graph.faces, key=lambda f: (round(float(np.linalg.norm(f["reciprocal_pos"] - center)), 10), f["id"]))
                    assign_this_way_by_bfs(graph, source)
                else:
                    assign_this_way_from_center(graph)
                result_graph = shrink_rotate_pattern(graph, alpha=np.deg2rad(params["angle"]), factor=params["scale"], simplify_boundary=family != "periodic")
                result_graph.check_consistency()
            fold = graph_to_fold(result_graph, title=f"{TITLES[params['tiling']]} Shrink-Rotate 镶嵌候选")
            if family == "periodic":
                fold = canonical_fold(fold)
            if len(graph.faces) > 1:
                from tessellation_preview import shrink_rotate_preview
                fold['zhezhi_preview'] = shrink_rotate_preview(result_graph, fold)
            if len(graph.faces) > 1:
                from tessellation_patterns import make_fold
                ordered_faces = sorted(graph.faces, key=lambda f:f['id'])
                face_index = {f:i for i,f in enumerate(ordered_faces)}
                dual_edges = sorted({tuple(sorted((face_index[e.face],face_index[e.rev.face]))) for e in graph.halfedges if e.face is not None and e.rev.face is not None})
                from tessellation_dual_faces import reciprocal_face_topology
                dual_faces, interior_vertices = reciprocal_face_topology(mother, dual_edges)
                dual = make_fold([f['reciprocal_pos'].tolist() for f in ordered_faces], [list(e) for e in dual_edges], ['A']*len(dual_edges), dual_faces)
                dual['zhezhi_dual_primal_vertices'] = interior_vertices
        if caught:
            messages.append(f"上游计算产生了 {len(caught)} 条数值或兼容性警告；请结合下方独立检查结果判断。")
    tiling_output=source_override is not None and source_override.get('output')=='tiling'
    if 'postRotation' in params and not tiling_output:
        from tessellation_parameters import orient_fold
        orient_fold(fold, params)
    coords = fold["vertices_coords"]
    if not coords or len(coords) > MAX_VERTICES or len(fold["edges_vertices"]) > MAX_EDGES:
        raise ValueError("生成结果为空或超过安全规模限制。")
    if any(len(p) != 2 or not all(math.isfinite(c) for c in p) for p in coords):
        raise ValueError("生成结果包含无效坐标，请更换参数。")
    if family == 'primal-dual':
        for name in ('faceupFace', 'visibleTopFace'):
            if name in params and abs(params[name]) > len(fold['faces_vertices']):
                raise ValueError(f'{name} 超出当前结果的折痕面编号范围。')
    geometry = check_geometry(fold)
    if tiling_output:
        boundary={v for (a,b),kind in zip(fold['edges_vertices'],fold['edges_assignment']) if kind=='B' for v in (a,b)}
        local={
            'status':'not_applicable','reason':'母结构排布的内部线为辅助线，不是折痕。',
            'interiorVertices':len(coords)-len(boundary),
            'oddDegreeVertices':[],'kawasakiViolations':[],'maekawaViolations':[],
            'unknownAssignmentVertices':[],'maxKawasakiErrorDeg':0.,'toleranceDeg':ANGLE_TOLERANCE_DEG,
        }
        messages.append('已生成母结构排布；内部边为辅助线，未生成扭转折痕或平折结构。')
    else:
        local = check_local_conditions(fold)
    from tessellation_lff import analyze_lff_graph

    lff = analyze_lff_graph(fold, geometry_status=geometry['status'])
    assignments = fold["edges_assignment"]
    if geometry["status"] == "failed":
        messages.append(f"几何检查未通过：{geometry['crossingCount']} 组非共端点边相交／重合，{len(geometry['zeroLengthEdges'])} 条退化边；此结果只可作问题候选，不应按已可折图样使用。")
    if local["status"] == "failed":
        messages.append(f"局部必要条件未通过：奇数度 {len(local['oddDegreeVertices'])} 点、Kawasaki {len(local['kawasakiViolations'])} 点、Maekawa {len(local['maekawaViolations'])} 点。请调整参数或赋型。")
    if not tiling_output and (local["unknownAssignmentVertices"] or "U" in assignments):
        messages.append("存在未指定山谷的内部折痕，相关 Maekawa 条件无法完整检查。")
    if not tiling_output:messages.append("本结果是参数化候选折痕图，不是保证可折的成品；即使局部条件通过，整体层序、碰撞、连续折叠路径及实物小样仍未验证。")
    fold["file_creator"] = f"{source_override['name']} / {source_override['algorithm']}" if source_override else "折纸工作台 / independent polygon twist v3" if family == "twist" else f"折纸工作台 / Pleat {REVISION[:12]}"
    fold["frame_description"] = "母结构排布，内部边为辅助线。" if tiling_output else "参数化候选；整体层序和无碰撞路径未验证。"
    source = source_override or ({"name": "折纸工作台", "license": "GPL-3.0-only", "algorithm": "regular-polygon-twist", "version": 3} if family == "twist" else {"name": "Pleat", "repository": "https://github.com/imagirom/pleat", "commit": REVISION, "license": "MIT", "algorithm": "Shrink-Rotate", "orientation": "center-face BFS", "mesh": "independent-regular-patch-v1" if family == "periodic" else "Pleat ring expansion"})
    if params.get('parameterization') == 'gamma-alpha' and not tiling_output:
        if geometry['status'] == 'passed' and fold.get('zhezhi_preview'):
            from tessellation_primal_dual_fold import direct_folded_form
            try:
                vertices, error = direct_folded_form(fold, fold['zhezhi_preview'], params)
                source.update(foldedForm=vertices, foldedFormMethod='Origamica gamma/-alpha direct construction',
                              foldedFormMaxIsometryError=error)
            except ValueError as exc:
                source.update(foldedFormStatus='unavailable', foldedFormReason=str(exc))
        else:
            source.update(foldedFormStatus='unavailable', foldedFormReason='折痕几何未通过检查或缺少逐点原始—对偶构造坐标。')
    return {
        "preview": fold.pop('zhezhi_preview', None),
        "fold": fold, "mother": mother, "dual": dual,
        "stats": {
            "vertices": len(coords), "edges": len(fold["edges_vertices"]), "faces": len(fold["faces_vertices"]),
            "tiles": tile_count, "mountainEdges": assignments.count("M"), "valleyEdges": assignments.count("V"),
            "boundaryEdges": assignments.count("B"), "unassignedEdges": assignments.count("U"),
            "elapsedMs": round((time.perf_counter() - started) * 1000), "parameters": params,
            "checks": {"geometry": geometry, "local": local, "lff": lff, "layerOrder": {"status": "not_checked"}},
            "foldability": "not_applicable" if tiling_output else "candidate", "kind": 'tiling' if tiling_output else family if family in ADVANCED else "polygon_twist" if family == "twist" else "seed" if params.get("rings") == 0 else "shrink_rotate",
        },
        "warnings": messages,
        "source": source,
    }


def dispatch_request(data):
    """Keep numerical analysis queries separate from tessellation generation."""
    if isinstance(data, dict) and 'operation' in data:
        if data['operation'] == 'strain-tq-practical':
            from tessellation_strain_tq_practical import query_strain_tq_practical
            return query_strain_tq_practical({k:v for k,v in data.items() if k!='operation'})
        if data['operation'] == 'rotational-pleats-strain':
            from tessellation_rotational_pleats_strain import query_rotational_pleats_strain
            return query_rotational_pleats_strain({k:v for k,v in data.items() if k!='operation'})
        if data['operation'] == 'pot-cross-section-graphics':
            from tessellation_pot_cross_section import query_pot_cross_section
            return query_pot_cross_section({k:v for k,v in data.items() if k!='operation'})
        if data['operation'] == 'test-pleat':
            from tessellation_test_pleat import query_test_pleat
            return query_test_pleat({k:v for k,v in data.items() if k!='operation'})
        if data['operation'] == 'three-cycle-critical':
            from tessellation_three_cycle_native import query_three_cycle
            return query_three_cycle({k:v for k,v in data.items() if k!='operation'})
        if data['operation'] == 'archimedean-vertex-figure':
            from tessellation_vertex_figure import query_vertex_figure
            return query_vertex_figure({k:v for k,v in data.items() if k!='operation'})
        if data['operation'] == 'gore-data':
            from tessellation_gore import query_gore_data
            return query_gore_data({key:value for key,value in data.items() if key!='operation'})
        if data['operation'] == 'spherical-maximum-dihedrals':
            from tessellation_spherical_vertex import maximum_dihedral_query
            return maximum_dihedral_query(data)
        if data['operation'] == 'degree4-branch-geometry':
            from tessellation_degree4_branches import degree4_branch_query
            return degree4_branch_query(data)
        if data['operation'] == 'degree4-fold-consistency':
            from tessellation_vertex_consistency import degree4_fold_consistency_query
            return degree4_fold_consistency_query(data)
        if data['operation'] == 'degree4-vertex-fan3d':
            from tessellation_vertex_fan3d import degree4_vertex_fan_query
            return degree4_vertex_fan_query(data)
        if data['operation'] == 'lff-reduction':
            from tessellation_lff_reduction import lff_reduction_query
            return lff_reduction_query(data)
        if data['operation'] == 'woven-graph-preprocess':
            from tessellation_woven_graph_source import woven_graph_preprocess_query
            return woven_graph_preprocess_query({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'woven-inset-separation':
            from tessellation_woven_inset_separation import woven_inset_separation_query
            return woven_inset_separation_query(data)
        if data['operation'] == 'vertex-from-fold-vectors':
            from tessellation_vertex_fold_vectors import vertex_from_fold_vectors_query
            return vertex_from_fold_vectors_query(data)
        if data['operation'] == 'goldberg-reference':
            from tessellation_goldberg import goldberg_reference_query
            return goldberg_reference_query(data)
        if data['operation'] == 'ring-function-graphics':
            from tessellation_ring_original import ring_function_graphics_query
            return ring_function_graphics_query(data)
        if data['operation'] == 'curved-space-curve':
            from tessellation_curved_space_curve_query import query_curved_space_curve
            return query_curved_space_curve({key: value for key, value in data.items()
                                             if key != 'operation'})
        if data['operation'] == 'curved-saved-pair':
            from tessellation_curved_saved_pair_query import query_curved_saved_pair
            return query_curved_saved_pair({key: value for key, value in data.items()
                                            if key != 'operation'})
        if data['operation'] == 'curved-ribbon-pair':
            from tessellation_curved_ribbon_pair_query import query_curved_ribbon_pair
            return query_curved_ribbon_pair({key: value for key, value in data.items()
                                             if key != 'operation'})
        if data['operation'] == 'curved-matched-pair':
            from tessellation_curved_matched_pair_query import query_curved_matched_pair
            return query_curved_matched_pair({key: value for key, value in data.items()
                                              if key != 'operation'})
        if data['operation'] == 'curved-uncurl-generic':
            from tessellation_curved_uncurl_generic import generate_uncurl_generic_query
            return generate_uncurl_generic_query({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-discretization-generic':
            from tessellation_curved_discretization_generic import query_discretization_generic
            return query_discretization_generic({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-discretization':
            from tessellation_curved_discretization_query import query_curved_discretization
            return query_curved_discretization({key: value for key, value in data.items()
                                                if key != 'operation'})
        if data['operation'] == 'curved-tangent-developable':
            from tessellation_curved_tangent_developable_query import query_tangent_developable
            return query_tangent_developable({key: value for key, value in data.items()
                                              if key != 'operation'})
        if data['operation'] == 'curved-constant-width':
            if data.get('family') == 'constant-width-generic-native':
                from tessellation_curved_constant_width_generic import query_constant_width_generic
                return query_constant_width_generic({key: value for key, value in data.items()
                                                     if key != 'operation'})
            from tessellation_curved_constant_width_query import query_constant_width_circle
            return query_constant_width_circle({key: value for key, value in data.items()
                                                if key != 'operation'})
        if data['operation'] == 'curved-near-width':
            from tessellation_curved_near_width_query import query_near_width
            return query_near_width({key: value for key, value in data.items()
                                    if key != 'operation'})
        if data['operation'] == 'curved-generic-across-right':
            from tessellation_curved_generic_across_query import query_curved_generic_across_right
            return query_curved_generic_across_right({key: value for key, value in data.items()
                                                     if key != 'operation'})
        if data['operation'] in ('curved-flatten-generic', 'curved-reshape-generic'):
            from tessellation_curved_generic_darboux import query_flatten_generic, query_reshape_generic
            query = query_flatten_generic if data['operation'] == 'curved-flatten-generic' else query_reshape_generic
            return query({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-fold-flatten-generic':
            from tessellation_curved_fold_flatten_generic import query_flatten_fold_generic
            return query_flatten_fold_generic({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-fold-3d-generic':
            from tessellation_curved_fold_3d_generic import query_fold_3d_generic
            return query_fold_3d_generic({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-space-curve-fold-generic':
            from tessellation_curved_space_curve_fold_generic import query_space_curve_fold_generic
            return query_space_curve_fold_generic({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-ribbon-generic':
            from tessellation_curved_ribbon_generic import query_ribbon_generic
            return query_ribbon_generic({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-conic-section-generic':
            from tessellation_curved_conic_section_generic import query_generic_conic_section
            return query_generic_conic_section({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] in ('curved-surface-to-cone-generic', 'curved-surface-to-cylinder-generic'):
            from tessellation_curved_fold_surface_generic import query_fold_surface_to_cone_generic, query_fold_surface_to_cylinder_generic
            query = query_fold_surface_to_cone_generic if data['operation'] == 'curved-surface-to-cone-generic' else query_fold_surface_to_cylinder_generic
            return query({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-curve2d-systems-native':
            from tessellation_curved_curve2d_systems import precompute_curve2d_systems
            return precompute_curve2d_systems({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'planar-functions':
            from tessellation_planar_functions import query_planar_functions
            return query_planar_functions({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-system-helpers-generic':
            from tessellation_curved_system_helpers_generic import query_system_helpers_generic
            return query_system_helpers_generic({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] in ('curved-surface-system-generic', 'curved-surface-normal-generic'):
            from tessellation_curved_surface_system_generic import query_generic_surface_system, query_generic_surface_normal
            query = query_generic_surface_system if data['operation'] == 'curved-surface-system-generic' else query_generic_surface_normal
            return query({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-match-speed-generic':
            from tessellation_curved_match_speed_generic import query_match_curve_speed_generic
            return query_match_curve_speed_generic({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-nonuniform-helix-generic':
            from tessellation_curved_nonuniform_helix_generic import query_generic_nonuniform_helix
            return query_generic_nonuniform_helix({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-planar-sequence-generic':
            from tessellation_curved_planar_sequence_generic import query_planar_sequence_generic
            return query_planar_sequence_generic({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] in ('curved-reshape-cone-generic', 'curved-reshape-tandev-generic'):
            from tessellation_curved_reshape_special_generic import query_reshape_cone_generic, query_reshape_tandev_generic
            query = query_reshape_cone_generic if data['operation'] == 'curved-reshape-cone-generic' else query_reshape_tandev_generic
            return query({key: value for key, value in data.items() if key != 'operation'})
        if data['operation'] == 'curved-canonical-generic':
            from tessellation_curved_canonical_generic import query_generic_canonical
            if set(data) != {'operation', 'canonicalInput'} or not isinstance(data['canonicalInput'], dict):
                raise ValueError('通用可展面请求缺少原始构造参数。')
            return query_generic_canonical(data['canonicalInput'])
        if data['operation'] == 'curved-generic-cone-flatten':
            from tessellation_curved_generic_cone_flatten_query import query_generic_cone_flatten
            return query_generic_cone_flatten({key: value for key, value in data.items()
                                               if key != 'operation'})
        if data['operation'] == 'curved-linked-first-band':
            from tessellation_curved_linked_first_band_query import query_linked_first_band
            return query_linked_first_band({key: value for key, value in data.items()
                                            if key != 'operation'})
        if data['operation'] == 'twisted-pot-smooth-reference':
            from tessellation_twisted_pot_smooth_query import query_twisted_pot_smooth
            return query_twisted_pot_smooth({key: value for key, value in data.items()
                                             if key != 'operation'})
        if data['operation'] == 'radial-pot-cw-reference':
            from tessellation_radial_pot_cw_query import query_radial_pot_cw
            return query_radial_pot_cw({key: value for key, value in data.items()
                                        if key != 'operation'})
        if data['operation'] == 'alt-mosely-pot-reference':
            from tessellation_alt_mosely_pot_query import query_alt_mosely_pot
            return query_alt_mosely_pot({key: value for key, value in data.items()
                                         if key != 'operation'})
        if data['operation'] == 'huffman-circle4':
            from tessellation_huffman_circle4_query import query_huffman_circle4
            return query_huffman_circle4({key: value for key, value in data.items()
                                          if key != 'operation'})
        if data['operation'] == 'huffman-parabola':
            from tessellation_huffman_parabola_query import query_huffman_parabola
            return query_huffman_parabola({key: value for key, value in data.items()
                                           if key != 'operation'})
        if data['operation'] == 'circular-twist':
            if data.get('family', 'circular-twist') != 'circular-twist':
                raise ValueError('圆形扭转查询的构造类型不匹配。')
            return generate({**{key: value for key, value in data.items()
                                if key != 'operation'}, 'family': 'circular-twist'})
        if data['operation'] == 'rigid-fold-angle-scale':
            from tessellation_rigid_fold_angles import rigid_fold_angle_scale_query
            return rigid_fold_angle_scale_query(data)
        if data['operation'] == 'rigid-single-vertex-quad-mesh':
            from tessellation_rigid_single_vertex import rigid_single_vertex_quad_mesh_query
            return rigid_single_vertex_quad_mesh_query(data)
        if data['operation'] == 'rigid-quad-mesh':
            from tessellation_rigid_quad_mesh import rigid_rectangular_quad_mesh_query
            return rigid_rectangular_quad_mesh_query(data)
        if data['operation'] == 'flagstone-tilted-star':
            from tessellation_flagstone_tilted import tilted_star_query
            return tilted_star_query(data)
        raise ValueError('未知镶嵌分析操作。')
    return generate(data)


def serve() -> int:
    """One bounded JSON request per line; keep imported numerical libraries warm."""
    while True:
        raw = sys.stdin.buffer.readline(MAX_INPUT_BYTES + 2)
        if not raw:
            return 0
        if len(raw) > MAX_INPUT_BYTES + 1 or not raw.endswith(b'\n'):
            return 2  # A broken/oversized frame cannot contaminate the next job.
        try:
            def reject_constant(value):
                raise ValueError(f"JSON 不接受 {value}。")
            data = json.loads(raw.decode('utf-8-sig'), parse_constant=reject_constant)
            reply = {'result': dispatch_request(data)}
        except (ValueError, UnicodeError) as exc:
            reply = {'error': f'镶嵌生成失败：{exc}'}
        except ImportError:
            reply = {'error': '镶嵌计算组件缺失或不兼容，请重新准备计算环境。'}
        except Exception as exc:
            reply = {'error': f'镶嵌计算未完成（{type(exc).__name__}）。请减小规模或更换参数。'}
        print(json.dumps(reply, ensure_ascii=False, allow_nan=False, separators=(',', ':')), flush=True)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    if sys.argv[1:] == ['--worker']:
        return serve()
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise ValueError(f"输入过大，最大允许 {MAX_INPUT_BYTES} 字节。")
        def reject_constant(value):
            raise ValueError(f"JSON 不接受 {value}。")
        data = json.loads(raw.decode("utf-8-sig"), parse_constant=reject_constant)
        result = dispatch_request(data)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")))
        return 0
    except json.JSONDecodeError:
        print("镶嵌生成失败：输入不是合法的 JSON。", file=sys.stderr)
        return 2
    except UnicodeError:
        print("镶嵌生成失败：输入必须使用 UTF-8 编码。", file=sys.stderr)
        return 2
    except ValueError as exc:
        print(f"镶嵌生成失败：{exc}", file=sys.stderr)
        return 2
    except ImportError as exc:
        if os.environ.get("ZHEZHI_BUILD_DIAGNOSTICS") == "1":
            import traceback
            traceback.print_exc(file=sys.stderr)
        print("镶嵌计算组件缺失或不兼容。桌面版请重新解压完整程序；源码版请按 requirements-lock.txt 准备 .venv。", file=sys.stderr)
        return 3
    except Exception as exc:
        # Never present an upstream exception as a valid candidate or a traceback
        # with local machine details. A short error category helps diagnosis.
        print(f"镶嵌计算未完成（{type(exc).__name__}）。请减小圈数或更换旋转角、缩放参数。", file=sys.stderr)
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
