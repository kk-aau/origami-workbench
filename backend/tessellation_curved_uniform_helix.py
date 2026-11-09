"""The analytic uniform-helix curved fold from Origamica section 45.

This is a standalone smooth-surface and sampled-mesh constructor.  The
notebook's CurvedFoldUniformHelix2D/3D return a crease, two unit rulings,
and a constant fold angle; they do not return a straight-crease FOLD graph.
The mesh here samples those same ruled surfaces and keeps one shared crease.
"""

import math


FAMILY = 'uniform-helix-curved-fold'


def _finite_number(value, name):
    if (isinstance(value, bool) or not isinstance(value, (int, float)) or
            not math.isfinite(value)):
        raise ValueError(f'{name} must be a finite number.')
    return float(value)


def validate_uniform_helix_curved_fold(data):
    """Validate the regular, non-focal domain of the notebook's example family."""
    allowed = {'family', 'radius', 'helicityAngleDeg', 'foldAngleDeg',
               'parameterStart', 'parameterEnd', 'rulingLength',
               'curveSegments', 'rulingSegments'}
    if (not isinstance(data, dict) or data.get('family') != FAMILY or
            set(data) - allowed):
        raise ValueError('Unsupported uniform helix curved-fold request.')
    radius = _finite_number(data.get('radius', 1), 'radius')
    theta_deg = _finite_number(data.get('helicityAngleDeg', 30),
                               'helicityAngleDeg')
    gamma_deg = _finite_number(data.get('foldAngleDeg', 90),
                               'foldAngleDeg')
    if radius <= 0 or not -90 < theta_deg < 90 or not 0 < gamma_deg < 180:
        raise ValueError('A positive radius, |helicity|<90° and 0<fold angle<180° are required.')
    u0 = _finite_number(data.get('parameterStart', 0), 'parameterStart')
    u1 = _finite_number(data.get('parameterEnd', math.pi), 'parameterEnd')
    if not 1e-6 < u1 - u0 <= 2 * math.pi:
        raise ValueError('The parameter interval must be positive and at most 2π.')
    width = _finite_number(data.get('rulingLength', 1), 'rulingLength')
    if width <= 0:
        raise ValueError('rulingLength must be positive.')
    curve_segments = data.get('curveSegments', 96)
    ruling_segments = data.get('rulingSegments', 4)
    if type(curve_segments) is not int or not 8 <= curve_segments <= 1024:
        raise ValueError('curveSegments must be an integer in [8, 1024].')
    if type(ruling_segments) is not int or not 1 <= ruling_segments <= 32:
        raise ValueError('rulingSegments must be an integer in [1, 32].')
    if (curve_segments + 1) * (2 * ruling_segments + 1) > 60000:
        raise ValueError('The curved-fold mesh exceeds 60000 vertices.')

    theta, gamma = math.radians(theta_deg), math.radians(gamma_deg)
    c, s = math.cos(theta), math.sin(theta)
    cg2, sg2 = math.cos(gamma / 2), math.sin(gamma / 2)
    h = math.sqrt(1 - (c * cg2) ** 2)
    if h <= 0:
        raise ValueError('The ruling formula is singular for these angles.')
    radius_2d = radius / (cg2 * c * c)
    focal_distance = radius_2d * c * sg2 / h
    if not math.isfinite(radius_2d) or not math.isfinite(focal_distance):
        raise ValueError('The unfolded surface exceeds floating-point range.')
    if width >= focal_distance * (1 - 1e-8):
        raise ValueError('rulingLength reaches the cusp of the ruled surface.')
    return {'family': FAMILY, 'radius': radius,
            'helicityAngleDeg': theta_deg, 'foldAngleDeg': gamma_deg,
            'parameterStart': u0, 'parameterEnd': u1,
            'rulingLength': width, 'curveSegments': curve_segments,
            'rulingSegments': ruling_segments,
            'unfoldedCreaseRadius': radius_2d,
            'rulingFocalDistance': focal_distance}


def uniform_helix_curved_fold_frame(radius, theta, gamma, u):
    """Return the exact 2D/3D crease and unit ruling vectors at parameter u.

    Angles are radians.  This is the simplified form of the four functions
    in notebook In[3945] and In[3951]; the 2D crease retains the notebook's
    x=1 origin at u=0 even when radius differs from one.
    """
    if any(not math.isfinite(x) for x in (radius, theta, gamma, u)):
        raise ValueError('Frame parameters must be finite.')
    if radius <= 0 or not -math.pi / 2 < theta < math.pi / 2 or not 0 < gamma < math.pi:
        raise ValueError('Degenerate uniform-helix curved fold.')
    c, s = math.cos(theta), math.sin(theta)
    cg2, sg2 = math.cos(gamma / 2), math.sin(gamma / 2)
    h = math.sqrt(1 - (c * cg2) ** 2)
    if h <= 0:
        raise ValueError('Degenerate uniform-helix curved fold.')
    k = c * cg2
    radius_2d = radius / (cg2 * c * c)
    angle = k * u
    ca, sa = math.cos(angle), math.sin(angle)
    cu, su = math.cos(u), math.sin(u)
    a2, b2 = c * sg2 / h, s / h
    a3 = c * math.sin(gamma) / (2 * h)
    b3 = c * (1 + math.cos(gamma)) * s / (2 * h)
    return {
        'flatCrease': [1 - 2 * radius_2d * math.sin(angle / 2) ** 2,
                       radius_2d * sa],
        'foldedCrease': [radius * cu, radius * su,
                         radius * math.tan(theta) * u],
        'flatLeftRuling': [-a2 * ca - b2 * sa, -a2 * sa + b2 * ca],
        'flatRightRuling': [a2 * ca - b2 * sa, a2 * sa + b2 * ca],
        'foldedLeftRuling': [-a3 * cu - b3 * su,
                            -a3 * su + b3 * cu, h],
        'foldedRightRuling': [a3 * cu - b3 * su,
                             a3 * su + b3 * cu, h],
        'foldAngleRad': gamma,
    }


def uniform_helix_curved_fold_geometry(data):
    """Sample paired ruled surfaces with identical (u, ruling distance) grids.

    The smooth surfaces are isometric.  Their straight triangle chords are
    approximations; callers should not treat this mesh as an exact FOLD CP.
    """
    params = validate_uniform_helix_curved_fold(data)
    radius = params['radius']
    theta = math.radians(params['helicityAngleDeg'])
    gamma = math.radians(params['foldAngleDeg'])
    u0, u1 = params['parameterStart'], params['parameterEnd']
    width = params['rulingLength']
    n, m = params['curveSegments'], params['rulingSegments']
    frames = [uniform_helix_curved_fold_frame(
        radius, theta, gamma, u0 + (u1 - u0) * i / n)
        for i in range(n + 1)]

    flat = [frame['flatCrease'] for frame in frames]
    folded = [frame['foldedCrease'] for frame in frames]
    crease_indices = list(range(n + 1))
    boundaries = {}
    rows = {}
    for side in ('left', 'right'):
        side_rows = [crease_indices]
        for j in range(1, m + 1):
            v = width * j / m
            indices = []
            for frame in frames:
                indices.append(len(flat))
                flat.append([x + v * d for x, d in zip(
                    frame['flatCrease'], frame[f'flat{side.title()}Ruling'])])
                folded.append([x + v * d for x, d in zip(
                    frame['foldedCrease'], frame[f'folded{side.title()}Ruling'])])
            side_rows.append(indices)
        rows[side] = side_rows
        boundaries[side] = side_rows[-1]

    faces, face_sides = [], []
    for side in ('left', 'right'):
        for j in range(m):
            inner, outer = rows[side][j:j + 2]
            for i in range(n):
                a, b, c, d = inner[i], inner[i + 1], outer[i + 1], outer[i]
                triangles = ([a, b, c], [a, c, d]) if side == 'left' else (
                    [a, c, b], [a, d, c])
                faces.extend(triangles)
                face_sides.extend((side, side))

    return {'family': FAMILY, 'parameters': params,
            'flatVertices': flat, 'foldedVertices': folded,
            'faces': faces, 'faceSides': face_sides,
            'creaseVertexIndices': crease_indices,
            'boundaryVertexIndices': boundaries}
