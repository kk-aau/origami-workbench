"""The extended source alignment stays fixed while fold parameters move."""

import unittest

from tessellate import generate


CUSTOM = {
    'family': 'custom',
    'vertices': [[0, 0], [.35, 0], [1, 0], [0, 1], [.35, 1], [1, 1]],
    'faces': [[0, 1, 4, 3], [1, 2, 5, 4]],
    'repeatX': 2, 'repeatY': 2,
    'paper': {'shape': 'square', 'margin': .1},
    'parameterization': 'gamma-alpha',
    'postRotation': 'dual',
}


class PaperTranslationTests(unittest.TestCase):
    def test_asymmetric_unit_has_fixed_unrotated_alignment(self):
        displacements = []
        for gamma, angle in ((.5, 30), (.6, 42), (.8, 65)):
            result = generate({**CUSTOM, 'gamma': gamma, 'pleatAngle': angle})
            self.assertEqual(result['source']['paperMethod'], 'extended-pattern-clip-v1')
            self.assertEqual(result['source']['paperExpansion'], 1)
            self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
            displacements.append(result['source']['paperClipPreview']['translationBeforeRotation'])
        self.assertEqual(displacements, [[-1., -1.]] * 3)


if __name__ == '__main__':
    unittest.main()
