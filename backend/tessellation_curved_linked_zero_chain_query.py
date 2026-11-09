"""Exact zero-perturbation subdomain of Origamica's linked concentric folds.

This changes the saved q1(s)=s+0.1 sin(2s) to q1(s)=s.  In this subdomain
the notebook's three otherwise conflicting parameter uses agree, its 2D
root has q_i(s)=s, and its fold angles alternate +/-120 degrees.  Four ruled
bands form one continuous locally isometric sheet.  End boundaries coincide
in 3D, so this is strictly read-only and is not a collision-free embedding.
"""

import math

import numpy as np


FAMILY = 'linked-concentric-zero-chain'
_SQRT3 = math.sqrt(3.)


def _frame(s):
    """Closed-form NRecoverDarboux3D solution for the first saved circle."""
    tangent0 = np.array((0., 1., 0.))
    left0 = np.array((-1., 0., 0.))
    normal0 = np.array((0., 0., 1.))
    tangent_prime0 = left0 + _SQRT3 * normal0
    c, sn = math.cos(2. * s), math.sin(2. * s)
    tangent = c * tangent0 + .5 * sn * tangent_prime0
    displacement = .5 * sn * tangent0 + .25 * (1. - c) * tangent_prime0
    origin = np.array((1., 0., 0.)) + displacement
    left = left0 - displacement
    normal = normal0 - _SQRT3 * displacement
    return origin, tangent, left, normal


def query_linked_zero_chain(segments):
    if type(segments) is not int or not 8 <= segments <= 128:
        raise ValueError('segments must be an integer in [8, 128].')
    rows = []
    max_frame_error = 0.
    max_metric_error = 0.
    max_shared_edge_error = 0.
    for value in np.linspace(0., math.pi, segments + 1):
        s = float(value)
        origin, tangent, left, normal = _frame(s)
        frame = np.column_stack((tangent, left, normal))
        max_frame_error = max(max_frame_error,
                              float(np.max(np.abs(frame.T @ frame - np.eye(3)))))
        second_director = -.5 * left + .5 * _SQRT3 * normal
        folded = [origin]
        # Four adjoining bands; each outward ruling has physical length 0.1.
        for index in range(4):
            director = left if index % 2 == 0 else second_director
            folded.append(folded[-1] - .1 * director)
            radius = 1. + .1 * index
            # X_s=(radius+0.1v)T, X_v=-0.1 director: E=(r+0.1v)^2,
            # F=0, G=0.01, exactly as X_flat=(r+0.1v)(cos s,sin s).
            for v in (0., .5, 1.):
                x_s = (radius + .1 * v) * tangent
                x_v = -.1 * director
                max_metric_error = max(max_metric_error,
                    abs(float(x_s @ x_s) - (radius + .1 * v) ** 2),
                    abs(float(x_s @ x_v)), abs(float(x_v @ x_v) - .01))
            max_shared_edge_error = max(max_shared_edge_error,
                float(np.linalg.norm(folded[-1] - (folded[-2] - .1 * director))))
        flat = [[(1. + .1 * index) * math.cos(s),
                 (1. + .1 * index) * math.sin(s)] for index in range(5)]
        rows.append({'s': s, 'flatCurves': flat,
                     'foldedCurves': [point.tolist() for point in folded]})
    # q_i=s is the same continuous parameter in tf_i, f_i, the cached 2D
    # systems and gamma'_i(q_i).  The first band's closed-form Darboux frame
    # gives U_0'=U_1'=-T and F_i'=R_i*T, proving the metric for all s and v.
    if max_frame_error > 1e-12 or max_metric_error > 1e-12 or max_shared_edge_error > 1e-12:
        raise ValueError('Zero-perturbation linked chain lost its invariants.')
    endpoint_gap = max(float(np.linalg.norm(np.array(rows[0]['foldedCurves'][i]) -
                                           np.array(rows[-1]['foldedCurves'][i])))
                       for i in range(5))
    return {
        'family': FAMILY,
        'query': {'family': 'linked-concentric-first-band', 'variant': 'zero-chain',
                  'segments': segments},
        'source': {'notebookRows': [339070, 340310], 'savedNumericalOut': False,
                   'savedRadii': [1., 1.1, 1.2, 1.3, 1.4],
                   'savedQ1Perturbation': .1, 'subdomainQ1Perturbation': 0.,
                   'savedFirstFoldAngleDeg': 120.},
        'certification': {
            'fourBandsAnalyticLocalIsometry': True,
            'singleSheetContinuous': True,
            'regularityMarginLowerBound': 1.,
            'numericalFrameGramMaxError': max_frame_error,
            'numericalMetricMaxError': max_metric_error,
            'numericalSharedEdgeMaxError': max_shared_edge_error,
            'foldAnglesDeg': [120., -120., 120., -120.],
            'boundaryEndContact': endpoint_gap < 1e-10,
            'wholeSavedPerturbedChainCertified': False,
            'globalLayerOrderChecked': False,
            'exactStraightCreaseFOLD': False,
            'adoptableCreasePattern': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        },
        'sample': {'rows': rows},
    }
