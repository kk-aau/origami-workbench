"""Certified first band of the saved linked concentric folds, read-only.

The five-fold notebook example mixes common and per-curve parameters in its
later propagation.  Only its first ruled band has the source identities needed
for a strict local isometry certificate; this module never emits a FOLD graph.
"""

import math

import numpy as np
from scipy.integrate import solve_ivp
from tessellation_curved_linked_ndsolve_options import solve_linked_first3d_steps,validate_ndsolve_options


FAMILY = 'linked-concentric-first-band'
_GAMMA_HALF_TAN = math.sqrt(3.0)  # saved gamma_0 = 120 degrees


def validate_linked_first_band_query(data):
    if not isinstance(data, dict) or data.get('family') != FAMILY:
        raise ValueError('Expected the saved linked-concentric first band.')
    if data.get('variant')=='common-parameter':
        from tessellation_curved_linked_common_parameter_query import validate_linked_common_parameter_query
        return validate_linked_common_parameter_query(data)
    if data.get('variant')=='generic-common-parameter':
        from tessellation_curved_generic_linked_query import validate_generic_linked_query
        return validate_generic_linked_query(data)
    if set(data) - {'family', 'segments', 'variant', 'interpolationPoints', 'ndsolveOptions'}:
        raise ValueError('Linked first-band query contains unsupported fields.')
    variant = data.get('variant')
    if variant is not None and variant not in ('zero-chain', 'saved-chain'):
        raise ValueError('Unsupported linked-chain view.')
    if 'ndsolveOptions' in data and variant=='zero-chain':raise ValueError('零扰动解析子域没有实际First3D NDSolve阶段，不能附入步选项。')
    segments = data.get('segments', 32)
    if type(segments) is not int or not 8 <= segments <= 128:
        raise ValueError('segments must be an integer in [8, 128].')
    if 'interpolationPoints' in data:
        if variant != 'saved-chain':
            raise ValueError('Interpolation points only apply to the saved-chain numerical diagram.')
        points = data['interpolationPoints']
        if type(points) is not int or not 8 <= points <= 128:
            raise ValueError('interpolationPoints must be an integer in [8, 128].')
    return {'family': FAMILY, 'segments': segments,
            **({'variant': variant} if variant is not None else {}),
            **({'interpolationPoints': data['interpolationPoints']}
               if 'interpolationPoints' in data else {}),
            **({'ndsolveOptions':validate_ndsolve_options(data['ndsolveOptions'],math.pi)} if 'ndsolveOptions' in data else {})}


def _coefficients(s):
    delta = .1 * math.sin(2.0 * s)
    q_prime = 1.0 + .2 * math.cos(2.0 * s)
    a = 1.1 * math.sin(delta)
    b = 1.0 - 1.1 * math.cos(delta)
    # The b<0 bound is analytic on the entire saved interval, not sampled.
    tau = -_GAMMA_HALF_TAN * a / b
    return delta, q_prime, a, b, tau


def _frame_derivative(s, state):
    _, _, _, _, tau = _coefficients(s)
    tangent = state[3:6]
    left = state[6:9]
    normal = state[9:12]
    tangent_prime = left + _GAMMA_HALF_TAN * normal
    left_prime = -tangent + tau * normal
    normal_prime = -_GAMMA_HALF_TAN * tangent - tau * left
    return np.concatenate((tangent, tangent_prime, left_prime, normal_prime))


def query_linked_first_band(data):
    query = validate_linked_first_band_query(data)
    if query.get('variant')=='common-parameter':
        from tessellation_curved_linked_common_parameter_query import query_linked_common_parameter
        return query_linked_common_parameter(query)
    if query.get('variant')=='generic-common-parameter':
        from tessellation_curved_generic_linked_query import query_generic_linked
        return query_generic_linked(query)
    if query.get('variant') == 'zero-chain':
        from tessellation_curved_linked_zero_chain_query import query_linked_zero_chain
        return query_linked_zero_chain(query['segments'])
    if query.get('variant') == 'saved-chain':
        from tessellation_curved_p45_linked_chain_query import query_p45_linked_chain

        return query_p45_linked_chain(query['segments'],
                                     query.get('interpolationPoints'),query.get('ndsolveOptions'))
    initial = np.array((1., 0., 0., 0., 1., 0., -1., 0., 0., 0., 0., 1.))
    integration=None
    if 'ndsolveOptions' in query:solution,integration=solve_linked_first3d_steps(_frame_derivative,0.,math.pi,initial,query['ndsolveOptions'])
    else:solution = solve_ivp(_frame_derivative, (0., math.pi), initial,
                         method='DOP853', rtol=2e-12, atol=2e-14,
                         dense_output=True)
    if not solution.success or solution.sol is None:
        raise ValueError('The saved first-band frame did not integrate.')

    rows = []
    max_gram_error = 0.
    max_tangent_error = 0.
    for s in np.linspace(0., math.pi, query['segments'] + 1):
        s = float(s)
        frame = solution.sol(s)
        origin, tangent, left, normal = (frame[i:i + 3] for i in (0, 3, 6, 9))
        matrix = np.column_stack((tangent, left, normal))
        max_gram_error = max(max_gram_error, float(np.max(np.abs(matrix.T @ matrix - np.eye(3)))))
        delta, q_prime, a, b, tau = _coefficients(s)
        second = origin + a * tangent + b * left
        first_flat = (math.cos(s), math.sin(s))
        angle = s + delta
        second_flat = (1.1 * math.cos(angle), 1.1 * math.sin(angle))
        # F1' computed from the Darboux equations must match the saved planar
        # f1' coefficients in the same transported tangent/left frame.
        delta_prime = q_prime - 1.
        a_prime = 1.1 * math.cos(delta) * delta_prime
        b_prime = 1.1 * math.sin(delta) * delta_prime
        lifted_tangent = ((1. + a_prime - b) * tangent
                          + (a + b_prime) * left
                          + (a * _GAMMA_HALF_TAN + b * tau) * normal)
        target_tangent = 1.1 * q_prime * (math.cos(delta) * tangent
                                         + math.sin(delta) * left)
        max_tangent_error = max(max_tangent_error,
                                float(np.linalg.norm(lifted_tangent - target_tangent)))
        rows.append({'s': s, 'flatFirst': first_flat, 'flatSecond': second_flat,
                     'foldedFirst': origin.tolist(), 'foldedSecond': second.tolist()})

    if max_gram_error > 2e-7 or max_tangent_error > 2e-7:
        raise ValueError('First-band Darboux sample lost its source invariants.')
    result = {
        'family': FAMILY,
        'query': query,
        'source': {'notebookRows': [339070, 340310], 'savedNumericalOut': False,
                   'savedRadii': [1., 1.1], 'savedQ1Perturbation': .1,
                   'savedFirstFoldAngleDeg': 120.},
        'certification': {
            'firstBandAnalyticLocalIsometry': True,
            'firstBandRegularityMarginLowerBound': .088,
            'firstBandNumericalFrameGramMaxError': max_gram_error,
            'firstBandNumericalTangentMaxError': max_tangent_error,
            'wholeFiveFoldChainCertified': False,
            'exactStraightCreaseFOLD': False,
            'adoptableCreasePattern': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        },
        'sample': {'rows': rows},
    }
    if integration is not None:result['first3DIntegration']=integration
    return result
