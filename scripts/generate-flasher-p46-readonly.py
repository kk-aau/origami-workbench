"""Regenerate local read-only data for Origamica In[4131]/[4132]/[4206].

The JSON is computed from the notebook's formulas by the project's bounded
numerical modules; it is not a Wolfram saved Out or an adoptable paper.
"""

import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from tessellation_flasher import (  # noqa: E402
    _wrap, flasher_default_cp_point, flasher_sector_quads,
)
from tessellation_paraboloidal_flasher import solve_paraboloidal_flasher  # noqa: E402


def point(label):
    return flasher_default_cp_point(*_wrap(label, 5), 5)


def sector(variant):
    r, h, m, k, n = 4, 1, 5, 0, 4
    lines = []

    def add(a, b, kind):
        lines.append({'a': point(a), 'b': point(b), 'kind': kind,
                      'labels': [list(a), list(b)]})

    # Exact index order and edge kinds of FlasherSectorFoldedFoldLines In[4120].
    for group in range(r):
        j = h * group
        for i in range(j, n + 1):
            add((i, j, k), (i - 1, j, k), 'sharp')
            add((i, j, k), (i, min(j + h, i + 1), k),
                'border' if i == n else 'medium')
    add((n, n, k), (n - 1, n, k), 'border')
    for group in range(r):
        for offset in range(h):
            i = h * group + offset
            add((i - 1, i, k), (i, i + 1, k), 'sharp')
    for group in range(r):
        i = h * group - 1
        for j in range(h * group + 1, n + 1):
            if group:
                add((i, j, k), (i, j - 1, k), 'sharp')
            add((i, j, k), (min(i + h, j - 1), j, k),
                'border' if j == n else 'medium')
    quads = flasher_sector_quads(r, h, m, k)
    a, b = (0, 2) if variant == 'Y' else (1, 3)
    for quad in quads:
        add(quad[a], quad[b], 'light')
    labels = [{'ijk': [i, j, k], 'point': point((i, j, k))}
              for i in range(-1, n + 1) for j in range(n + 1)]
    return {'sourceCell': 'In[4131]' if variant == 'Y' else 'In[4132]',
            'input': {'rings': r, 'heightOrder': h, 'rotationalOrder': m,
                      'sector': k, 'radialOrder': n, 'diagonal': variant},
            'foldedLinesCount': len(lines) - len(quads),
            'diagonalCount': len(quads), 'lines': lines, 'labels': labels,
            'status': 'ideal-cp-seed-only'}


def high_f():
    raw = solve_paraboloidal_flasher(2, 2, 4, 1e6, .05, 'Y',
                                     minimum_angle_deg=10)
    projected = raw['projected_vertices_coords']
    dp = raw['deployed_vertices_coords']
    projected_gap = max(abs(math.dist(projected[a], projected[b]) -
                            math.dist(dp[a], dp[b]))
                        for a, b in raw['edges_vertices'])
    return {'sourceCell': 'In[4206]',
            'input': {'rings': 2, 'heightOrder': 2, 'rotationalOrder': 4,
                      'focalLength': 1e6, 'radialIncrement': .05,
                      'diagonal': 'Y', 'minimumAngleDeg': 10},
            'projected': projected, 'deployed': dp,
            'folded': raw['folded_vertices_coords'],
            'edges': raw['edges_vertices'],
            'faces': raw['faces_vertices'],
            'edgeTypes': raw['edge_types'],
            'maxDPFFFaceEdgeError': raw['maxDPFFFaceEdgeError'],
            'projectedDPEdgeGap': projected_gap,
            'hasTruePlanarDevelopment': raw['hasTruePlanarDevelopment'],
            'status': 'uncut-dp-ff-read-only'}


data = {'provenance': 'local numerical reconstruction, not Mathematica Out',
        'sectors': {'Y': sector('Y'), 'Z': sector('Z')},
        'highF': high_f()}
target = ROOT / 'src' / 'app' / 'flasherP46ReadonlyData.json'
target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n',
                  encoding='utf-8')
print(f'{target}: Y/Z {data["sectors"]["Y"]["diagonalCount"]} diagonals, '
      f'high f {len(data["highF"]["deployed"])} vertices')
