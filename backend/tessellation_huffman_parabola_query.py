"""Bounded, read-only sample of Origamica In[4058]'s saved parabola inputs."""

import math

import numpy as np

from tessellation_huffman_parabola import (
    HALF_PI, SAVED_PARAMETERS_DEG, THIRD_RULING_OFFSET, saved_parabola_audit,
)


def validate_huffman_parabola_query(data):
    if not isinstance(data, dict) or data.get('family') != 'huffman-parabola-in4060':
        raise ValueError('Expected the saved Huffman confocal-parabola family.')
    if set(data) - {'family', 'divisions'}:
        raise ValueError('Huffman parabola query contains unsupported fields.')
    divisions = data.get('divisions', 25)
    if type(divisions) is not int or not 8 <= divisions <= 64:
        raise ValueError('divisions must be an integer in [8, 64].')
    return {'family': 'huffman-parabola-in4060', 'divisions': divisions}


def _points(frame, prefix):
    points = [frame[f'{prefix}{index}'].tolist() for index in range(4)]
    if not all(math.isfinite(value) for point in points for value in point):
        raise ValueError('Non-finite Huffman parabola sample point.')
    return points


def query_huffman_parabola(data):
    if isinstance(data,dict) and data.get('mode')=='direct-four-arguments':
        from tessellation_huffman_parabola_direct import query_parabola_direct
        return query_parabola_direct(data)
    query = validate_huffman_parabola_query(data)
    model = saved_parabola_audit()
    rows = []
    for item in model.paired_sample(query['divisions']):
        base = item['base']
        flat = _points(base, 'f')
        folded = _points(base, 'ff')
        mirror_flat = _points(item['flatMirror'], 'f')
        mirror_folded = _points(item['foldedMirror'], 'ff')
        q = base['q']
        if (abs(flat[2][0] + flat[2][1] ** 2 / 8 - 2) > 1e-9
                or abs(flat[3][0] - 2) > 1e-12
                or abs(flat[3][1] - flat[2][1]) > 1e-12
                or abs(flat[2][0] - 4 * math.cos(q) / (1 + math.cos(q))) > 1e-9):
            raise ValueError('Saved confocal parabola geometry did not verify.')
        flat_length = float(base['flatThirdRulingLength'])
        folded_length = float(base['foldedThirdRulingLength'])
        if (not math.isfinite(flat_length) or not math.isfinite(folded_length)
                or flat_length < -1e-10
                or abs(folded_length - flat_length - THIRD_RULING_OFFSET) > 1e-12
                or abs(np.linalg.norm(np.asarray(folded[3]) - folded[2]) - folded_length) > 1e-9):
            raise ValueError('Saved parabola third-ruling offset did not verify.')
        rows.append({
            't': float(base['t']),
            'anglesDeg': [math.degrees(float(base[key]))
                          for key in ('q', 'gamma1', 'gamma2')],
            'flat': flat, 'folded': folded,
            'flatMirror': mirror_flat, 'foldedMirror': mirror_folded,
            'flatThirdRulingLength': flat_length,
            'foldedThirdRulingLength': folded_length,
        })
    if (len(rows) != query['divisions'] + 1 or abs(rows[0]['t']) > 1e-12
            or abs(rows[-1]['t'] - HALF_PI) > 1e-12):
        raise ValueError('Huffman parabola sample range did not verify.')
    return {
        'family': 'origamica-huffman-confocal-parabola-pair',
        'query': query,
        'source': {
            'constructionCell': 'In[4058]', 'graphicsCell': 'In[4059]',
            'display2DCell': 'In[4062]', 'display3DCell': 'In[4069]',
            'savedExampleCell': 'In[4060]', 'savedParametersDeg': list(SAVED_PARAMETERS_DEG),
            'savedDivisions': 25,
            'samplingStatus': 'saved-input' if query['divisions'] == 25 else 'bounded-local-extension',
            'originalCompletionStatus': 'partially-worked-out',
            'machineReadableWolframOut': False,
        },
        'diagnostics': {
            'terminalParabolaParameterDeg': rows[-1]['anglesDeg'][0],
            'closureConditionsSaved': False,
            'thirdRulingLengthDifference': THIRD_RULING_OFFSET,
            'parabolaEquation': 'x + y^2/8 = 2',
        },
        'certification': {
            'thirdRulingOffset': THIRD_RULING_OFFSET,
            'completeBlockExactIsometry': False,
            'exactStraightCreaseFOLD': False,
            'adoptableCreasePattern': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        },
        'sample': {'rows': rows, 'pairedBlocks': 2},
    }
