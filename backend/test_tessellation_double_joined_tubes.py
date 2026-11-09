"""Origamica In[3599]/In[3600] double tube and PleatReducePolygon anchors."""

import math
import unittest

from tessellate import check_geometry
from tessellation_double_joined_tubes import (double_joined_tube_geometry,
                                               pleat_reduce_polygon,
                                               validate_double_joined_tube)


def _original_example(overlap=False):
    # DiscreteCircle[4,1] and PleatReducePolygon[bottom,.5], rotated 45°.
    bottom = [[1,0], [0,1], [-1,0], [0,-1]]
    pleated = pleat_reduce_polygon(bottom,.5)
    angle = math.pi/4
    top = [[math.cos(angle)*x-math.sin(angle)*y,
            math.sin(angle)*x+math.cos(angle)*y] for x,y in pleated]
    return {'family':'double-joined-tube', 'bottomPoints':bottom,
            'topPoints':top, 'verticalOffset':.5, 'panelOverlap':overlap}


class DoubleJoinedTubesTests(unittest.TestCase):
    def _check(self, result, vertices, edges, faces):
        fold, source = result['fold'], result['source']
        self.assertEqual(source['spatialKind'], 'origamica-double-joined-tube')
        self.assertEqual(len(fold['vertices_coords']), vertices)
        self.assertEqual(len(source['foldedForm3D']), vertices)
        self.assertEqual(len(fold['edges_vertices']), edges)
        self.assertEqual(len(fold['faces_vertices']), faces)
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertLess(source['maximumFaceDistanceError'], 1e-9)
        self.assertLess(source['maximumEquationResidual'], 1e-8)
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertFalse(source['selfCollisionChecked'])
        self.assertGreater(max(p[2] for p in source['foldedForm3D'])-
                           min(p[2] for p in source['foldedForm3D']), 2)

    def test_original_pleated_four_to_eight_sample_with_analytic_offsets(self):
        params = _original_example()
        result = double_joined_tube_geometry(params)
        self._check(result, 28, 51, 24)
        source = result['source']
        # The saved polygon yields bottom edge sqrt(2), first top edge
        # 1/(2sqrt(2)), and equal diagonals. The notebook's isometry
        # equations therefore give dx=1/(2sqrt(2)) and the positive dy root.
        expected_x = 1/(2*math.sqrt(2))
        expected_y = (-1 + math.sqrt(5.5-2*math.sqrt(2)))/2
        self.assertAlmostEqual(source['netHorizontalOffset'], expected_x, places=11)
        self.assertAlmostEqual(source['netVerticalOffset'], expected_y, places=11)
        for z in source['bottomJoinHeights']:
            self.assertAlmostEqual(z, 0, places=10)
        self.assertAlmostEqual(source['topJoinHeights'][0],
                               .5 + 3/(16*expected_y), places=10)
        self.assertAlmostEqual(source['topJoinHeights'][1],
                               .5 - 3/(16*expected_y), places=10)
        self.assertAlmostEqual(source['bottomTubeLevel'], -1, places=10)
        self.assertAlmostEqual(source['topTubeLevel'],
                               1.5+3/(16*expected_y), places=10)
        # The folded top point is at its actual xy with a nonzero z.
        self.assertAlmostEqual(source['foldedForm3D'][10][0],
                               params['topPoints'][0][0], places=10)
        self.assertAlmostEqual(source['foldedForm3D'][10][2],
                               source['topJoinHeights'][0], places=10)

    def test_overlap_repeats_one_lower_and_two_upper_panels(self):
        result = double_joined_tube_geometry(_original_example(True))
        self._check(result, 34, 63, 30)
        self.assertTrue(result['source']['panelOverlap'])

    def test_pleat_reduce_preserves_perimeter_and_original_vertex_order(self):
        bottom = [[1,0],[0,1],[-1,0],[0,-1]]
        top = pleat_reduce_polygon(bottom,.5)
        self.assertEqual(len(top),8)
        self.assertEqual(top[0],[.75,.25])
        self.assertEqual(top[1],[.5,0])
        self.assertEqual(top[2],[-.25,.75])
        perimeter = lambda points: sum(math.dist(points[i], points[(i+1)%len(points)])
                                       for i in range(len(points)))
        self.assertAlmostEqual(perimeter(bottom),perimeter(top),places=12)
        self.assertAlmostEqual(perimeter(bottom),
                               perimeter(pleat_reduce_polygon(bottom,.5,'CW')),places=12)

    def test_non_saved_pentagonal_pleat_changes_geometry_without_losing_isometry(self):
        m=5
        bottom=[[math.cos(2*math.pi*j/m), math.sin(2*math.pi*j/m)]
                for j in range(m)]
        pleated=pleat_reduce_polygon(bottom,.65)
        angle=math.pi/12
        top=[[math.cos(angle)*x-math.sin(angle)*y,
              math.sin(angle)*x+math.cos(angle)*y] for x,y in pleated]
        result=double_joined_tube_geometry({'family':'double-joined-tube',
                                            'bottomPoints':bottom, 'topPoints':top,
                                            'verticalOffset':.7})
        self._check(result,34,63,30)
        self.assertNotAlmostEqual(result['source']['netHorizontalOffset'],
                                  1/(2*math.sqrt(2)),places=3)

    def test_rejects_wrong_top_count_perimeter_and_invalid_options(self):
        params=_original_example()
        with self.assertRaisesRegex(ValueError,'两倍'):
            validate_double_joined_tube({**params,'topPoints':params['topPoints'][:-1]})
        with self.assertRaisesRegex(ValueError,'周长'):
            validate_double_joined_tube({**params,
                                         'topPoints':[[2*x,2*y] for x,y in params['topPoints']]})
        with self.assertRaisesRegex(ValueError,'不支持'):
            validate_double_joined_tube({**params,'twistDirection':'CW'})
        with self.assertRaisesRegex(ValueError,'赋型'):
            validate_double_joined_tube({**params,'typeMinimumAngleDeg':40,
                                         'typeMaximumAngleDeg':30})


if __name__=='__main__':
    unittest.main()
