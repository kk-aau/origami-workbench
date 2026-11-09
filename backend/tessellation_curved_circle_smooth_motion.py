"""Exact finite smooth-paper isometry ending at Origamica In[3992].

This is a continuous smooth bending motion, not a rigid path for the separate
polyhedral FOLD companion to In[3992]/In[3995].
"""
import math

TARGET_ANGLE = 2*math.pi/3
DEFAULT = {'arcEnd': math.pi, 'leftWidth': 1., 'rightWidth': 1.}


def validate(parameters=None):
    p = dict(DEFAULT if parameters is None else parameters)
    if set(p) != set(DEFAULT):
        raise ValueError('Motion parameters must be arcEnd, leftWidth, rightWidth.')
    for key, low, high in (('arcEnd', math.pi/8, math.pi),
                           ('leftWidth', .1, 1.5), ('rightWidth', .1, 2.)):
        x = p[key]
        if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x):
            raise ValueError(f'{key} must be finite.')
        if not low <= x <= high:
            raise ValueError(f'{key} outside proved interval.')
        p[key] = float(x)
    return p


def _check(progress, s, w, parameters):
    p = validate(parameters)
    if isinstance(progress, bool) or not math.isfinite(progress) or not 0 <= progress <= 1:
        raise ValueError('Progress outside [0,1].')
    if isinstance(s, bool) or not math.isfinite(s) or not 0 <= s <= p['arcEnd']:
        raise ValueError('Arc coordinate outside finite paper.')
    if isinstance(w, bool) or not math.isfinite(w) or not -p['leftWidth'] <= w <= p['rightWidth']:
        raise ValueError('Width coordinate outside finite paper.')
    return p


def _half_angle_trig(progress):
    # The saved endpoint is algebraic. Avoid cos(π/3) roundoff being amplified
    # by the angular division when comparing it with the notebook formula.
    if progress == 1:
        return .5, math.sqrt(3)/2
    half = TARGET_ANGLE*progress/2
    return math.cos(half), math.sin(half)


def paper_point(s, w, parameters=None):
    _check(0, s, w, parameters)
    r, phi = 2+w, s/2
    return (r*math.cos(phi), r*math.sin(phi))


def motion_envelope(parameters=None):
    """Conservative enclosing cylinder for the complete motion, not one frame."""
    p = validate(parameters)
    return {'radialRadius': 2+p['rightWidth'], 'minimumHeight': 0.,
            'maximumHeight': math.sqrt(3)/2*max(p['leftWidth'],
                                                       p['rightWidth'])}


def motion_point(progress, s, w, parameters=None):
    _check(progress, s, w, parameters)
    c, h = _half_angle_trig(progress)
    phi, r = s/(2*c), c*(2+w)
    return (r*math.cos(phi), r*math.sin(phi), h*abs(w))


def inverse_motion_point(progress, point, parameters=None):
    """Analytic material inverse valid at every frame, including flat λ=0.

    Positive projected radius recovers w; the less-than-one-turn interval
    recovers s. Checking height avoids division by sin(γ/2) at the flat frame.
    """
    p = validate(parameters)
    _check(progress, 0, 0, p)
    if (not isinstance(point, (tuple, list)) or len(point) != 3
            or any(isinstance(x, bool) or not isinstance(x, (int, float))
                   or not math.isfinite(x) for x in point)):
        raise ValueError('Spatial point must have three finite coordinates.')
    x, y, z = point
    c, h = _half_angle_trig(progress)
    r = math.hypot(x, y)
    tolerance = 2e-10*max(1, r, abs(z))
    if r <= 0:
        raise ValueError('Point outside regular paper domain.')
    phi = math.atan2(y, x)
    if phi < 0 and abs(phi) < tolerance:
        phi = 0.
    elif phi < 0:
        phi += 2*math.pi
    s, w = 2*c*phi, r/c-2
    if (s < -tolerance or s > p['arcEnd']+tolerance
            or w < -p['leftWidth']-tolerance
            or w > p['rightWidth']+tolerance
            or abs(z-h*abs(w)) > tolerance):
        raise ValueError('Point not on current finite paper surface.')
    return {'s': max(0., min(p['arcEnd'], s)),
            'w': max(-p['leftWidth'], min(p['rightWidth'], w))}


def partials(progress, s, w, side, parameters=None):
    _check(progress, s, w, parameters)
    if side not in (-1, 1) or (w != 0 and (1 if w > 0 else -1) != side):
        raise ValueError('Invalid one-sided derivative.')
    c, h = _half_angle_trig(progress)
    phi, q = s/(2*c), (2+w)/2
    return {'ds': (-q*math.sin(phi), q*math.cos(phi), 0),
            'dw': (c*math.cos(phi), c*math.sin(phi), side*h)}


def first_fundamental_form(w):
    if not math.isfinite(w) or not -1.5 <= w <= 2:
        raise ValueError('Width outside bounded paper range.')
    return {'E': (1+w/2)**2, 'F': 0, 'G': 1,
            'jacobian': 1+w/2}


def crease_frame(progress, s, parameters=None):
    _check(progress, s, 0, parameters)
    c, h = _half_angle_trig(progress)
    phi = s/(2*c)
    er = (math.cos(phi), math.sin(phi), 0)
    return {'point': motion_point(progress, s, 0, parameters),
            'tangent': (-math.sin(phi), math.cos(phi), 0),
            'leftRuling': (-c*er[0], -c*er[1], h),
            'rightRuling': (c*er[0], c*er[1], h),
            'leftNormal': (-h*er[0], -h*er[1], -c),
            'rightNormal': (h*er[0], h*er[1], -c)}


def certify(parameters=None):
    p = validate(parameters)
    cmin = .5
    radial = cmin*(2-p['leftWidth'])
    jacobian = 1-p['leftWidth']/2
    sweep = p['arcEnd']/(2*cmin)
    if radial <= 0 or jacobian <= 0 or sweep >= 2*math.pi:
        raise ValueError('Outside global injectivity proof domain.')
    return {'savedCell': 'In[3992]', 'numericCell': 'In[3995]',
            'targetGammaDeg': 120, 'sourceCreaseArc': (0, math.pi),
            'finiteTrim': p, 'minimumRadialRadius': radial,
            'minimumJacobian': jacobian, 'maximumAzimuthSweep': sweep,
            'minimumProjectedJacobian': cmin*jacobian,
            'metricIndependentOfProgress': True, 'focusFree': True,
            'globalInjectiveEveryFrame': True,
            'selfCollisionFreeEveryFrame': True,
            'smoothContinuousMotion': True,
            'exactOriginalTargetAtProgressOne': True,
            'completeClosedMaterialDomain': True, 'includesFlatFrame': True,
            'analyticMaterialInverse': True, 'paperThickness': 0,
            'polyhedralRigidPathChecked': False, 'exactStraightCreaseFOLD': False,
            'wolframNumericOutAvailable': False}


def saved_endpoint_residual(parameters=None):
    p = validate(parameters)
    maximum = 0.
    for i in range(9):
        s = p['arcEnd']*i/8
        er = (math.cos(s), math.sin(s))
        for w in (-p['leftWidth'], 0, p['rightWidth']):
            source = ((1+w/2)*er[0], (1+w/2)*er[1],
                      math.sqrt(3)/2*abs(w))
            maximum = max(maximum, math.dist(motion_point(1, s, w, p), source))
    return {'maximum': maximum,
            'comparison': 'In[3992] explicit F/rL and source-derived rR, not Wolfram numeric Out'}
