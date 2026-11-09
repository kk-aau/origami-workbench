"""A verified faceted subset of Origamica's ``MakeTwistedPot``.

The equations and graph incidence follow notebook In[3520], lines
269061–271110.  This module only returns a spatial form after every planar
face has passed metric and coplanarity checks.  The notebook's smooth-flange
mode violates that contract; display inset is kept out of true coordinates.
"""

import math
import time

import numpy as np
from scipy.optimize import least_squares, root

from tessellation_patterns import make_fold, planar_faces
from tessellation_radial_pot import _edge_assignments, _face_checks


def validate_twisted_pot(data):
    allowed = {'family', 'crossSection', 'sectors', 'asymmetry', 'goreTwist',
               'flangeRotationDeg', 'border', 'flatFlanges', 'flangeInset',
               'typeMinimumAngleDeg'}
    if not isinstance(data, dict) or data.get('family') != 'twisted-pot' or set(data) - allowed:
        raise ValueError('扭转壶体包含不支持的参数。')
    raw = data.get('crossSection', [[0, 0], [1, 0], [1, .5], [1.5, 1], [1, 1.5], [1, 2]])
    if (not isinstance(raw, list) or not 4 <= len(raw) <= 12 or
            any(not isinstance(p, list) or len(p) != 2 or
                any(type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 20
                    for v in p) for p in raw)):
        raise ValueError('扭转壶体剖面须为 4–12 个有限的 [半径, 高度] 点。')
    section = [[float(x - raw[0][0]), float(z - raw[0][1])] for x, z in raw]
    if abs(section[1][1]) > 1e-10 or section[1][0] <= 1e-7:
        raise ValueError('扭转壶体首段必须是从中心向外的水平底边。')
    dz = [b[1] - a[1] for a, b in zip(section[1:], section[2:])]
    if (not dz or any(abs(v) < 1e-8 for v in dz) or
            len({1 if v > 0 else -1 for v in dz}) != 1):
        raise ValueError('扭转壶体首段之后的剖面高度须严格单调。')
    if any(x <= 1e-7 for x, _ in section[1:]):
        raise ValueError('扭转壶体剖面半径须为正。')
    m = data.get('sectors', 6)
    if type(m) is not int or not 3 <= m <= 16 or m * (3 * len(section) - 5) > 500:
        raise ValueError('扭转壶体旋转阶数须为 3–16，图元不能超过规模限制。')
    rho = data.get('asymmetry', 1)
    tau = data.get('goreTwist', 1)
    if type(rho) is not int or rho not in (-1, 1) or type(tau) is not int or tau not in (-1, 1):
        raise ValueError('原版扭转壶体的 rho 与 tau 仅接受 +1 或 -1。')
    def finite(name, default, low, high):
        value = data.get(name, default)
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'{name} 须为 {low}–{high} 的有限数值。')
        return float(value)
    zeta = finite('flangeRotationDeg', 0, -45, 45)
    minimum = finite('typeMinimumAngleDeg', .5, 0, 45)
    inset = finite('flangeInset', 0, 0, .5)
    flange = data.get('flatFlanges', 'faceted')
    if flange != 'faceted':
        raise ValueError('原版 smooth 法兰 3D 不等距；严格等距模式只接受 faceted。')
    border = data.get('border', 'planar')
    if border not in ('planar', 'trimmed'):
        raise ValueError('扭转壶体边缘仅支持 planar 或 trimmed。')
    return {'family': 'twisted-pot', 'crossSection': section, 'sectors': m,
            'asymmetry': rho, 'goreTwist': tau, 'flangeRotationDeg': zeta,
            'border': border, 'flatFlanges': flange, 'flangeInset': inset,
            'typeMinimumAngleDeg': minimum}


def _rotate(p, a):
    c, s = math.cos(a), math.sin(a)
    return np.array((c*p[0]-s*p[1], s*p[0]+c*p[1], *p[2:]), dtype=float)


def _unit(a):
    return np.array((math.cos(a), math.sin(a)))


def _reflect(point, anchor, direction):
    d = point-anchor
    return anchor + (2*np.dot(d, direction)*direction-d)


def _line_intersection(a, u, b, v):
    cross = lambda p, q: p[0]*q[1]-p[1]*q[0]
    denominator = cross(u, v)
    if abs(denominator) < 1e-9:
        raise ValueError('法兰直线与横截折痕平行，无法确定展开位置。')
    return a + cross(b-a, v)/denominator*u


def _gore_rows(params):
    section = params['crossSection']
    m, tau = params['sectors'], params['goreTwist']
    phi = math.pi/m
    turn = 2*phi
    zeta = math.radians(params['flangeRotationDeg'])
    rfl = _unit(phi+zeta)
    p = [None, np.array((section[1][0], math.tan(phi)*section[1][0]))]
    r = list(p)
    q = list(p)
    pp = [None, np.array((*p[1], 0.))]
    rr = list(pp)
    qq = list(pp)
    twists = [0., 0.]
    residuals = []
    for i in range(2, len(section)):
        x, z = section[i]
        width = math.tan(phi)*x
        previous_r = r[-1]
        previous_p = p[-1]
        previous_ff = rr[-1]
        radial_step = math.dist(section[i-1], section[i])
        def geometry(v):
            candidate_r = np.array(v[:2])
            candidate_p = _reflect(candidate_r, r[1], rfl)
            candidate_ff = _rotate(np.array((x, width, z)), v[2])
            return candidate_r, candidate_p, candidate_ff
        def equations(v):
            candidate_r, candidate_p, candidate_ff = geometry(v)
            radial = np.linalg.norm(candidate_r-previous_r)-np.linalg.norm(candidate_ff-previous_ff)
            axial = np.linalg.norm(candidate_r-_rotate(candidate_p, turn))-np.linalg.norm(
                candidate_ff-_rotate(candidate_ff, turn))
            if tau == 1:
                diagonal = np.linalg.norm(_rotate(candidate_p, turn)-previous_r)-np.linalg.norm(
                    _rotate(candidate_ff, turn)-previous_ff)
            else:
                diagonal = np.linalg.norm(candidate_r-_rotate(previous_p, turn))-np.linalg.norm(
                    candidate_ff-_rotate(previous_ff, turn))
            return np.array((radial, diagonal, axial))
        guess = np.array((* (previous_r+.1*radial_step*rfl), twists[-1]))
        attempts = [guess]
        for tilt in (-.2, .2, -.5, .5):
            attempts.append(np.array((guess[0], guess[1], guess[2]+tilt)))
        candidates = []
        for initial in attempts:
            sol = root(equations, initial, method='hybr', options={'xtol': 1e-11})
            error = np.linalg.norm(equations(sol.x), ord=1)
            if np.all(np.isfinite(sol.x)) and error < 1e-8*max(1., radial_step):
                candidate_r, candidate_p, candidate_ff = geometry(sol.x)
                if (np.linalg.norm(candidate_r-previous_r) > 1e-8 and
                        np.linalg.norm(candidate_p-previous_p) > 1e-8):
                    candidates.append((np.linalg.norm(sol.x-guess), error,
                                       candidate_r, candidate_p, candidate_ff, sol.x[2]))
        if not candidates:
            raise ValueError(f'第 {i+1} 层 gore 等距方程无可靠根。')
        _, error, next_r, next_p, next_ff, next_twist = min(candidates, key=lambda item: (item[0], item[1]))
        r.append(next_r)
        p.append(next_p)
        rr.append(next_ff)
        pp.append(next_ff)
        twists.append((next_twist+math.pi)%(2*math.pi)-math.pi)
        residuals.append(float(error))
        q.append(_line_intersection(p[1], rfl, next_p, _unit(math.pi/2+zeta)))
        qq_dir = next_ff-_rotate(next_ff, -turn) if params['asymmetry'] == 1 else next_ff-_rotate(next_ff, turn)
        qq.append(next_ff+np.linalg.norm(q[-1]-next_p)*qq_dir/np.linalg.norm(qq_dir))
    return p, q, r, pp, qq, rr, rfl, twists, residuals


def _faceted_flange(params, rows):
    p, q, r, pp, qq, rr, rfl, twists, gore_residuals = rows
    rho = params['asymmetry']
    n = len(p)-1
    residuals = []
    for i in range(2, n+1):
        center = pp[i]
        ux = np.array((center[0], center[1], 0.))
        ux /= np.linalg.norm(ux)
        uy = np.array((-ux[1], ux[0], 0.))
        def points(v):
            return q[i-1]+v[0]*rfl, center+v[1]*ux+rho*v[2]*uy
        def equations(v):
            cp, ff = points(v)
            first = np.linalg.norm(cp-q[i-1])-np.linalg.norm(ff-qq[i-1])
            second = np.linalg.norm(cp-p[i])-np.linalg.norm(ff-center)
            if i < n:
                third = np.linalg.norm(cp-p[i+1])-np.linalg.norm(ff-pp[i+1])
            else:
                anchor = qq[n-1]
                a = pp[n-1] if rho == 1 else rr[n-1]
                b = pp[n] if rho == 1 else rr[n]
                third = np.dot(ff-anchor, np.cross(a-anchor, b-anchor))
            return np.array((first, second, third))
        attempts = [(s, a, b) for s in (.01, .1, .5, 1.)
                    for a, b in ((.01, .01), (.1, .1), (.5, .1), (.1, .5))]
        candidates = []
        for start in attempts:
            sol = least_squares(equations, start, bounds=(0, np.inf),
                                xtol=1e-12, ftol=1e-12, gtol=1e-12, max_nfev=300)
            error = np.linalg.norm(equations(sol.x), ord=1)
            if np.all(np.isfinite(sol.x)) and error < 1e-8:
                cp, ff = points(sol.x)
                if sol.x[0] > 1e-8 and np.linalg.norm(cp-p[i]) > 1e-8:
                    candidates.append((np.linalg.norm(sol.x-np.array((.01, .01, .01))),
                                       error, cp, ff, sol.x))
        if not candidates:
            raise ValueError(f'第 {i+1} 层 faceted 法兰等距方程无可靠非负根。')
        _, error, q[i], qq[i], _ = min(candidates, key=lambda item: (item[0], item[1]))
        residuals.append(float(error))
    return p, q, r, pp, qq, rr, twists, gore_residuals, residuals


def _assemble(params, rows):
    p, q, r, pp, qq, rr, twists, gore_residuals, flange_residuals = rows
    m, n = params['sectors'], len(p)-1
    phi = math.pi/m
    trimmed = params['border'] == 'trimmed'
    coords, spatial, ids = [], [], {}
    def add(letter, i, j):
        index = len(coords)
        cp = {'p':p, 'q':q, 'r':r}[letter][i]
        ff = {'p':pp, 'q':qq, 'r':rr}[letter][i]
        coords.append(_rotate(cp, 2*j*phi).tolist())
        spatial.append(_rotate(ff, 2*j*phi).tolist())
        ids[letter, i, j % m] = index
    for j in range(m):
        add('r', 1, j)
        ids['p', 1, j] = ids['q', 1, j] = ids['r', 1, j]
        for i in range(2, n+1):
            add('p', i, j)
        for i in range(2, n if trimmed else n+1):
            add('q', i, j)
        for i in range(2, n+1):
            add('r', i, j)
    edges, kinds, found = [], [], set()
    def edge(a, ai, aj, b, bi, bj, kind):
        first = ids[a, ai, aj % m]
        second = ids[b, bi, bj % m]
        key = tuple(sorted((first, second)))
        if first == second or key in found:
            raise ValueError('扭转壶体产生重复或零长折痕。')
        found.add(key)
        edges.append(list(key))
        kinds.append(kind)
    cc = 'V' if params['crossSection'][-1][1] > 0 else 'M'
    for j in range(m):
        edge('r', 1, j-1, 'p', 1, j, cc)
        for i in range(2, n+1):
            if i > 2:
                edge('q', i-1, j-1, 'r', i, j-1, 'B' if i == n and trimmed else 'U')
            edge('r', i-1, j-1, 'r', i, j-1, 'U')
            if params['goreTwist'] == -1:
                edge('r', i, j-1, 'p', i-1, j, 'U')
            else:
                edge('r', i-1, j-1, 'p', i, j, 'U')
            edge('p', i-1, j, 'p', i, j, 'U')
            if i > 2:
                edge('q', i-1, j, 'p', i, j, 'B' if i == n and trimmed else 'U')
            if not (i == n and trimmed):
                edge('q', i-1, j, 'q', i, j, cc)
                edge('q', i, j-1, 'r', i, j-1, 'B' if i == n else 'U')
            edge('r', i, j-1, 'p', i, j, 'B' if i == n else 'U')
            if not (i == n and trimmed):
                edge('p', i, j, 'q', i, j, 'B' if i == n else 'U')
    faces = planar_faces(coords, edges)
    if len(coords)-len(edges)+len(faces) != 1 or not faces:
        raise ValueError('扭转壶体二维展开图不是单张连续无孔纸面。')
    if len(faces) > 600 or any(len(f) > 12 for f in faces):
        raise ValueError('扭转壶体面数或面边数超过限制。')
    return coords, spatial, edges, kinds, faces, twists, gore_residuals, flange_residuals, ids


def generate_twisted_pot(params, check_geometry):
    started = time.perf_counter()
    params = validate_twisted_pot(params)
    rows = _faceted_flange(params, _gore_rows(params))
    coords, spatial, edges, kinds, faces, twists, gore_residuals, flange_residuals, ids = _assemble(params, rows)
    distance_error, plane_error = _face_checks(coords, spatial, faces)
    assignments, angles = _edge_assignments(coords, spatial, edges, kinds, faces,
                                            params['typeMinimumAngleDeg'])
    # In[3520] only sends initially unassigned U edges through
    # FoldAngleToType.  The base and longitudinal flange folds keep their
    # prescribed valley/mountain type even where the spatial angle is 180°.
    assignments = [kind if kind != 'U' else assignment
                   for kind, assignment in zip(kinds, assignments)]
    if any(kind == 'B' and assignment != 'B' for kind, assignment in zip(kinds, assignments)):
        raise ValueError('扭转壶体边界赋型不一致。')
    # A completely folded hinge is the same spatial state at +180° and
    # -180°. The notebook keeps its prescribed M/V type on these edges;
    # normalize only that equivalent endpoint so FOLD's signed-angle contract
    # agrees with the original assignment when the project is imported.
    for index, (assignment, angle) in enumerate(zip(assignments, angles)):
        if assignment in ('M', 'V') and angle is not None and abs(abs(angle)-180) < 1e-7:
            angles[index] = 180. if assignment == 'V' else -180.
    fold = make_fold(coords, edges, assignments, faces)
    fold['edges_foldAngle'] = angles
    fold['file_creator'] = '折纸工作台 / Origamica MakeTwistedPot verified subset'
    fold['frame_description'] = '扭转壶体二维展开纸与静态三维等距形态。'
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('扭转壶体二维展开折痕未通过几何检查。')
    flange_display = None
    if params['flangeInset']:
        letter = 'r' if params['asymmetry'] == 1 else 'p'
        flange_display = {
            'fraction': params['flangeInset'],
            'vertexIndices': sorted({ids[letter, level, sector]
                                     for sector in range(params['sectors'])
                                     for level in range(3, len(params['crossSection']))}),
            'sourceLetter': letter,
            'displayOnly': True,
            'metricPreserving': False,
        }
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(coords), 'edges': len(edges), 'faces': len(faces),
            'tiles': params['sectors'], 'mountainEdges': assignments.count('M'),
            'valleyEdges': assignments.count('V'), 'boundaryEdges': assignments.count('B'),
            'unassignedEdges': assignments.count('U'),
            'elapsedMs': round((time.perf_counter()-started)*1000), 'parameters': params,
            'checks': {'geometry': geometry,
                       'local': {'status': 'not_applicable', 'kind': 'spatial-not-flat-foldable',
                                 'maximumError': max(distance_error, plane_error)},
                       'layerOrder': {'status': 'not_checked'}},
            'foldability': 'static-spatial-state', 'kind': 'twisted-pot',
        },
        'warnings': ['仅接纳通过逐面等距、共面和二维几何核验的 faceted 静态构形；'
                     '法兰内缩仅修饰三维显示，不改变真实等距坐标；连续折叠路径和自碰撞尚未核验。'],
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only',
            'algorithm': 'Origamica MakeTwistedPot faceted solver reconstruction',
            'version': 1, 'output': 'spatial-3d', 'spatialKind': 'origamica-twisted-pot',
            'foldedForm3D': spatial, 'maximumFaceDistanceError': distance_error,
            'maximumFacePlaneError': plane_error, 'staticGlobalIsometryChecked': True,
            'continuousRigidPathChecked': False, 'selfCollisionChecked': False,
            'goreTwistAnglesRad': twists[1:], 'goreEquationResiduals': gore_residuals,
            'flangeEquationResiduals': flange_residuals,
            **({'flatFlangeDisplay': flange_display} if flange_display else {}),
            'unsupportedOrigamicaOptions': ['PotFlatFlangesSmooth'],
        },
    }
