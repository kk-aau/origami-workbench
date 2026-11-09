"""Origamica's LFFReduce/LFFReduction for one even-degree conical vertex.

This is a local BLB crimp sequence, not a layer order or a folded surface.
The original notebook uses exact equality for Kawasaki-Justin; numeric input
uses a scale-relative tolerance and refuses near-tied local minima.
"""

from __future__ import annotations

import math


def reduce_lff_vertex(sector_angles, labels=None):
    """Return the original first-strict-local-minimum reduction sequence.

    ``sector_angles[i]`` is the counterclockwise angle after crease ``i``.
    Angles can be in any consistent unit, as in the notebook's definition.
    """
    if not isinstance(sector_angles, list) or not 2 <= len(sector_angles) <= 32:
        raise ValueError('高阶局部归约需要 2–32 个扇区角。')
    if len(sector_angles) % 2:
        raise ValueError('LFF 归约要求偶数度顶点。')
    if any(isinstance(angle, bool) or not isinstance(angle, (int, float)) or
           not math.isfinite(angle) or angle <= 0 or angle > 1_000_000
           for angle in sector_angles):
        raise ValueError('扇区角须为正的有限数字。')
    if labels is None:
        labels = [str(i + 1) for i in range(len(sector_angles))]
    if (not isinstance(labels, list) or len(labels) != len(sector_angles) or
        any(not isinstance(label, str) or not label or len(label) > 24
            for label in labels) or len(set(labels)) != len(labels)):
        raise ValueError('每条折线须有唯一的非空标签。')

    angles = [float(angle) for angle in sector_angles]
    alternating = [sum(angles[::2]), sum(angles[1::2])]
    tolerance = max(1., sum(angles)) * 1e-9
    if abs(alternating[0] - alternating[1]) > tolerance:
        raise ValueError('扇区角不满足 Kawasaki–Justin 交替和条件。')

    sectors = [[label, angle] for label, angle in zip(labels, angles)]
    steps = [{'crimped': [], 'remaining': [item.copy() for item in sectors]}]
    while sectors:
        count = len(sectors)
        if count == 2:
            steps.append({'crimped': [sectors[0][0], sectors[1][0]],
                          'remaining': []})
            sectors = []
            break
        # Notebook In[2049]: scan from crease 1 and take the first *strict*
        # local minimum. A tied adjacent sector is not a reducible BLB sector.
        index = next((i for i in range(count)
                      if sectors[i][1] < sectors[(i - 1) % count][1] - tolerance and
                      sectors[i][1] < sectors[(i + 1) % count][1] - tolerance), None)
        if index is None:
            break
        previous, following = (index - 1) % count, (index + 1) % count
        pair = [sectors[index][0], sectors[following][0]]
        updated = [item.copy() for item in sectors]
        updated[previous][1] = (sectors[previous][1] - sectors[index][1] +
                                sectors[following][1])
        for removed in sorted((index, following), reverse=True):
            updated.pop(removed)
        sectors = updated
        steps.append({'crimped': pair, 'remaining': [item.copy() for item in sectors]})

    return {
        'kind': 'local-high-order-lff-reduction',
        'steps': steps,
        'crimpPairs': [step['crimped'] for step in steps[1:]],
        'remaining': [item.copy() for item in sectors],
        'fullyReduced': not sectors,
        'stopReason': 'fully_reduced' if not sectors else 'no_strict_local_minimum',
        'alternatingSums': alternating,
        'numericTolerance': tolerance,
        'globalFoldabilityChecked': False,
        'selfCollisionChecked': False,
    }


def lff_reduction_query(data):
    if (not isinstance(data, dict) or
            set(data) - {'operation', 'sectorAnglesDeg', 'labels'} or
            data.get('operation', 'lff-reduction') != 'lff-reduction'):
        raise ValueError('LFF 归约只接受扇区角与可选折线标签。')
    return reduce_lff_vertex(data.get('sectorAnglesDeg'), data.get('labels'))
