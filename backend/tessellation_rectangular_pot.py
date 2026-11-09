"""Origamica MakeRectangularPotWedge / MakeRectangularPot static 3D geometry.

Notebook section 43, lines 265373–266520 and 268073–268220.  A wedge is a
rectangular paper strip with six longitudinal point rows.  PotPanels copies
are translated in its CP and rotated by 2*pi/m around the folded z axis.
"""

import math
import time

from tessellation_patterns import make_fold, planar_faces
from tessellation_radial_pot import (
    _cross, _dot, _edge_assignments, _face_checks, _plus, _scaled, _sub, _unit,
)


def validate_rectangular_pot(data):
    allowed = {'family', 'crossSection', 'sectors', 'panels', 'asymmetry',
               'gapHalfAngleDeg', 'flangeExcess', 'typeMinimumAngleDeg',
               'flatFlangeInset'}
    if (not isinstance(data, dict) or data.get('family') != 'rectangular-pot'
            or set(data)-allowed):
        raise ValueError('矩形壶体包含不支持的参数。')
    points = data.get('crossSection', [[0, 0], [1, 1], [1, 2], [1, 3], [2, 4]])
    if (not isinstance(points, list) or not 2 <= len(points) <= 24 or
            any(not isinstance(point, list) or len(point) != 2 or
                any(type(value) not in (int, float) or not math.isfinite(value)
                    or abs(value) > 20 for value in point) for point in points)):
        raise ValueError('矩形壶体剖面须为 2–24 个有限的 [半径, 高度] 点。')
    section = [[float(x), float(z-points[0][1])] for x, z in points]
    if any(x < -1e-10 for x, _ in section) or max(x for x, _ in section) <= 1e-8:
        raise ValueError('矩形壶体剖面半径须非负，且至少有一个正半径。')
    if any(math.dist(a, b) < 1e-8 for a, b in zip(section, section[1:])):
        raise ValueError('矩形壶体剖面存在退化相邻边。')
    increments = [section[i+1][1]-section[i][1] for i in range(len(section)-1)]
    if abs(increments[0]) < 1e-9:
        increments = increments[1:]
    if increments and (any(abs(delta) < 1e-9 for delta in increments) or
                       len({1 if delta > 0 else -1 for delta in increments}) != 1):
        raise ValueError('剖面高度须严格单调，仅首段可等高。')
    sectors = data.get('sectors', 5)
    panels = data.get('panels', sectors)
    if (type(sectors) is not int or not 3 <= sectors <= 16 or
            type(panels) is not int or not 1 <= panels or
            5*panels*(len(section)-1) > 600):
        raise ValueError('旋转阶数须为 3–16，实际面板数须为正整数，估计面数不超过 600。')
    def finite(name, default, low, high):
        value = data.get(name, default)
        if (type(value) not in (int, float) or not math.isfinite(value)
                or not low <= value <= high):
            raise ValueError(f'{name} 须为 {low}–{high} 的有限数值。')
        return float(value)
    rho = finite('asymmetry', 0, -1, 1)
    inset = finite('flatFlangeInset', 0, 0, .5)
    if inset and abs(rho) != 1:
        raise ValueError('法兰显示内缩仅适用于不对称度 ρ=±1。')
    gap = finite('gapHalfAngleDeg', 0, 0, 90)
    excess = finite('flangeExcess', 0, 0, 2)
    minimum = finite('typeMinimumAngleDeg', 0, 0, 45)
    if gap >= 90/sectors:
        raise ValueError('壶体接缝半角须小于扇区半角的一半。')
    if len(section) == 2 and abs(section[1][1]) < 1e-9:
        raise ValueError('两点剖面须有非零高度。')
    return {'family': 'rectangular-pot', 'crossSection': section,
            'sectors': sectors, 'panels': panels, 'asymmetry': rho,
            'gapHalfAngleDeg': gap, 'flangeExcess': excess,
            'typeMinimumAngleDeg': minimum, 'flatFlangeInset': inset}


def _gap_scalar(radius, x, width, h, phi, delta, rho, b, e, bb, ee):
    """Smallest nonnegative root of |d-c|²=|dd-cc|² at a given row."""
    scale = h-width
    v = x*math.sin(delta)/(math.cos(phi-delta)*math.cos(phi-2*delta))
    cdir = (0., 1.)
    ddir = (0., -1.)
    ccdir = (*_unit(2*(phi-delta)-math.pi/2), 0.)
    dddir = (*_unit(math.pi/2+2*delta), 0.)
    def differences(u):
        s = scale*u*(1-rho)/2-v
        t = scale*u*(1+rho)/2-v
        c = _plus(b, _scaled(cdir, s))
        d = _plus(e, _scaled(ddir, t))
        cc = _plus(bb, _scaled(ccdir, s))
        dd = _plus(ee, _scaled(dddir, t))
        return _sub(d, c), _sub(dd, cc)
    p, p3 = differences(0)
    p1, p31 = differences(1)
    q, q3 = _sub(p1, p), _sub(p31, p3)
    aa = _dot(q, q)-_dot(q3, q3)
    bbcoef = 2*(_dot(p, q)-_dot(p3, q3))
    cc = _dot(p, p)-_dot(p3, p3)
    tolerance = 1e-12*max(1, abs(aa), abs(bbcoef), abs(cc))
    if abs(aa) < tolerance:
        roots = [-cc/bbcoef] if abs(bbcoef) >= tolerance else []
    else:
        disc = bbcoef*bbcoef-4*aa*cc
        roots = [] if disc < -tolerance else [
            (-bbcoef-math.sqrt(max(disc, 0)))/(2*aa),
            (-bbcoef+math.sqrt(max(disc, 0)))/(2*aa)]
    roots = [root for root in roots if math.isfinite(root) and root >= -1e-9]
    if not roots:
        raise ValueError('当前剖面与接缝角没有非负的原版矩形壶体解。')
    u = max(0., min(roots))
    lhs, rhs = differences(u)
    if abs(_dot(lhs, lhs)-_dot(rhs, rhs)) > 1e-8*max(1, _dot(lhs, lhs), _dot(rhs, rhs)):
        raise ValueError('矩形壶体接缝方程数值残差过大。')
    return u, v


def _wedge_rows(params):
    section = params['crossSection']
    phi = math.pi/params['sectors']
    delta = math.radians(params['gapHalfAngleDeg'])
    rho = params['asymmetry']
    radii = [0.]
    for a, b in zip(section, section[1:]):
        radii.append(radii[-1]+math.dist(a, b))
    widths = [math.tan(phi-delta)*x for x, _ in section]
    h = max(widths)*(1+params['flangeExcess'])
    if h <= 1e-8:
        raise ValueError('矩形壶体面板半高退化。')
    cp = {letter: [] for letter in 'abcdef'}
    xyz = {letter: [] for letter in 'abcdef'}
    solutions = []
    for (x, z), radius, width in zip(section, radii, widths):
        a = (radius, 0.)
        b = (radius, width)
        f = (radius, 2*h)
        e = (radius, 2*h-width)
        aa = (x, 0., z)
        bb = (x, width, z)
        ff = (*_scaled(_unit(2*phi), x), z)
        ee = _plus(ff, _scaled((*_unit(2*phi-math.pi/2), 0.), width))
        if delta == 0:
            if abs(rho) == 1:
                u = 1.
            elif rho == 0:
                u = 1/math.cos(phi/2)**2
            else:
                # Rationalize the notebook's general-rho expression to avoid
                # subtracting two nearly equal numbers when rho approaches ±1.
                u = 2/(1+math.sqrt(math.cos(phi)**2+rho*rho*math.sin(phi)**2))
            v = 0.
        else:
            u, v = _gap_scalar(radius, x, width, h, phi, delta, rho, b, e, bb, ee)
        s = (h-width)*u*(1-rho)/2-v
        t = (h-width)*u*(1+rho)/2-v
        if not all(math.isfinite(value) for value in (u, v, s, t)) or min(s, t) < -1e-8:
            raise ValueError('当前接缝角导致负的矩形壶体法兰宽度。')
        s, t = max(0., s), max(0., t)
        c = _plus(b, (0., s))
        d = _plus(e, (0., -t))
        cc = _plus(bb, _scaled((*_unit(2*(phi-delta)-math.pi/2), 0.), s))
        dd = _plus(ee, _scaled((*_unit(math.pi/2+2*delta), 0.), t))
        if c[1] > d[1]+1e-8:
            raise ValueError('矩形壶体中间法兰交叉，不能形成单张纸。')
        for letter, point, spatial in zip('abcdef', (a, b, c, d, e, f),
                                           (aa, bb, cc, dd, ee, ff)):
            cp[letter].append(point)
            xyz[letter].append(spatial)
        solutions.append({'radius': radius, 'width': width, 'u': u,
                          'v': v, 's': s, 't': t})
    return cp, xyz, solutions, h


def _rotate3(point, angle):
    c, s = math.cos(angle), math.sin(angle)
    return (c*point[0]-s*point[1], s*point[0]+c*point[1], point[2])


def _assemble(params, rows2, rows3, h):
    panels, n = params['panels'], len(params['crossSection'])
    coords, spatial, ids, lookup, edges, initial = [], [], {}, {}, [], []
    edge_lookup = {}
    for panel in range(panels):
        theta = 2*math.pi*panel/params['sectors']
        for letter in 'abcdef':
            for level in range(n):
                x, y = rows2[letter][level]
                p = (x, y+2*h*panel)
                q = _rotate3(rows3[letter][level], theta)
                key = tuple(round(value, 9) for value in (*p, *q))
                index = lookup.get(key)
                if index is None:
                    index = len(coords)
                    lookup[key] = index
                    coords.append(list(p))
                    spatial.append(list(q))
                ids[panel, letter, level] = index
        def edge(a, ai, b, bi, kind):
            first, second = ids[panel, a, ai], ids[panel, b, bi]
            if first == second:
                return
            key = tuple(sorted((first, second)))
            if key in edge_lookup:
                return
            edge_lookup[key] = len(edges)
            edges.append(list(key))
            initial.append(kind)
        for level in range(n-1):
            for letter in 'abcdef':
                edge(letter, level, letter, level+1,
                     'outer' if letter in 'af' else 'longitudinal')
        for level in range(n):
            for a, b in zip('abcde', 'bcdef'):
                edge(a, level, b, level,
                     'B' if level in (0, n-1) else 'transverse')
    if any(not all(math.isfinite(value) for value in p) for p in coords+spatial):
        raise ValueError('矩形壶体产生非有限二维或三维坐标。')
    if len(coords) > 3000 or len(edges) > 6000:
        raise ValueError('矩形壶体图元超过安全规模。')
    cp_lookup = {}
    for i, point in enumerate(coords):
        key = tuple(round(value, 9) for value in point)
        previous = cp_lookup.get(key)
        if previous is not None and math.dist(spatial[previous], spatial[i]) > 1e-7:
            raise ValueError('矩形壶体展开坐标重合但三维位置不一致。')
        cp_lookup[key] = i
    faces = planar_faces(coords, edges)
    if not faces or len(faces) > 600 or any(len(face) > 64 for face in faces):
        raise ValueError('矩形壶体面数为空或超过当前安全规模。')
    if len(coords)-len(edges)+len(faces) != 1:
        raise ValueError('矩形壶体不是一张连通的无孔纸面。')
    return coords, spatial, edges, initial, faces, ids


def generate_rectangular_pot(params, check_geometry):
    started = time.perf_counter()
    rows2, rows3, solutions, h = _wedge_rows(params)
    coords, spatial, edges, initial, faces, ids = _assemble(params, rows2, rows3, h)
    distance_error, plane_error = _face_checks(coords, spatial, faces)
    assignments, fold_angles = _edge_assignments(
        coords, spatial, edges, initial, faces, params['typeMinimumAngleDeg'])
    fold = make_fold(coords, edges, assignments, faces)
    fold['edges_foldAngle'] = fold_angles
    fold['file_creator'] = '折纸工作台 / Origamica MakeRectangularPot reconstruction'
    fold['frame_description'] = '矩形壶体二维展开纸与静态真实三维形态；不是平折层序。'
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('矩形壶体二维展开折痕的几何未通过检查。')
    flange_display = None
    if params['flatFlangeInset']:
        letter = 'b' if params['asymmetry'] == -1 else 'e'
        flange_display = {
            'fraction': params['flatFlangeInset'],
            'vertexIndices': sorted({ids[panel, letter, level]
                                     for panel in range(params['panels'])
                                     for level in range(len(params['crossSection']))}),
            'sourceLetter': letter,
            'displayOnly': True,
            'metricPreserving': False,
        }
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(coords), 'edges': len(edges), 'faces': len(faces),
            'tiles': params['panels'], 'mountainEdges': assignments.count('M'),
            'valleyEdges': assignments.count('V'), 'boundaryEdges': assignments.count('B'),
            'unassignedEdges': assignments.count('U'),
            'elapsedMs': round((time.perf_counter()-started)*1000), 'parameters': params,
            'checks': {'geometry': geometry,
                       'local': {'status': 'not_applicable', 'kind': 'spatial-not-flat-foldable',
                                 'maximumError': max(distance_error, plane_error)},
                       'layerOrder': {'status': 'not_checked'}},
            'foldability': 'static-spatial-state', 'kind': 'rectangular-pot',
        },
        'warnings': [
            '已核验矩形壶体静态三维面与展开折痕逐面对距、共面和共享边；未验证连续折叠路径或自碰撞。',
            '法兰内缩仅在三维显示中分开共面面片，不改变已验的真实等距坐标。',
            *(['面板绕轴重复，三维面片重合；二维纸面逐瓣展开，碰撞、连续折叠路径和层序未验证。']
              if params['panels'] > params['sectors'] else []),
        ],
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only',
            'algorithm': 'Origamica MakeRectangularPot / MakeRectangularPotWedge reconstruction',
            'version': 1, 'output': 'spatial-3d',
            'spatialKind': 'origamica-rectangular-pot',
            'foldedForm3D': spatial,
            'maximumFaceDistanceError': distance_error,
            'maximumFacePlaneError': plane_error,
            'staticGlobalIsometryChecked': True,
            'continuousRigidPathChecked': False,
            'selfCollisionChecked': False,
            'flangeHalfHeight': h,
            'gapSolutions': solutions,
            # In[3494] prints PotWedgeJoinVertices. Original Mathematica
            # vertex IDs are 1-based and insertion-order dependent; expose
            # the same a/f boundary rows in this graph's 0-based indexing.
            'wedgeJoinVertices0Based': [
                [ids[0, letter, level] for level in range(len(params['crossSection']))]
                for letter in ('a', 'f')],
            **({'flatFlangeDisplay': flange_display} if flange_display else {}),
            'unsupportedOrigamicaOptions': ['PotPanels>m'],
            **({'unsupportedOrigamicaOptions': [],
                'circumferentialRepetition': {
                    'sectorsPerTurn': params['sectors'],
                    'panels': params['panels'],
                    'completedTurns': params['panels']//params['sectors'],
                    'remainingPanels': params['panels']%params['sectors'],
                    'spatialImagesOverlap': True,
                }} if params['panels'] > params['sectors'] else {}),
        },
    }
