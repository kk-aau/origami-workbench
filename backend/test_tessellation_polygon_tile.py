import math
import unittest
from tessellate import generate,validate_request


class PolygonTileTests(unittest.TestCase):
    def test_all_variants_regular_polygons_are_flat_and_preserve_boundary_widths(self):
        for variant,extra in [('general',{'offset':.02}),('centered',{}),('centered-angle',{}),('offset',{})]:
            for n in (3,4,5,6,8,12):
                with self.subTest(variant=variant,n=n):
                    polygon=[[math.cos(i*math.tau/n),math.sin(i*math.tau/n)] for i in range(n)]
                    result=generate(dict(family='polygon-tile',variant=variant,polygon=polygon,**extra))
                    self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                    self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                    details=result['source'];fold=result['fold'];offset=details['offset'];width=details['width']
                    central=details['centralVertices']
                    for i,(a,b) in enumerate(zip(polygon,polygon[1:]+polygon[:1])):
                        edge=[y-x for x,y in zip(a,b)]
                        for fraction,q in [((1-width)/2+offset,central[i]),((1+width)/2+offset,central[(i+1)%n])]:
                            endpoint=[x+fraction*d for x,d in zip(a,edge)]
                            self.assertLess(min(math.dist(endpoint,p) for p in fold['vertices_coords']),1e-8)
                            ray=[y-x for x,y in zip(endpoint,q)]
                            angle=math.degrees(math.atan2(edge[0]*ray[1]-edge[1]*ray[0],sum(x*y for x,y in zip(edge,ray))))
                            self.assertAlmostEqual(angle,details['pleatAngle'],places=7)

    def test_requested_center_assignments_and_direction(self):
        for ccw in (False,True):
            for types in [['M']*4,['V']*4,['M','V','M','V']]:
                result=generate(dict(family='polygon-tile',variant='general',ccw=ccw,
                                     tilt=70 if ccw else 110,centralTypes=types))
                fold=result['fold'];central=result['source']['centralVertices']
                indices=[min(range(len(fold['vertices_coords'])),key=lambda i:math.dist(p,fold['vertices_coords'][i])) for p in central]
                edges={tuple(sorted(e)):t for e,t in zip(fold['edges_vertices'],fold['edges_assignment'])}
                self.assertEqual([edges[tuple(sorted((a,b)))] for a,b in zip(indices,indices[1:]+indices[:1])],types)
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')

    def test_centered_angle_converts_to_same_geometric_construction(self):
        for alpha in (25,35,120,150):
            a=generate(dict(family='polygon-tile',variant='centered-angle',twistAngle=alpha))
            b=generate(dict(family='polygon-tile',variant='centered',tilt=a['source']['pleatAngle']))
            self.assertEqual(a['fold'],b['fold'])
            tau=math.radians(a['source']['pleatAngle']);angle=math.radians(alpha)
            self.assertAlmostEqual(math.sin(angle)*math.cos(tau)-.3*math.cos(angle)*math.sin(tau),0,places=12)

    def test_reject_invalid_geometry_parameters_and_nonflat_general_tile(self):
        for extra in ({'centralTypes':['M']},{'width':.8,'offset':.2},{'tilt':0},{'ccw':1},{'polygon':[[0,0],[1,0],[1,1],[.5,.2],[0,1]]}):
            with self.subTest(extra=extra),self.assertRaises(ValueError):generate(dict(family='polygon-tile',variant='general',**extra))
        with self.assertRaisesRegex(ValueError,'平折角度'):
            generate(dict(family='polygon-tile',polygon=[[0,0],[1,0],[1.1,1.4],[-.2,1]]))
        with self.assertRaises(ValueError):validate_request(dict(family='polygon-tile',variant='offset',tilt=90))
