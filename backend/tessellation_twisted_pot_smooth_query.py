"""Read-only reconstruction of Origamica's pro-forma smooth-flange pot.

The notebook explicitly says its displayed 3D flanges are not isometric to
the crease pattern.  This operation therefore never returns an adoptable FOLD.
"""

import math

import numpy as np

from tessellation_patterns import make_fold
from tessellation_twisted_pot import (_assemble, _gore_rows,
                                     validate_twisted_pot)


def _face_metric_error(flat, space, faces):
    worst_distance = 0.
    worst_plane = 0.
    for face in faces:
        for index, a in enumerate(face):
            for b in face[index + 1:]:
                worst_distance = max(worst_distance,
                                     abs(math.dist(flat[a], flat[b]) -
                                         math.dist(space[a], space[b])))
        if len(face) > 3:
            points = np.array([space[index] for index in face])
            normal = np.cross(points[1] - points[0], points[2] - points[0])
            length = np.linalg.norm(normal)
            if length > 1e-12:
                worst_plane = max(worst_plane, float(np.max(
                    np.abs((points - points[0]) @ normal) / length)))
    return worst_distance, worst_plane


def query_twisted_pot_smooth(data):
    if not isinstance(data, dict) or data.get('family') != 'twisted-pot' or \
            data.get('flatFlanges') != 'smooth':
        raise ValueError('只读查询须选择原版 smooth 法兰。')
    # Keep the physical faceted candidate's validated numerical domain, but
    # bypass its faceted flange solver.  The smooth branch uses the pro-forma
    # q/qq values already derived by the source gore equations.
    params = validate_twisted_pot({**data, 'flatFlanges': 'faceted'})
    rows = _gore_rows(params)
    assembled = _assemble(params, (*rows[:6], rows[7], rows[8], []))
    flat, spatial, edges, kinds, faces, _, residuals, _, ids = assembled
    from tessellate import check_geometry
    paper = make_fold(flat, edges, kinds, faces)
    geometry = check_geometry(paper)
    if geometry['status'] != 'passed':
        raise ValueError('原版 smooth 法兰展开图未通过二维几何检查。')
    maximum_distance, maximum_plane = _face_metric_error(flat, spatial, faces)
    if not all(math.isfinite(v) for v in (maximum_distance, maximum_plane)):
        raise ValueError('原版 smooth 法兰产生了非有限空间坐标。')
    display = [point.copy() for point in spatial]
    if params['flangeInset']:
        letter = 'r' if params['asymmetry'] == 1 else 'p'
        for sector in range(params['sectors']):
            for level in range(3, len(params['crossSection'])):
                point = display[ids[letter, level, sector]]
                point[0] *= 1. - params['flangeInset']
                point[1] *= 1. - params['flangeInset']
    return {
        'family': 'twisted-pot-smooth-reference',
        'query': {**params, 'flatFlanges': 'smooth'},
        'paper': {'vertices': flat, 'edges': edges, 'faces': faces},
        'reference3D': {'vertices': spatial, 'displayVertices': display},
        'diagnostics': {'paperGeometryPassed': True,
                        'maximumFaceDistanceError': maximum_distance,
                        'maximumFacePlaneError': maximum_plane,
                        'maximumGoreEquationResidual': max(residuals, default=0.)},
        'certification': {'metricPreserving': False,
                          'adoptableCreasePattern': False,
                          'continuousFoldChecked': False,
                          'savedNumericalOut': False},
        'source': {'notebookRows': [268886, 271306],
                   'note': '原版明确将 smooth 法兰 FF 解释为非等距示意。'},
    }
