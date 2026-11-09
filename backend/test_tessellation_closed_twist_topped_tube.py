"""Origamica In[3565]–In[3567] closed twist cap, including real xyz."""

import collections
import math
import unittest

from tessellate import check_geometry
from tessellation_closed_twist_topped_tube import (
    closed_twist_topped_tube_geometry, validate_closed_twist_topped_tube)


SQUARE = [[1,1],[-1,1],[-1,-1],[1,-1]]
SAVED_ELLIPSE = [
    [1.618033988749895,0],[1.421208662185828,.478008410127300],
    [1.004516235158516,.783949042583285],[.514336409756560,.948131831262210],
    [0,1],[-.514336409756560,.948131831262210],
    [-1.004516235158516,.783949042583285],[-1.421208662185828,.478008410127300],
    [-1.618033988749895,0],[-1.421208662185828,-.478008410127300],
    [-1.004516235158516,-.783949042583285],[-.514336409756560,-.948131831262210],
    [0,-1],[.514336409756560,-.948131831262210],
    [1.004516235158516,-.783949042583285],[1.421208662185828,-.478008410127300],
]


class ClosedTwistToppedTubeTests(unittest.TestCase):
    def _check(self, result, vertices, edges, faces, span_min=1):
        fold, source = result['fold'], result['source']
        self.assertEqual(source['spatialKind'],'origamica-closed-twist-topped-tube')
        self.assertEqual(len(fold['vertices_coords']),vertices)
        self.assertEqual(len(source['foldedForm3D']),vertices)
        self.assertEqual(len(fold['edges_vertices']),edges)
        self.assertEqual(len(fold['faces_vertices']),faces)
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertLess(source['maximumFaceDistanceError'],1e-9)
        self.assertLess(source['maximumIntermediateEquationResidual'],1e-9)
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertFalse(source['selfCollisionChecked'])
        self.assertGreater(max(p[2] for p in source['foldedForm3D'])-
                           min(p[2] for p in source['foldedForm3D']),span_min)

    def test_saved_square_pyramid_extension_and_overlap(self):
        # In[3566]: square, convergence=(0,0,.5), normal=(0,0,1),
        # TwistExtension=.5, overlap=True, CCW.
        result=closed_twist_topped_tube_geometry({
            'family':'closed-twist-topped-tube', 'points':SQUARE,
            'convergencePoint':[0,0,.5], 'twistNormal':[0,0,1],
            'twistExtension':.5, 'panelOverlap':True, 'twistDirection':'CCW'})
        self._check(result,23,37,15)
        source=result['source']
        self.assertEqual(source['twistPlaneHeights'],[0.,0.,0.,0.])
        self.assertAlmostEqual(source['lowerTubeLevel'],-1,places=11)
        # q[0] before extension is (1,sqrt(5)/2) in the net; the 3D
        # convergence vector from (1,1,0) has length 3/2. Extending by
        # .5 places q[0] at (-1/3,-1/3,2/3) in real space.
        q0=source['foldedForm3D'][18]
        self.assertAlmostEqual(q0[0],-1/3,places=11)
        self.assertAlmostEqual(q0[1],-1/3,places=11)
        self.assertAlmostEqual(q0[2],2/3,places=11)
        self.assertAlmostEqual(result['fold']['vertices_coords'][18][0],4/3,places=11)
        assignments=collections.Counter(result['fold']['edges_assignment'])
        self.assertEqual(assignments['B'],19)
        self.assertGreater(assignments['M'],0)
        self.assertGreater(assignments['V'],0)
        # The notebook deliberately preserves the seeded M/V type when a
        # numerically computed angle exceeds its 89° maximum.
        self.assertTrue(any(t=='V' and abs(a)>89 for t,a in zip(
            result['fold']['edges_assignment'],result['fold']['edges_foldAngle'])))
        for assignment,angle in zip(result['fold']['edges_assignment'],
                                    result['fold']['edges_foldAngle']):
            self.assertFalse(assignment=='M' and angle>0 or
                             assignment=='V' and angle<0)

    def test_saved_tilted_normal_and_offset_apex_cw(self):
        # In[3567]: ctr=(.4,0,.2), dir=(-.2,-.3,1), no overlap, CW.
        result=closed_twist_topped_tube_geometry({
            'family':'closed-twist-topped-tube','points':SQUARE,
            'convergencePoint':[.4,0,.2], 'twistNormal':[-.2,-.3,1],
            'panelOverlap':False,'twistDirection':'CW'})
        self._check(result,19,30,12)
        source=result['source']
        for actual,expected in zip(source['twistPlaneHeights'],[.5,.1,-.5,-.1]):
            self.assertAlmostEqual(actual,expected,places=11)
        self.assertAlmostEqual(source['lowerTubeLevel'],-1.5,places=11)
        for q in source['foldedForm3D'][-4:]:
            for actual,expected in zip(q,[.4,0,.2]):
                self.assertAlmostEqual(actual,expected,places=10)

    def test_no_extension_keeps_apex_coincident_but_not_planar(self):
        result=closed_twist_topped_tube_geometry({
            'family':'closed-twist-topped-tube','points':SQUARE,
            'convergencePoint':[0,0,.5]})
        self._check(result,19,30,12)
        self.assertEqual(len({tuple(p) for p in result['source']['foldedForm3D'][-4:]}),1)

    def test_saved_equal_chord_ellipse_both_extensions_choose_isometric_root(self):
        # In[3568]/In[3569]: m=16, a=GoldenRatio, b=1, center/normal
        # defaults, overlap=True, TypeMinimumAngle=45°, extension=.2/-.1.
        a=(1+math.sqrt(5))/2
        lengths=[math.dist(point,SAVED_ELLIPSE[(j+1)%16])
                 for j,point in enumerate(SAVED_ELLIPSE)]
        self.assertLess(max(lengths)-min(lengths),1e-12)
        self.assertAlmostEqual(lengths[0],.5169451124921098,places=12)
        for x,y in SAVED_ELLIPSE:
            self.assertAlmostEqual(x*x/(a*a)+y*y,1,places=12)
        for extension in (.2,-.1):
            result=closed_twist_topped_tube_geometry({
                'family':'closed-twist-topped-tube','points':SAVED_ELLIPSE,
                'twistExtension':extension,'panelOverlap':True,
                'typeMinimumAngleDeg':45})
            self._check(result,71,121,51,span_min=.9)
            # The sign of a geometrically flat 180° fold is ambiguous; the
            # seeded type from In[3565] supplies the sign for FOLD readback.
            self.assertTrue(any(t=='M' and abs(a)==180 for t,a in zip(
                result['fold']['edges_assignment'],result['fold']['edges_foldAngle'])))
            self.assertTrue(any(t=='V' and abs(a)==180 for t,a in zip(
                result['fold']['edges_assignment'],result['fold']['edges_foldAngle'])))
            for assignment,angle in zip(result['fold']['edges_assignment'],
                                        result['fold']['edges_foldAngle']):
                self.assertFalse(assignment=='M' and angle>0 or
                                 assignment=='V' and angle<0)
            flat=result['fold']['vertices_coords']
            spatial=result['source']['foldedForm3D']
            width=18
            perimeter=sum(lengths)
            for j in range(16):
                flat_prev=list(flat[width+(j-1)%16])
                if j==0:
                    flat_prev[0]-=perimeter
                flat_r=flat[2*width+j]
                space_prev=spatial[width+(j-1)%16]
                space_r=spatial[2*width+j]
                self.assertLess(abs(math.dist(flat_prev,flat_r)-
                                    math.dist(space_prev,space_r)),1e-9)

    def test_rejects_degenerate_plane_and_extra_parameters(self):
        base={'family':'closed-twist-topped-tube','points':SQUARE}
        with self.assertRaisesRegex(ValueError,'法向'):
            validate_closed_twist_topped_tube({**base,'twistNormal':[1,0,0]})
        with self.assertRaisesRegex(ValueError,'不支持'):
            validate_closed_twist_topped_tube({**base,'unknown':1})
        with self.assertRaisesRegex(ValueError,'赋型'):
            validate_closed_twist_topped_tube({**base,'typeMinimumAngleDeg':90,
                                               'typeMaximumAngleDeg':80})
        with self.assertRaisesRegex(ValueError,'相邻'):
            validate_closed_twist_topped_tube({**base,'points':[[0,0],[0,0],[1,0]]})


if __name__=='__main__':
    unittest.main()
