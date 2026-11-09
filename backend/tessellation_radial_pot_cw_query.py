"""Read-only In[315] clockwise boundary graph for MakeRadialPotWedge.

The source has no saved CW numerical Out.  This deliberately returns neither
faces nor a FOLD: major arcs can cross or overlap after wedge rotation.
"""

import math

from tessellation_radial_pot import (_assemble, _wedge_rows,
                                     validate_radial_pot)


def query_radial_pot_cw(data):
    if (not isinstance(data, dict) or data.get('family') != 'radial-pot' or
            data.get('border') != 'circular' or data.get('arcDirection') != 'CW'):
        raise ValueError('CW 只读查询须选择 PotCircular 和 ArcDirection=CW。')
    # The adoptable validator remains CCW-only.  Reuse its complete domain
    # checks here, changing only the direction for this independent query.
    params = validate_radial_pot({**data, 'arcDirection': 'CCW'})
    rows2, rows3, _, flat_bottom = _wedge_rows(params)
    arcs = []
    vertices, _, edges, roles, _, _, _ = _assemble(
        params, rows2, rows3, flat_bottom, reference_only=True,
        arc_metadata=arcs)
    if not arcs or any(not math.isfinite(arc['sweepDeg']) for arc in arcs):
        raise ValueError('CW 外缘没有有限的源公式圆弧。')
    spacing = 360 / params['sectors']
    witness = next(({'wedge': arc['wedge'], 'between': arc['between'],
                     'sweepDeg': arc['sweepDeg'], 'sectorSpacingDeg': spacing}
                    for arc in arcs if abs(arc['sweepDeg']) > spacing + 1e-7), None)
    return {
        'family': 'radial-pot-cw-reference',
        'query': data.copy(),
        'graph': {'vertices': vertices, 'edges': edges, 'edgeRoles': roles,
                  'arcs': arcs},
        'diagnostics': {'majorArcCount': sum(abs(arc['sweepDeg']) > 180
                                         for arc in arcs),
                        'maximumArcSweepDeg': max(abs(arc['sweepDeg'])
                                                  for arc in arcs),
                        'angularOverlapWitness': witness},
        'certification': {'sourceDerived': True, 'savedNumericalOut': False,
                          'paperGeometryChecked': False,
                          'metricPreserving': False,
                          'adoptableCreasePattern': False},
        'source': {'arcDefinitionRows': [17650, 17808],
                   'wedgeArcifyRows': [262629, 262703],
                   'savedProfileRows': [264342, 264500],
                   'note': 'In[315] 的 CW 角度解支；第 43 节未保存显式 CW 数值 Out。'},
    }
