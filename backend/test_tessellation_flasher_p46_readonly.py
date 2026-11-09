"""Fixed source inputs In[4131]/[4132]/[4206] stay read-only and exact."""

import json
import math
from pathlib import Path
import unittest

from tessellate import generate
from tessellation_flasher import (
    _wrap, flasher_default_cp_point, flasher_sector_quads,
)
from tessellation_paraboloidal_flasher import solve_paraboloidal_flasher


DATA = json.loads((Path(__file__).resolve().parents[1] / 'src' / 'app' /
                   'flasherP46ReadonlyData.json').read_text(encoding='utf-8'))


class FlasherP46ReadonlyTests(unittest.TestCase):
    def test_in4131_4132_preserve_fixed_sector_quads_and_all_labels(self):
        y, z = DATA['sectors']['Y'], DATA['sectors']['Z']
        self.assertEqual(y['lines'][:49], z['lines'][:49])
        for variant, sector in (('Y', y), ('Z', z)):
            with self.subTest(variant=variant):
                self.assertEqual(sector['input'], {
                    'rings': 4, 'heightOrder': 1, 'rotationalOrder': 5,
                    'sector': 0, 'radialOrder': 4, 'diagonal': variant})
                self.assertEqual((sector['foldedLinesCount'],
                                  sector['diagonalCount'], len(sector['labels']),
                                  len(sector['lines'])), (49, 16, 30, 65))
                self.assertEqual(sector['status'], 'ideal-cp-seed-only')
                quads = flasher_sector_quads(4, 1, 5, 0)
                self.assertEqual(len(quads), 16)
                pair = (0, 2) if variant == 'Y' else (1, 3)
                for quad, line in zip(quads, sector['lines'][49:]):
                    self.assertEqual(line['kind'], 'light')
                    for index, label in enumerate((quad[pair[0]], quad[pair[1]])):
                        self.assertEqual(line['labels'][index], list(label))
                        actual = line['a' if index == 0 else 'b']
                        expected = flasher_default_cp_point(*label, 5)
                        self.assertLess(math.dist(actual, expected), 1e-12)
                for row in sector['labels']:
                    expected = flasher_default_cp_point(*_wrap(row['ijk'], 5), 5)
                    self.assertLess(math.dist(row['point'], expected), 1e-12)
                self.assertTrue(all(math.dist(line['a'], line['b']) > 1e-12
                                    for line in sector['lines']))

    def test_in4206_uncut_local_solve_matches_readonly_data_and_cut_is_rejected(self):
        fixture = DATA['highF']
        self.assertEqual(fixture['input'], {
            'rings': 2, 'heightOrder': 2, 'rotationalOrder': 4,
            'focalLength': 1e6, 'radialIncrement': .05,
            'diagonal': 'Y', 'minimumAngleDeg': 10})
        self.assertEqual(fixture['status'], 'uncut-dp-ff-read-only')
        raw = solve_paraboloidal_flasher(2, 2, 4, 1e6, .05, 'Y',
                                         minimum_angle_deg=10)
        self.assertEqual((len(raw['deployed_vertices_coords']),
                          len(raw['edges_vertices']), len(raw['faces_vertices'])),
                         (60, 156, 97))
        for key, raw_key in (('projected', 'projected_vertices_coords'),
                             ('deployed', 'deployed_vertices_coords'),
                             ('folded', 'folded_vertices_coords')):
            self.assertEqual(len(fixture[key]), len(raw[raw_key]))
            self.assertLess(max(math.dist(a, b) for a, b in
                                zip(fixture[key], raw[raw_key])), 1e-10)
        self.assertEqual(fixture['edges'],
                         [list(edge) for edge in raw['edges_vertices']])
        self.assertEqual(fixture['faces'],
                         [list(face) for face in raw['faces_vertices']])
        self.assertEqual(fixture['edgeTypes'], raw['edge_types'])
        self.assertFalse(fixture['hasTruePlanarDevelopment'])
        self.assertFalse(raw['hasTruePlanarDevelopment'])
        self.assertLess(raw['maxDPFFFaceEdgeError'], 1e-10)
        self.assertAlmostEqual(fixture['maxDPFFFaceEdgeError'],
                               raw['maxDPFFFaceEdgeError'], places=12)
        with self.assertRaisesRegex(ValueError, '交叉检查'):
            generate({'family': 'paraboloidal-flasher', 'focalLength': 1e6})


if __name__ == '__main__':
    unittest.main()
