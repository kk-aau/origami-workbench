import math
import unittest

import tessellation_curved_canonical_tangent_general as m


def close_vector(test, a, b, places=9):
    for x, y in zip(a, b):
        test.assertAlmostEqual(x, y, places=places)


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def partial(fn, u, v, axis):
    h = 1e-5
    if axis == 'u':
        a, b = fn(u+h, v), fn(u-h, v)
    else:
        a, b = fn(u, v+h), fn(u, v-h)
    return [(x-y)/(2*h) for x, y in zip(a, b)]


class CanonicalTangentGeneralSavedTests(unittest.TestCase):
    def test_saved_contract_and_limits(self):
        self.assertEqual([m.saved_input(c)['sourceCell'] for c in m.CASES],
                         ['In[3833]', 'In[3834]', 'In[3837]',
                          'In[3838]', 'In[3839]'])
        self.assertEqual(m.saved_input(m.CASES[2])['vRange'], [-1, 1])
        self.assertEqual(m.saved_input(m.CASES[3])['vRange'], [0, 1])
        for case in m.CASES:
            meta = m.saved_input(case)
            self.assertFalse(meta['numericWolframOutAvailable'])
            self.assertFalse(meta['exactStraightCreaseFOLD'])
            self.assertFalse(meta['adoptableCreasePattern'])
            self.assertAlmostEqual(math.dist(m.source_director(case, .7),
                                             (0, 0, 0)), 1)
        with self.assertRaises(ValueError):
            m.saved_input('other')

    def test_striction_and_projection_restore_seed(self):
        for case in m.CASES:
            for u in (.2, .7, 1.5, 2.6):
                close_vector(self, m.canonical_directrix(case, u),
                             m.seed_directrix(case, u))
                shift = u if case.startswith('general-') else 0
                for w in (-.3, 0, .8):
                    close_vector(self, m.source_point(case, u, w),
                                 m.developable_point(case, u, w+shift))
                if case in (m.CASES[3], m.CASES[4]):
                    h = 1e-5
                    b1, b0 = m.source_directrix(case, u+h), m.source_directrix(case, u-h)
                    d1, d0 = m.source_director(case, u+h), m.source_director(case, u-h)
                    bu = [(x-y)/(2*h) for x, y in zip(b1, b0)]
                    du = [(x-y)/(2*h) for x, y in zip(d1, d0)]
                    self.assertAlmostEqual(dot(bu, du)/dot(du, du), u, places=8)

    def test_saved_cross_curve_and_clipped_domain(self):
        for case in (m.CASES[0], m.CASES[4]):
            u, v = 1.2, .5
            close_vector(self, m.saved_plot_point(case, u, v),
                         m.canonical_directrix(case, u))
            close_vector(self, m.flat_saved_plot_point(case, u, v),
                         m.flat_cross_point(case, u, u))
            self.assertAlmostEqual(m.plot_v(case, u, 0), u)
            self.assertAlmostEqual(m.plot_v(case, u, 1), math.pi)
        self.assertGreater(math.dist(m.saved_plot_point(m.CASES[1], 1.2, .5),
                                     m.canonical_directrix(m.CASES[1], 1.2)), .1)
        self.assertFalse(m.first_form(m.CASES[1], 1.2, 1.2)['regular'])
        self.assertFalse(m.first_form(m.CASES[3], 1.2, 0)['regular'])
        self.assertTrue(m.first_form(m.CASES[2], 1.2, 0)['regular'])

    def test_3d_and_local_2d_first_forms(self):
        points = ((m.CASES[0], .6, 1.1), (m.CASES[1], 1.2, .5),
                  (m.CASES[1], 1.2, 2), (m.CASES[2], 1.2, -.4),
                  (m.CASES[3], 1.2, .6), (m.CASES[4], .6, 1.7))
        for case, u, v in points:
            form = m.first_form(case, u, v)
            self.assertTrue(form['regular'])
            for fn in (m.cross_curve_point, m.flat_cross_point):
                f = lambda a, b: fn(case, a, b)
                pu, pv = partial(f, u, v, 'u'), partial(f, u, v, 'v')
                self.assertAlmostEqual(dot(pu, pu), form['E'], places=8)
                self.assertAlmostEqual(dot(pu, pv), form['F'], places=8)
                self.assertAlmostEqual(dot(pv, pv), form['G'], places=8)

    def test_developability_and_range(self):
        for case in m.CASES:
            u = 1.2
            h = 1e-5
            b1, b0 = m.canonical_directrix(case, u+h), m.canonical_directrix(case, u-h)
            d1, d0 = m.canonical_director(case, u+h), m.canonical_director(case, u-h)
            bu = [(x-y)/(2*h) for x, y in zip(b1, b0)]
            du = [(x-y)/(2*h) for x, y in zip(d1, d0)]
            d = m.canonical_director(case, u)
            cross = (d[1]*du[2]-d[2]*du[1],
                     d[2]*du[0]-d[0]*du[2],
                     d[0]*du[1]-d[1]*du[0])
            self.assertAlmostEqual(dot(bu, cross), 0, places=9)
        with self.assertRaises(ValueError):
            m.plot_v(m.CASES[3], 1, 1.01)


if __name__ == '__main__':
    unittest.main()
