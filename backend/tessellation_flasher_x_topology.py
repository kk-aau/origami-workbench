"""Origamica In[4123]: saved X-diagonal first-sector reference topology.

This uses In[4116]'s ordered quads and In[4099]'s ideal CP seed positions.
It does not run MakeFlasher, solve CP/FF, assign M/V, or export FOLD.
"""

import math

from tessellation_flasher import flasher_default_cp_point, flasher_sector_quads


SAVED = {'rings': 3, 'heightOrder': 2, 'rotationalOrder': 5,
         'sector': 0, 'radialOrder': 6}
MAJOR_ROWS = (6, 4, 2)
MINOR_ROWS = (5, 3, 1)


def _area(points):
    return sum(a[0] * b[1] - b[0] * a[1]
               for a, b in zip(points, points[1:] + points[:1])) / 2


def saved_flasher_x_first_sector():
    """Return the 21 X diagonals, in In[4122]'s minor-then-major order."""
    r, h, m, k = (SAVED[key] for key in
                  ('rings', 'heightOrder', 'rotationalOrder', 'sector'))
    quads = flasher_sector_quads(r, h, m, k)
    major_count = (len(quads) + r) // 2
    minor_count = major_count - r
    if len(quads) != 21 or major_count != sum(MAJOR_ROWS) or minor_count != sum(MINOR_ROWS):
        raise ValueError('The source quad ordering differs from the saved X case.')
    diagonals = []
    for region, lengths, start in (('minor', MINOR_ROWS, major_count),
                                   ('major', MAJOR_ROWS, 0)):
        source_index = start
        for row, count in enumerate(lengths, 1):
            for column in range(1, count + 1):
                labels = quads[source_index]
                corners = [flasher_default_cp_point(*label, m) for label in labels]
                # In[4122] MapIndexed: Mod[col+(h-1)(row-1)+1,2]==0.
                pick_13 = (column + (h - 1) * (row - 1) + 1) % 2 == 0
                endpoints = (0, 2) if pick_13 else (1, 3)
                a, b = (corners[index] for index in endpoints)
                if not all(math.isfinite(value) for point in corners for value in point):
                    raise ValueError('Nonfinite ideal seed coordinate.')
                if math.dist(a, b) <= 1e-12:
                    raise ValueError('Degenerate saved X diagonal.')
                diagonals.append({
                    'region': region, 'row': row, 'column': column,
                    'sourceQuadIndex': source_index,
                    'diagonal': '13' if pick_13 else '24',
                    'quadLabels': [list(label) for label in labels],
                    'quadCoords': corners,
                    'endpointLabels': [list(labels[index]) for index in endpoints],
                    'endpointCoords': [a, b], 'quadSignedArea': _area(corners),
                })
                source_index += 1
    return {
        'kind': 'flasher-x-saved-first-sector-topology', 'savedInput': dict(SAVED),
        'sourceCells': ['In[4099]', 'In[4116]', 'In[4122]', 'In[4123]'],
        'regionOrder': ['minor', 'major'], 'majorRows': list(MAJOR_ROWS),
        'minorRows': list(MINOR_ROWS), 'diagonals': diagonals,
        'idealCPSeedOnly': True, 'solvedCreasePattern': False,
        'foldedForm': False, 'mountainValleyAssigned': False,
        'isometryVerified': False, 'layerOrderVerified': False,
        'exactStraightCreaseFOLD': False, 'adoptableCreasePattern': False,
    }
