"""Flagstone half-molecules at the old edge become whole outer molecules."""

import math
import unittest

from tessellate import generate
from tessellation_paper_extend import _contains_original_creases


BASE = {'family': 'flagstone', 'rows': 3, 'columns': 3,
        'width': .25, 'aspect': 1}


def _edge_key(fold, index):
    a, b = fold['edges_vertices'][index]
    return tuple(sorted((tuple(round(v, 7) for v in fold['vertices_coords'][a]),
                         tuple(round(v, 7) for v in fold['vertices_coords'][b]))))


class FlagstonePaperTests(unittest.TestCase):
    def test_new_sheet_preserves_every_nonboundary_crease(self):
        core = generate(BASE)['fold']
        result = generate({**BASE, 'paper': {'shape': 'square', 'margin': .1}})
        fold = result['fold']
        self.assertEqual(result['source']['paperMethod'], 'extended-pattern-clip-v1')
        self.assertEqual(result['source']['paperExpansion'], 1)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        old_boundary_vertices = {v for (a, b), kind in zip(
            core['edges_vertices'], core['edges_assignment']) if kind == 'B'
            for v in (a, b)}
        interior = {(kind, _edge_key(core, i)) for i, ((a, b), kind) in
                    enumerate(zip(core['edges_vertices'], core['edges_assignment']))
                    if kind in ('M', 'V') and a not in old_boundary_vertices
                    and b not in old_boundary_vertices}
        all_old = {(kind, _edge_key(core, i)) for i, kind in
                   enumerate(core['edges_assignment']) if kind in ('M', 'V')}
        new = {(kind, _edge_key(fold, i)) for i, kind in
               enumerate(fold['edges_assignment']) if kind in ('M', 'V')}
        self.assertEqual(len(all_old), 176)
        self.assertEqual(len(interior), 144)
        self.assertTrue(interior <= new)
        self.assertEqual(len(all_old & new), 160)
        old_b = {_edge_key(core, i) for i, kind in
                 enumerate(core['edges_assignment']) if kind == 'B'}
        new_b = {_edge_key(fold, i) for i, kind in
                 enumerate(fold['edges_assignment']) if kind == 'B'}
        self.assertFalse(old_b & new_b, 'the old B must not remain as an inner ring')
        core_max = max(p[0] for p in core['vertices_coords'])
        self.assertTrue(any(max(fold['vertices_coords'][v][0] for v in edge) >
                            core_max + .01 for edge, kind in zip(
                                fold['edges_vertices'], fold['edges_assignment'])
                            if kind in ('M', 'V')))
        self.assertTrue(all(math.isfinite(v) for point in fold['vertices_coords']
                            for v in point))

    def test_rectangular_and_shrunk_units_keep_their_periodic_interior(self):
        for overrides in ({'aspect': 1.5}, {'shrinkage': .6},
                          {'aspect': 1.5, 'shrinkage': .6}):
            with self.subTest(overrides=overrides):
                params = {**BASE, **overrides}
                old = generate(params)['fold']
                result = generate({**params, 'paper': {'shape': 'square',
                                                       'margin': .1}})
                self.assertTrue(_contains_original_creases(
                    old, result['fold'], skip_boundary_touching=True))
                self.assertEqual(result['stats']['checks']['geometry']['status'],
                                 'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],
                                 'passed')


if __name__ == '__main__':
    unittest.main()
