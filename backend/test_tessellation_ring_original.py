import itertools
import math
import unittest

from tessellate import check_geometry, check_local_conditions, generate, validate_request
from tessellation_ring_original import _VectorPolygon, _check_nested_curves, _polar_ray, circular_ring_pattern, compile_radius_expression, squaring_circle_radius_expressions, validate_vector_polygon


class OriginalRingTests(unittest.TestCase):
    def test_cartesian_vector_curve_uses_exact_first_segment_exit(self):
        square = _VectorPolygon(validate_vector_polygon([[1,1],[-1,1],[-1,-1],[1,-1]]))
        self.assertEqual(_polar_ray((1.,square), [.2,.1], [1.,.2]), [1.,.26])
        diagonal = _polar_ray((1.,square), [0.,0.], [1/math.sqrt(2)]*2)
        self.assertAlmostEqual(diagonal[0],1.)
        self.assertAlmostEqual(diagonal[1],1.)

    def test_cartesian_polygon_ring_has_exact_edges_and_rigid_flat_faces(self):
        square=[[1,1],[-1,1],[-1,-1],[1,-1]]
        params=dict(family='ring',ringMode='origamica',sides=8,rings=2,
                    outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15],
                    offsetAngle=13,angle=36,outerVectors=[square]*3,creaseVectors=[square]*2)
        result=generate(params)
        fold,flat=result['fold'],result['source']['foldedForm']
        self.assertEqual(result['source']['curveFamily'],'cartesian-polygon')
        self.assertEqual((len(fold['vertices_coords']),len(fold['edges_vertices']),len(fold['faces_vertices'])),(72,136,65))
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertEqual(check_local_conditions(fold)['status'],'passed')
        self.assertLess(result['source']['closureError'],1e-10)
        for x,y in fold['vertices_coords'][:8]:
            self.assertAlmostEqual(max(abs(x),abs(y)),1.,places=10)
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=8)

    def test_cartesian_vector_curves_reject_invalid_origin_and_nested_crossing(self):
        square=[[1,1],[-1,1],[-1,-1],[1,-1]]
        base=dict(family='ring',ringMode='origamica',sides=8,rings=1,
                  outerRadii=[1,1.8],creaseRadii=[1.35],offsetAngle=13,angle=36,
                  outerVectors=[square]*2,creaseVectors=[square])
        for row in ([[1,1],[0,0],[-1,1],[-1,-1],[1,-1]],
                    [[1,1],[1,-1],[-1,-1],[-1,1]],
                    [[2,1],[1,2],[0,1],[1,0]],
                    [[2,1],[0,1],[0,0]]):
            with self.subTest(row=row),self.assertRaises(ValueError):
                validate_request({**base,'outerVectors':[row,square]})
        bulge=[[1.5,1],[-1,1],[-1,-1],[1.5,-1]]
        with self.assertRaisesRegex(ValueError,'嵌套'):
            generate({**base,'outerVectors':[square,square],'creaseVectors':[bulge]})
        with self.assertRaises(ValueError):
            validate_request({**base,'outerExpressions':['r','r'],'creaseExpressions':['r']})

    def test_origin_visible_concave_vector_ring_keeps_exact_fold_geometry(self):
        circle=[[math.cos(i*math.pi/4),math.sin(i*math.pi/4)] for i in range(8)]
        star=[[x*(.65 if i%2 else 1),y*(.65 if i%2 else 1)]
              for i,(x,y) in enumerate(circle)]
        self.assertEqual(validate_vector_polygon(star),star)
        curve=_VectorPolygon(star)
        self.assertAlmostEqual(_polar_ray((2.,curve),[.1,0],[1,0])[0],2.)
        notch=_polar_ray((1.,curve),[0.,0.],[1/math.sqrt(2)]*2)
        self.assertAlmostEqual(notch[0],.65/math.sqrt(2),places=10)
        self.assertAlmostEqual(notch[1],.65/math.sqrt(2),places=10)
        inner=[[.95,0],[0,.95],[-.95,0],[0,-.95]]
        with self.assertRaisesRegex(ValueError,'嵌套'):
            _check_nested_curves((1.,_VectorPolygon(validate_vector_polygon(inner))),
                                 (1.,curve))
        params=dict(family='ring',ringMode='origamica',sides=6,rings=2,
                    outerRadii=[.2,1.4,3],creaseRadii=[.8,2.2],angle=20,offsetAngle=0,
                    outerVectors=[circle,star,circle],creaseVectors=[circle,circle])
        result=generate(params)
        fold,flat=result['fold'],result['source']['foldedForm']
        self.assertEqual(len(fold['vertices_coords']),54)
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertEqual(check_local_conditions(fold)['status'],'passed')
        self.assertLess(result['source']['closureError'],1e-10)
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=8)

    def test_notebook_squaring_circle_functions_equal_polar_formulas(self):
        outer, middle = squaring_circle_radius_expressions(3)
        self.assertEqual(len(outer), 4)
        self.assertEqual(len(middle), 3)
        for i in range(4):
            radius = .75+i
            formula = compile_radius_expression(outer[i])
            for parameter in (-3.1, -2.4, -math.pi/2, -.7, 0., .42, math.pi/2, 2.7):
                # Original notebook: F(x,i)=Sign[x] Abs[x]^(1/(1+i));
                # pfn[i](t)=(.75+i){F(Cos t,i),F(Sin t,i)}.
                def notebook_component(value):
                    return math.copysign(abs(value)**(1/(i+1)), value)
                x = radius*notebook_component(math.cos(parameter))
                y = radius*notebook_component(math.sin(parameter))
                self.assertAlmostEqual(formula(radius, math.atan2(y, x)),
                                       math.hypot(x, y), places=10)
        for i in range(3):
            self.assertAlmostEqual(compile_radius_expression(middle[i])(1+i,.31),
                                   compile_radius_expression(outer[i])(.75+i,.31)*(1+i)/(.75+i), places=11)

    def test_notebook_squaring_circle_example_has_rigid_flat_faces(self):
        outer, middle = squaring_circle_radius_expressions(3)
        params = dict(family='ring',ringMode='origamica',sides=20,rings=3,
                      outerRadii=[.75,1.75,2.75,3.75],creaseRadii=[1.,2.,3.],
                      angle=45,offsetAngle=6,
                      outerExpressions=outer,creaseExpressions=middle)
        validated = validate_request(params)
        self.assertEqual((validated['sides'],validated['rings']),(20,3))
        result = generate(params)
        fold, flat, closure = result['fold'],result['source']['foldedForm'],result['source']['closureError']
        self.assertEqual(result['source']['curveFamily'],'analytic-polar')
        self.assertEqual((len(fold['vertices_coords']),len(fold['edges_vertices']),len(fold['faces_vertices'])),
                         (260,500,241))
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertEqual(check_local_conditions(fold)['status'], 'passed')
        self.assertLess(closure, 1e-10)
        for i, radius in enumerate([.75,1.75,2.75,3.75]):
            indices = range(20) if i == 0 else range(20+80*(i-1)+40,20+80*(i-1)+60)
            power = 2*(i+1)
            for index in indices:
                x,y = fold['vertices_coords'][index]
                self.assertAlmostEqual((abs(x)/radius)**power+(abs(y)/radius)**power,1.,places=9)
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=8)

    def test_analytic_ray_uses_first_crossing_even_between_coarse_samples(self):
        frequency = 512
        curve = (1., compile_radius_expression('r*(1+0.4*cos(512*phi))'))
        intersection = _polar_ray(curve, [.9, 0.], [0., 1.])
        # On the first half-wave the radius decreases strictly while distance
        # from the origin increases, so its crossing is unique.
        end = .9*math.tan(math.pi/frequency)
        def signed(t):
            return math.hypot(.9,t)-(1+.4*math.cos(frequency*math.atan2(t,.9)))
        self.assertLess(signed(0), 0)
        self.assertGreater(signed(end), 0)
        low, high = 0., end
        for _ in range(50):
            middle = (low+high)/2
            if signed(middle) < 0:low = middle
            else:high = middle
        self.assertAlmostEqual(intersection[1], (low+high)/2, places=9)
        self.assertLess(intersection[1], .004)

    def test_analytic_ray_through_origin_preserves_first_outer_intersection(self):
        curve=(1.,compile_radius_expression('r*(1+0.08*sin(phi))'))
        point=_polar_ray(curve,[.2,0.],[-1.,0.])
        self.assertAlmostEqual(point[0],-1.,places=10)
        self.assertAlmostEqual(point[1],0.,places=10)

    def test_analytic_nesting_rejects_crossing_hidden_between_sample_angles(self):
        params=dict(family='ring',ringMode='origamica',sides=8,rings=1,
                    outerRadii=[1.,1.8],creaseRadii=[1.35],angle=36,
                    outerExpressions=['r*(1+0.4*sin(256*phi)**8)','r'],
                    creaseExpressions=['r'])
        # Every old 256-point grid sample sees the inner radius as exactly 1,
        # although it rises to 1.4 and crosses the middle ring between samples.
        self.assertTrue(all(1+.4*math.sin(256*math.tau*j/256)**8<1.35 for j in range(256)))
        with self.assertRaisesRegex(ValueError,'嵌套'):
            generate(params)

    def test_analytic_curve_rejects_negative_radius_hidden_between_samples(self):
        params=dict(family='ring',ringMode='origamica',sides=8,rings=1,
                    outerRadii=[1.,1.8],creaseRadii=[1.35],angle=36,
                    outerExpressions=['r*(1-2*sin(256*phi)**8)','r'],
                    creaseExpressions=['r'])
        self.assertTrue(all(1-2*math.sin(256*math.tau*j/256)**8>0 for j in range(256)))
        with self.assertRaisesRegex(ValueError,'正半径'):
            generate(params)

    def test_direct_analytic_polar_formulas_preserve_original_ring_geometry(self):
        formula='r*(1+0.08*cos(2*phi))'
        params=dict(family='ring',ringMode='origamica',sides=8,rings=2,
                    outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15],offsetAngle=13,
                    outerExpressions=[formula]*3,creaseExpressions=[formula]*2,angle=36)
        result=generate(params)
        fold=result['fold'];flat=result['source']['foldedForm']
        self.assertEqual(result['source']['curveFamily'],'analytic-polar')
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        self.assertLess(result['source']['closureError'],1e-9)
        phi=math.radians(13)
        self.assertAlmostEqual(math.hypot(*fold['vertices_coords'][0]),1+.08*math.cos(2*phi),places=11)
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),math.dist(flat[a],flat[b]),places=8)
        circle=generate({key:value for key,value in params.items() if key not in ('outerExpressions','creaseExpressions')})
        self.assertNotEqual(fold['vertices_coords'],circle['fold']['vertices_coords'])
        constant=generate({**{key:value for key,value in params.items() if key not in ('outerExpressions','creaseExpressions')},
                           'outerExpressions':['r']*3,'creaseExpressions':['r']*2})
        self.assertLess(max(math.dist(a,b) for a,b in zip(constant['fold']['vertices_coords'],circle['fold']['vertices_coords'])),1e-10)
        profile=[1+.08*math.cos(2*math.tau*i/64) for i in range(64)]
        sampled=generate({**{key:value for key,value in params.items() if key not in ('outerExpressions','creaseExpressions')},
                          'outerProfiles':[profile]*3,'creaseProfiles':[profile]*2})
        self.assertGreater(math.dist(fold['vertices_coords'][0],sampled['fold']['vertices_coords'][0]),1e-6,
                           'analytic mode evaluates the formula at the actual phase instead of interpolating samples')

    def test_analytic_formula_validation_rejects_unsafe_or_unstable_expressions(self):
        valid=compile_radius_expression('r*(1+0.08*cos(2*phi))')
        self.assertAlmostEqual(valid(1.35,.2),1.35*(1+.08*math.cos(.4)))
        for expression in ('__import__("os")','r.__class__','sin(phi)[0]','sin','r if phi else 1',
                           '10**(10**10)','r/0','sqrt(-1)','-r','sin(1000*phi)**1000',
                           'r**(phi/2)','r**(1/0)','r**-1','r**(2**3)','(-1)**(1/2)'):
            with self.subTest(expression=expression),self.assertRaises(ValueError):
                formula=compile_radius_expression(expression)
                formula(1,.2)
        base=dict(family='ring',ringMode='origamica',rings=1,outerRadii=[1,1.8],creaseRadii=[1.35],angle=36)
        for patch in ({'outerExpressions':['r']},
                      {'outerExpressions':['r','r'],'creaseExpressions':['r'],'outerProfiles':[[1]*8]*2,'creaseProfiles':[[1]*8]},
                      {'outerExpressions':['r*(1+phi/10)','r'],'creaseExpressions':['r']},
                      {'outerExpressions':['r','r'],'creaseExpressions':['__import__("os")']}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({**base,**patch})

    def test_sampled_polar_curves_change_shape_and_preserve_rigid_faces(self):
        profile=[1+.08*math.cos(math.tau*i/8*2) for i in range(8)]
        fold,flat,closure=circular_ring_pattern(8,[1,1.8,2.6],[1.35,2.15],36,0,[profile]*3,[profile]*2)
        circle,_,_=circular_ring_pattern(8,[1,1.8,2.6],[1.35,2.15],36)
        self.assertNotEqual(fold['vertices_coords'],circle['vertices_coords'])
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertEqual(check_local_conditions(fold)['status'],'passed')
        self.assertLess(closure,1e-10)
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=8)
        params=dict(family='ring',ringMode='origamica',sides=8,rings=2,
                    outerRadii=[1,1.8,2.6],creaseRadii=[1.35,2.15],offsetAngle=0,
                    outerProfiles=[profile]*3,creaseProfiles=[profile]*2,angle=36)
        result=generate(params)
        self.assertEqual(result['source']['curveFamily'],'sampled-polar')
        with self.assertRaises(ValueError):validate_request({**params,'creaseProfiles':[[1]*4]*2})

    def test_propagation_assignments_and_rigid_faces(self):
        for sides, rings, angle, phase in ((5, 1, 25, 0), (8, 2, 36, 13), (10, 3, 45, -22)):
            with self.subTest(sides=sides, rings=rings, angle=angle):
                p = [1 + .8 * i for i in range(rings+1)]
                r = [value + .35 for value in p[:-1]]
                fold, flat, closure = circular_ring_pattern(sides, p, r, angle, phase)
                self.assertEqual(len(fold['vertices_coords']), sides * (1 + 4 * rings))
                self.assertEqual(len(fold['edges_vertices']), sides * (1 + 8 * rings))
                self.assertEqual(len(fold['faces_vertices']), 1 + 4 * sides * rings)
                self.assertEqual(fold['edges_assignment'].count('M'), 4 * sides * rings)
                self.assertEqual(fold['edges_assignment'].count('V'), (4 * rings - 1) * sides)
                self.assertEqual(fold['edges_assignment'].count('B'), 2 * sides)
                self.assertEqual(check_geometry(fold)['status'], 'passed')
                self.assertEqual(check_local_conditions(fold)['status'], 'passed')
                self.assertLess(closure, 1e-12)
                for face in fold['faces_vertices']:
                    for a, b in itertools.combinations(face, 2):
                        self.assertAlmostEqual(math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b]),
                                               math.dist(flat[a], flat[b]), places=8)

    def test_api_and_legacy_ring_are_distinct(self):
        params = dict(family='ring', ringMode='origamica', sides=8, rings=2, growth=1.8,
                      outerRadii=[1, 1.8, 2.6], creaseRadii=[1.35, 2.15],
                      offsetAngle=9, angle=36, scale=.3)
        result = generate(params)
        self.assertEqual(result['source']['curveFamily'], 'circles')
        self.assertEqual(len(result['source']['foldedForm']), result['stats']['vertices'])
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        legacy = generate(dict(family='ring', sides=8, rings=2, growth=1.8, angle=36, scale=.3))
        self.assertNotEqual(result['fold']['vertices_coords'], legacy['fold']['vertices_coords'])
        self.assertNotIn('foldedForm', legacy['source'])

    def test_bad_radii_and_unrelated_options_rejected(self):
        base = dict(family='ring', ringMode='origamica', rings=2, outerRadii=[1, 1.8, 2.6],
                    creaseRadii=[1.35, 2.15], angle=36)
        changes = ({'outerRadii':[1, 1.8]}, {'creaseRadii':[1.9, 2.15]},
                   {'angle':-36}, {'radii':[1, 2]}, {'dualTargets':[[0, 0], [1, 1]]},
                   {'pruneBoundary':[[0, 0], [1, 0], [0, 1]]}, {'parameterization':'gamma-alpha'})
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_request({**base, **change})


if __name__ == '__main__':
    unittest.main()
