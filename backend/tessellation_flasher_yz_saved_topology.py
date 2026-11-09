"""In[4125]/In[4127] fixed first-sector Y/Z diagonal reference drawings.

The 2D coordinates are In[4099]'s ideal CP initial guess. These records do
not expose a solved CP/FF, M/V assignment, or an adoptable FOLD graph.
"""

import math

from tessellation_flasher import flasher_default_cp_point, flasher_sector_quads


SAVED = {'rings': 3, 'heightOrder': 2, 'rotationalOrder': 5,
         'sector': 0, 'radialOrder': 6}


def saved_flasher_yz_first_sector(variant):
    """Return In[4124]/In[4126] lines in In[4116]'s major-then-minor order."""
    if variant not in ('Y', 'Z'):
        raise ValueError('Only saved Y and Z first-sector diagonals are supported.')
    quads = flasher_sector_quads(3, 2, 5, 0)
    if len(quads) != 21:
        raise ValueError('The saved Y/Z case requires 21 ordered source quads.')
    positions = (0, 2) if variant == 'Y' else (1, 3)
    diagonals = []
    for source_index, quad in enumerate(quads):
        corners = [flasher_default_cp_point(*label, 5) for label in quad]
        a, b = (corners[index] for index in positions)
        if not all(math.isfinite(value) for point in corners for value in point):
            raise ValueError('Nonfinite ideal seed coordinate.')
        if math.dist(a, b) <= 1e-12:
            raise ValueError('Degenerate saved Y/Z diagonal.')
        region = 'major' if source_index < 12 else 'minor'
        region_index = source_index if region == 'major' else source_index - 12
        row_lengths = (6, 4, 2) if region == 'major' else (5, 3, 1)
        row = 1
        while region_index >= row_lengths[row - 1]:
            region_index -= row_lengths[row - 1]
            row += 1
        diagonals.append({
            'region': region, 'row': row, 'column': region_index + 1,
            'sourceQuadIndex': source_index,
            'diagonal': '13' if variant == 'Y' else '24',
            'quadLabels': [list(label) for label in quad],
            'quadCoords': corners,
            'endpointLabels': [list(quad[index]) for index in positions],
            'endpointCoords': [a, b],
        })
    return {
        'kind': 'flasher-yz-saved-first-sector-topology',
        'variant': variant, 'savedInput': dict(SAVED),
        'sourceCells': ['In[4099]', 'In[4116]',
                        'In[4124]', 'In[4125]'] if variant == 'Y' else
                       ['In[4099]', 'In[4116]', 'In[4126]', 'In[4127]'],
        'majorRows': [6, 4, 2], 'minorRows': [5, 3, 1],
        'diagonals': diagonals, 'idealCPSeedOnly': True,
        'solvedCreasePattern': False, 'foldedForm': False,
        'mountainValleyAssigned': False, 'isometryVerified': False,
        'layerOrderVerified': False, 'exactStraightCreaseFOLD': False,
        'adoptableCreasePattern': False,
    }
