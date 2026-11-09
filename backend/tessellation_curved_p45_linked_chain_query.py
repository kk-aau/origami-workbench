"""Read-only finite rendering of Origamica In[4086]'s perturbed five circles.

This follows the saved Next2D and Next3D expressions, including their cached
uncomposed circle frames and gamma'(q_i(s)) parameter use.  SciPy quartic
splines approximate Mathematica ListInterpolation; no Wolfram output was saved.
The resulting later bands fail intrinsic isometry, so this is only a diagram.
"""

import math
from functools import lru_cache

import numpy as np
from scipy.integrate import solve_ivp
from tessellation_curved_linked_ndsolve_options import solve_linked_first3d_steps
from scipy.interpolate import make_interp_spline
from scipy.optimize import brentq

from tessellation_curved_linked_first_band_query import _frame_derivative


FAMILY = 'linked-concentric-saved-chain'
_RADII = tuple(1. + .1 * i for i in range(5))
_SOURCE_INTERVALS = 32


def _saved_q1(s):
    return s + .1 * np.sin(2. * s)


def _saved_q1_prime(s):
    return 1. + .2 * np.cos(2. * s)


def _propagate(intervals):
    """Three Next2D calls on the central root branch of each circular pair."""
    nodes = np.linspace(0., math.pi, intervals + 1)
    q = [lambda s: s, _saved_q1]
    qp = [lambda s: np.ones_like(s), _saved_q1_prime]
    gamma = [lambda s: np.full_like(s, 2. * math.pi / 3.)]
    max_residual = 0.
    for index in range(3):
        r0, r1, r2 = _RADII[index:index + 3]
        angle0, angle1 = q[index](nodes), q[index + 1](nodes)
        delta = angle1 - angle0
        denominator = r1 * np.cos(delta) - r0
        if np.min(np.abs(denominator)) < .04:
            raise ValueError('Saved-chain fold-angle denominator approaches zero.')
        ratio = (r1 - r0 * np.cos(delta)) / denominator
        # Mathematica ArcTan[x,y] is atan2(y,x); preserve its angle branch.
        values = -2. * np.arctan2(ratio * np.tan(gamma[index](nodes) / 2.),
                                  qp[index](nodes) / qp[index + 1](nodes))
        if not np.all(np.isfinite(values)) or np.max(np.abs(np.diff(values))) > .5:
            raise ValueError('Saved-chain fold-angle branch is discontinuous.')
        next_gamma = make_interp_spline(nodes, values, k=4)
        gamma.append(next_gamma)
        gamma_prime = next_gamma.derivative()
        roots = []
        pole = math.acos(r1 / r2)
        for s in nodes:
            old_angle = float(q[index](s))
            angle = float(q[index + 1](s))
            delta = angle - old_angle
            previous_ratio = -r0 * math.sin(delta) / (r1 - r0 * math.cos(delta))
            target = (float(gamma_prime(q[index + 1](s))) /
                      float(qp[index + 1](s) * math.tan(next_gamma(s) / 2.))
                      - previous_ratio)

            def residual(theta):
                return r2 * math.sin(theta) / (r1 - r2 * math.cos(theta)) - target

            # The pole-free interval around q_{i+1}(s) contains one root.
            theta = brentq(residual, -pole + 1e-8, pole - 1e-8,
                           xtol=2e-14, rtol=9e-16)
            max_residual = max(max_residual, abs(residual(theta)))
            roots.append(angle + theta)
        q_next = make_interp_spline(nodes, np.asarray(roots), k=4)
        q.append(q_next)
        qp.append(q_next.derivative())
    dense = np.linspace(0., math.pi, 1001)
    if min(float(np.min(derivative(dense))) for derivative in qp[2:]) < .2:
        raise ValueError('Saved-chain parameterization lost monotonicity.')
    if max_residual > 1e-8:
        raise ValueError('Saved-chain root residual is too large.')
    return q, gamma, max_residual


@lru_cache(maxsize=1)
def _endpoint_sensitivity():
    return [[float(other_q[4](0.)), float(other_q[4](math.pi))]
            for count in (16, 32, 64)
            for other_q, _, _ in (_propagate(count),)]


@lru_cache(maxsize=12)
def _solution(interpolation_points):
    q, gamma, residual = _propagate(interpolation_points)
    initial = np.array((1., 0., 0., 0., 1., 0., -1., 0., 0., 0., 0., 1.))
    frame = solve_ivp(_frame_derivative, (0., math.pi), initial,
                      method='DOP853', rtol=2e-12, atol=2e-14,
                      dense_output=True)
    if not frame.success or frame.sol is None:
        raise ValueError('Saved-chain first Darboux frame did not integrate.')
    return q, gamma, residual, frame.sol


def query_p45_linked_chain(segments=32, interpolation_points=None, ndsolve_options=None):
    if type(segments) is not int or not 8 <= segments <= 128:
        raise ValueError('Saved-chain sample segments must be an integer in [8, 128].')
    explicit_points = interpolation_points is not None
    if interpolation_points is None:
        interpolation_points = _SOURCE_INTERVALS
    if type(interpolation_points) is not int or not 8 <= interpolation_points <= 128:
        raise ValueError('Saved-chain interpolation points must be an integer in [8, 128].')
    integration=None
    if ndsolve_options is None:q,gamma,root_residual,frame=_solution(interpolation_points)
    else:
        q,gamma,root_residual=_propagate(interpolation_points)
        initial=np.array((1.,0.,0.,0.,1.,0.,-1.,0.,0.,0.,0.,1.))
        solution,integration=solve_linked_first3d_steps(_frame_derivative,0.,math.pi,initial,ndsolve_options)
        frame=solution.sol
    endpoint_sensitivity = _endpoint_sensitivity()
    rows = []
    max_first_band_gap = 0.
    for value in np.linspace(0., math.pi, segments + 1):
        s = float(value)
        state = frame(s)
        origin, tangent, left = (state[i:i + 3] for i in (0, 3, 6))
        cached_t = np.array((-math.sin(s), math.cos(s)))
        cached_l = np.array((-math.cos(s), -math.sin(s)))
        angles = [float(fn(s)) for fn in q]
        flat = [np.array((radius * math.cos(angle), radius * math.sin(angle)))
                for radius, angle in zip(_RADII, angles)]
        folded = [origin]
        director = left
        for index in range(1, 5):
            difference = flat[index] - flat[index - 1]
            a, b = float(difference @ cached_t), float(difference @ cached_l)
            folded.append(folded[-1] + a * tangent + b * director)
            if index < 4:
                angle = float(gamma[index](s))
                director = (math.cos(angle) * director -
                            math.sin(angle) * np.cross(tangent, director))
        first_direct = origin + (1.1 * math.sin(angles[1] - s)) * tangent + \
            (1. - 1.1 * math.cos(angles[1] - s)) * left
        max_first_band_gap = max(max_first_band_gap,
                                 float(np.linalg.norm(folded[1] - first_direct)))
        rows.append({'s': s, 'qValues': angles,
                     'foldAnglesDeg': [math.degrees(float(fn(s))) for fn in gamma[1:]],
                     'flatCurves': [point.tolist() for point in flat],
                     'foldedCurves': [point.tolist() for point in folded]})
    if max_first_band_gap > 1e-8 or not all(
            math.isfinite(value) for row in rows for point in row['foldedCurves']
            for value in point):
        raise ValueError('Saved-chain sampled spatial curves are inconsistent.')
    result = {
        'family': FAMILY,
        'query': {'family': 'linked-concentric-first-band',
                  'variant': 'saved-chain', 'segments': segments,
                  **({'interpolationPoints': interpolation_points}
                     if explicit_points else {}),
                  **({'ndsolveOptions':dict(ndsolve_options)} if ndsolve_options is not None else {})},
        'source': {'notebookRows': [339070, 340310], 'savedNumericalOut': False,
                   'savedRadii': list(_RADII), 'savedQ1Perturbation': .1,
                   'savedFirstFoldAngleDeg': 120.,
                   'interpolationIntervals': interpolation_points,
                   'interpolationMethod': 'local-scipy-quartic-not-wolfram-output'},
        'diagnostics': {'maxNodeRootResidual': root_residual,
                        'maxFirstBandJoinError': max_first_band_gap,
                        'q4EndpointByIntervals16_32_64': endpoint_sensitivity,
                        'q4EndpointExtrapolation': max(0., -float(q[4](0.)),
                                                       float(q[4](math.pi)) - math.pi),
                        'cachedTangentErrorAtPiOver4Rad': .1,
                        'secondBandGeodesicMismatchAtZero': 396. / 665.},
        'certification': {'finiteFormulaVisualizationOnly': True,
                          'wolframNumericalOutputReproduced': False,
                          'wholeSavedPerturbedChainCertified': False,
                          'secondBandIsometric': False,
                          'exactStraightCreaseFOLD': False,
                          'adoptableCreasePattern': False,
                          'selfCollisionChecked': False},
        'sample': {'rows': rows},
    }
    if integration is not None:result['first3DIntegration']=integration
    return result
