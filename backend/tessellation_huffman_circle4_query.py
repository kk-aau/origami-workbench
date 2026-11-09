"""Bounded read-only view of Origamica In[4070]–In[4072].

The saved third spatial ruling has a literal 1e-6 length offset, so this
sample is deliberately never classified as an exact isometric FOLD model.
"""

import math

from tessellation_huffman_column import (
    SAVED_ROOT_GUESS_DEG, THIRD_RULING_OFFSET, solve_saved_circle4_closure,
)


def validate_huffman_circle4_query(data):
    if not isinstance(data, dict) or data.get('family') != 'huffman-circle4-in4072':
        raise ValueError('Expected the saved Huffman circle-four family.')
    if set(data) - {'family', 'divisions'}:
        raise ValueError('Huffman circle-four query contains unsupported fields.')
    divisions = data.get('divisions', 25)
    if type(divisions) is not int or not 8 <= divisions <= 64:
        raise ValueError('divisions must be an integer in [8, 64].')
    return {'family': 'huffman-circle4-in4072', 'divisions': divisions}


def _points(frame, prefix):
    return [frame[f'{prefix}{index}'].tolist() for index in range(4)]


def query_huffman_circle4(data):
    if isinstance(data, dict) and data.get('mode') == 'direct-four-arguments':
        from tessellation_huffman_circle4_direct import query_circle4_direct
        return query_circle4_direct(data)
    query = validate_huffman_circle4_query(data)
    model = solve_saved_circle4_closure()
    residuals = model.closure_residuals().tolist()
    if not all(math.isfinite(value) for value in residuals) or max(map(abs, residuals)) > 2e-6:
        raise ValueError('Saved Huffman closure did not verify.')
    rows = []
    for item in model.paired_sample(query['divisions']):
        base = item['base']
        flat = _points(base, 'f')
        folded = _points(base, 'ff')
        mirror_flat = _points(item['flatMirror'], 'f')
        mirror_folded = _points(item['foldedMirror'], 'ff')
        flat_length = float(base['flatThirdRulingLength'])
        folded_length = float(base['foldedThirdRulingLength'])
        if not math.isfinite(flat_length) or not math.isfinite(folded_length) or abs(
                folded_length - flat_length - THIRD_RULING_OFFSET) > 1e-12:
            raise ValueError('Huffman third-ruling offset did not verify.')
        rows.append({
            't': float(base['t']),
            'anglesDeg': [math.degrees(float(base[key])) for key in ('q', 'gamma1', 'gamma2')],
            'flat': flat, 'folded': folded,
            'flatMirror': mirror_flat, 'foldedMirror': mirror_folded,
            'flatThirdRulingLength': flat_length,
            'foldedThirdRulingLength': folded_length,
        })
    return {
        'family': 'origamica-huffman-circle4-pair',
        'query': query,
        'source': {
            'constructionCell': 'In[4070]', 'closureCell': 'In[4071]',
            'displayCell': 'In[4072]', 'savedDivisions': 25,
            'samplingStatus': 'saved-input' if query['divisions'] == 25 else 'bounded-local-extension',
            'machineReadableWolframOut': False,
        },
        'closure': {
            'savedInitialGuessDeg': list(SAVED_ROOT_GUESS_DEG),
            'localRootDeg': [math.degrees(float(value)) for value in vars(model.parameters).values()],
            'residuals': residuals, 'maximumAbsoluteResidual': max(map(abs, residuals)),
            'rootUniqueCertified': False,
        },
        'certification': {
            'thirdRulingOffset': THIRD_RULING_OFFSET,
            'firstTwoPatchesAnalyticIsometry': True,
            'completeBlockExactIsometry': False,
            'exactStraightCreaseFOLD': False,
            'adoptableCreasePattern': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        },
        'sample': {'rows': rows, 'pairedBlocks': 2},
    }
