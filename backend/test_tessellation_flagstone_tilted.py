import math
import unittest

from tessellation_flagstone_tilted import tilted_star_query
from tessellate import dispatch_request


# Origamica In[450]/In[451] use these six points for both local twist signs.
# The notebook saves graphical examples, not numeric q coordinates. Therefore
# check its geometric witness (three reflected reflex corners coincide) and
# strict inward bounds, rather than asserting a made-up Mathematica output.
STAR = [[-2.25, .25], [0, 0], [1.9, -1.18], [1.4, 1], [1.11, 3.58], [-.3, 1.4]]


class TiltedStarTests(unittest.TestCase):
    def test_original_both_directions_have_a_shared_reflection_point(self):
        answers = []
        for direction in (1, -1):
            result = dispatch_request(dict(operation='flagstone-tilted-star',
                                           points=STAR, direction=direction))
            self.assertEqual(result['kind'], 'origamica-tilted-pleat-degree3-local')
            self.assertFalse(result['wholeTessellationConstructed'])
            self.assertFalse(result['creaseAssignmentsKnown'])
            self.assertLess(result['reflectedCornerMaxGap'], 1e-8)
            self.assertLess(result['reflectedDoubleArea'], 1e-10)
            for actual, low, high in zip(result['inwardDistances'],
                                         result['minimumDistances'],
                                         result['maximumDistances']):
                self.assertGreater(actual, low)
                self.assertLess(actual, high)
            answers.append(result)
        self.assertGreater(math.dist(answers[0]['centralTriangle'][0],
                                     answers[1]['centralTriangle'][0]), .01)

    def test_result_is_geometrically_covariant(self):
        base = tilted_star_query(dict(points=STAR, direction=1))
        shifted = [[-2 * y + 5, 2 * x - 3] for x, y in STAR]
        rotated = tilted_star_query(dict(points=shifted, direction=1))
        for original, actual in zip(base['centralTriangle'], rotated['centralTriangle']):
            expected = [-2 * original[1] + 5, 2 * original[0] - 3]
            self.assertLess(math.dist(expected, actual), 1e-5)
        self.assertLess(rotated['reflectedCornerMaxGap'], 1e-8)

    def test_rejects_invalid_stars_and_does_not_affect_parallel_generation(self):
        invalid = [
            dict(points=STAR[:5]),
            dict(points=STAR[::-1]),
            dict(points=[[STAR[0][0] + .1, STAR[0][1]], *STAR[1:]]),
            dict(points=STAR, direction=0),
            dict(points=STAR, direction=True),
            dict(points=STAR, extra='unsupported'),
        ]
        for input_value in invalid:
            with self.subTest(input_value=input_value), self.assertRaises(ValueError):
                tilted_star_query(input_value)
        from tessellate import generate
        parallel = generate(dict(family='flagstone', rows=2, columns=2,
                                 junctionAssignment='original'))
        self.assertEqual(parallel['stats']['checks']['geometry']['status'], 'passed')


if __name__ == '__main__':
    unittest.main()
