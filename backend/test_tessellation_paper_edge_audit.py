"""Paper extension must reach outer corners without shifting original folds."""
import unittest

from tessellate import generate
from tessellation_paper_extend import _contains_original_creases


class PaperEdgeAuditTests(unittest.TestCase):
    def test_triangular_paper_around_triangular_periodic_pattern(self):
        params = {'family': 'periodic', 'tiling': 'triangle',
                  'rows': 3, 'columns': 3}
        core = generate(params)['fold']
        result = generate({**params, 'paper': {'shape': 'regular',
                                               'sides': 3, 'margin': .1}})
        self.assertEqual(result['source']['paperExpansion'], 6)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertTrue(_contains_original_creases(core, result['fold']))

    def test_woven_rejects_retired_padding_instead_of_losing_the_true_cp(self):
        params = {'family': 'woven', 'weave': 'twill',
                  'rows': 3, 'columns': 3}
        with self.assertRaisesRegex(ValueError,'盒褶编织.*沿用原边界'):
            generate({**params, 'paper': {'shape': 'regular',
                                         'sides': 3, 'margin': .1}})

    def test_large_hexagonal_paper_requires_seventh_padding_step(self):
        params = {'family': 'periodic', 'tiling': 'hexagon',
                  'rows': 3, 'columns': 3}
        core = generate(params)['fold']
        result = generate({**params, 'paper': {'shape': 'regular',
                                               'sides': 6, 'margin': 1.}})
        self.assertEqual(result['source']['paperExpansion'], 7)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertTrue(_contains_original_creases(core, result['fold']))
        boundary = {v for (a, b), kind in zip(
            result['fold']['edges_vertices'], result['fold']['edges_assignment'])
            if kind == 'B' for v in (a, b)}
        self.assertGreater(sum((a in boundary) != (b in boundary)
                               for (a, b), kind in zip(
                                   result['fold']['edges_vertices'],
                                   result['fold']['edges_assignment'])
                               if kind in ('M', 'V')), 0)


if __name__ == '__main__':
    unittest.main()
