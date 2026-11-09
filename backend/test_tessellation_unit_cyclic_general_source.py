"""Full custom-patch path for the numeric In[378] + In[3041/3044] composition."""

import math
import unittest

from tessellate import generate
from tessellation_flat_embedding import flat_face_embedding
from tessellation_unit_cyclic_polygon import unit_cyclic_polygon_info


class UnitCyclicGeneralSourceTest(unittest.TestCase):
    def test_three_to_twenty_four_corner_centered_and_alt(self):
        for n in range(3, 25):
            angles = [(n-2)*180/n]*n
            angles[-1] = 0.
            if n % 2 == 0:
                angles[-2] = 0.
            vertices = unit_cyclic_polygon_info(angles, 1., 2)['vertices']
            self.assertAlmostEqual(math.dist(*vertices[:2]), 1., places=10)
            for mode in ('centered', 'alt'):
                with self.subTest(n=n, mode=mode):
                    twist = {'width': .1, 'offset': 0.,
                             'centralTypes': ['M']*n if n > 12 else ['M']*(n-2)+['V', 'V']}
                    twist.update({'tilt': 80.} if mode == 'centered' else
                                 {'angleMode': 'twist', 'twistAngle': 30.})
                    result = generate({
                        'family': 'custom', 'vertices': vertices,
                        'faces': [list(range(n))], 'repeatX': 1, 'repeatY': 1,
                        'customOutput': 'tile-twists', 'tileTwists': [twist],
                        'monolithicOptions': {
                            'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
                            'collinearCleanup': True, 'collinearTolerance': 1e-8},
                        'angle': 36, 'scale': .3,
                    })
                    checks = result['stats']['checks']
                    self.assertEqual(checks['geometry']['status'], 'passed')
                    self.assertEqual(checks['local']['status'], 'passed')
                    fold = result['fold']
                    self.assertEqual(len(fold['edges_vertices']), 6*n)
                    flat, closure = flat_face_embedding(fold)
                    self.assertEqual(len(flat),len(fold['vertices_coords']))
                    self.assertLess(closure, 1e-6)
                    self.assertEqual(checks['layerOrder']['status'],
                                     'not_checked')

    def test_nonuniform_twenty_four_corner_source_and_both_twists(self):
        n = 24
        regular = (n-2)*180/n
        angles = [regular+.05*math.sin(index*1.7) if index < n-2 else 0.
                  for index in range(n)]
        info = unit_cyclic_polygon_info(angles, 1., 2)
        vertices = info['vertices']
        self.assertAlmostEqual(math.dist(vertices[1], vertices[2]), 1., places=8)
        self.assertGreater(max(info['centerAngles'])-min(info['centerAngles']), .1)
        for mode in ('centered', 'alt'):
            with self.subTest(mode=mode):
                twist = {'width': .1, 'offset': 0.,
                         'centralTypes': ['M']*n}
                twist.update({'tilt': 80.} if mode == 'centered' else
                             {'angleMode': 'twist', 'twistAngle': 30.})
                result = generate({'family': 'custom', 'vertices': vertices,
                    'faces': [list(range(n))], 'repeatX': 1, 'repeatY': 1,
                    'customOutput': 'tile-twists', 'tileTwists': [twist],
                    'angle': 36, 'scale': .3})
                checks = result['stats']['checks']
                self.assertEqual(checks['geometry']['status'], 'passed')
                self.assertEqual(checks['local']['status'], 'passed')
                self.assertLess(flat_face_embedding(result['fold'])[1], 1e-8)


if __name__ == '__main__':
    unittest.main()
