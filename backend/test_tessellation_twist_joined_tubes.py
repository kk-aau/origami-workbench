"""Numerical anchors from Origamica 15.0 In[3583]–In[3585], In[3592]."""

import math
import unittest

from tessellate import check_geometry
from tessellation_twist_joined_tubes import (twist_joined_tube_geometry,
                                             validate_twist_joined_tube)


def _square_example(direction='CCW', overlap=True):
    bottom = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
    angle = math.pi / 6
    top = [[math.cos(angle)*x - math.sin(angle)*y,
            math.sin(angle)*x + math.cos(angle)*y] for x, y in bottom]
    return {'family': 'twist-joined-tube', 'bottomPoints': bottom,
            'topPoints': top, 'verticalOffset': 1,
            'twistDirection': direction, 'panelOverlap': overlap}


def _circle_example(m, phase_deg, dx=0., dy=0.):
    bottom = [[math.cos(2*math.pi*j/m), math.sin(2*math.pi*j/m)]
              for j in range(m)]
    phase = math.radians(phase_deg)
    top = [[dx + math.cos(2*math.pi*j/m + phase),
            dy + math.sin(2*math.pi*j/m + phase)] for j in range(m)]
    return bottom, top


class TwistJoinedTubesTests(unittest.TestCase):
    def _check_real_mesh(self, result, vertex_count, edge_count, face_count):
        fold, source = result['fold'], result['source']
        self.assertEqual(source['spatialKind'], 'origamica-twist-joined-tube')
        self.assertEqual(len(fold['vertices_coords']), vertex_count)
        self.assertEqual(len(source['foldedForm3D']), vertex_count)
        self.assertEqual(len(fold['edges_vertices']), edge_count)
        self.assertEqual(len(fold['faces_vertices']), face_count)
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertLess(source['maximumFaceDistanceError'], 1e-9)
        self.assertLess(source['maximumEquationResidual'], 1e-8)
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertFalse(source['selfCollisionChecked'])
        # A planar CP projection cannot pass this test: the actual lower and
        # upper cylinder rims occupy different z levels.
        self.assertGreater(max(v[2] for v in source['foldedForm3D']) -
                           min(v[2] for v in source['foldedForm3D']), .5)
        for assignment, angle in zip(fold['edges_assignment'], fold['edges_foldAngle']):
            if assignment == 'M':
                self.assertLess(angle, 0)
            elif assignment == 'V':
                self.assertGreater(angle, 0)

    def test_saved_twisted_square_ccw_has_independent_analytic_offsets(self):
        result = twist_joined_tube_geometry(_square_example())
        self._check_real_mesh(result, 24, 43, 20)
        source = result['source']
        # Notebook equations for the 30° square reduce to:
        # d_x=(sqrt(3)-1)/2; d_x²+(1+d_y)²=5-2sqrt(3).
        expected_x = (math.sqrt(3)-1)/2
        expected_y = math.sqrt(5-2*math.sqrt(3)-expected_x**2)-1
        self.assertAlmostEqual(source['netHorizontalOffset'], expected_x, places=11)
        self.assertAlmostEqual(source['netVerticalOffset'], expected_y, places=11)
        for z in source['bottomJoinHeights']:
            self.assertAlmostEqual(z, -.5, places=10)
        for z in source['topJoinHeights']:
            self.assertAlmostEqual(z, .5, places=10)
        self.assertAlmostEqual(source['bottomTubeLevel'], -1.5, places=10)
        self.assertAlmostEqual(source['topTubeLevel'], 1.5, places=10)
        # First top join is rotated 30° in true xyz, not drawn on the CP.
        self.assertAlmostEqual(source['foldedForm3D'][12][0],
                               math.cos(math.pi/6)-math.sin(math.pi/6), places=10)
        self.assertAlmostEqual(source['foldedForm3D'][12][2], .5, places=10)

    def test_saved_square_opposite_twist_changes_diagonal_and_offsets(self):
        result = twist_joined_tube_geometry(_square_example('CW'))
        self._check_real_mesh(result, 24, 43, 20)
        source = result['source']
        expected_x = (3-math.sqrt(3))/2
        expected_y = math.sqrt(5-2*math.sqrt(3)-expected_x**2)-1
        self.assertAlmostEqual(source['netHorizontalOffset'], expected_x, places=11)
        self.assertAlmostEqual(source['netVerticalOffset'], expected_y, places=11)
        ccw = twist_joined_tube_geometry(_square_example())['fold']
        self.assertNotEqual(result['fold']['edges_vertices'], ccw['edges_vertices'])

    def test_no_overlap_has_one_panel_per_cross_section_edge(self):
        result = twist_joined_tube_geometry(_square_example(overlap=False))
        self._check_real_mesh(result, 20, 35, 16)
        self.assertFalse(result['source']['panelOverlap'])
        self.assertEqual(result['fold']['edges_assignment'].count('B'), 14)

    def test_saved_tilted_cylinder_is_true_nonplanar_3d(self):
        # Notebook In[3592]: m=12, phase=90°, dz=.8,
        # tilt axis=90°, top tilt=15°, overlap=True.
        bottom, top = _circle_example(12, 90)
        result = twist_joined_tube_geometry({
            'family': 'twist-joined-tube', 'bottomPoints': bottom,
            'topPoints': top, 'verticalOffset': .8,
            'tiltAxialAngleDeg': 90, 'tiltAzimuthalAngleDeg': 15,
            'panelOverlap': True, 'typeMinimumAngleDeg': 30})
        self._check_real_mesh(result, 56, 107, 52)
        source = result['source']
        upper = source['foldedForm3D'][28:42]
        self.assertGreater(max(p[2] for p in upper) - min(p[2] for p in upper), .5)
        self.assertEqual(source['typeMinimumAngleDeg'], 30)
        self.assertIn('U', result['fold']['edges_assignment'])

    def test_saved_laterally_offset_cylinder_remains_isometric(self):
        # Notebook In[3586]: m=24, phase=175°, offset=(.5,.5), dz=.32.
        bottom, top = _circle_example(24, 175, .5, .5)
        result = twist_joined_tube_geometry({
            'family': 'twist-joined-tube', 'bottomPoints': bottom,
            'topPoints': top, 'verticalOffset': .32,
            'panelOverlap': True, 'typeMinimumAngleDeg': 30})
        self._check_real_mesh(result, 104, 203, 100)
        self.assertLess(result['source']['maximumFaceDistanceError'], 1e-10)

    def test_rejects_unsupported_and_mismatched_inputs(self):
        params = _square_example()
        with self.assertRaisesRegex(ValueError, '周长'):
            validate_twist_joined_tube({**params,
                                        'topPoints': [[2*x, 2*y] for x,y in params['topPoints']]})
        with self.assertRaisesRegex(ValueError, '顶点数'):
            validate_twist_joined_tube({**params, 'topPoints': params['topPoints'][:-1]})
        with self.assertRaisesRegex(ValueError, '不支持'):
            validate_twist_joined_tube({**params, 'unknown': 1})
        with self.assertRaisesRegex(ValueError, '倾斜'):
            validate_twist_joined_tube({**params, 'tiltAzimuthalAngleDeg': 90})
        with self.assertRaisesRegex(ValueError, '赋型'):
            validate_twist_joined_tube({**params, 'typeMinimumAngleDeg': 50,
                                        'typeMaximumAngleDeg': 30})


if __name__ == '__main__':
    unittest.main()
