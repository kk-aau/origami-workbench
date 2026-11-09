import math
import unittest
from tessellate import generate, validate_request
from tessellation_parameters import post_rotation
from tessellation_primal_dual_fold import direct_folded_form, folded_form_scale_rotation


class ParameterTests(unittest.TestCase):
    @staticmethod
    def edge_geometry(fold, coords=None):
        ps=coords if coords is not None else fold['vertices_coords']
        return sorted((tuple(sorted(tuple(round(v,8) for v in ps[i]) for i in edge)),kind) for edge,kind in zip(fold['edges_vertices'],fold['edges_assignment']))

    def test_original_formula_and_no_clamping(self):
        for gamma in (.01, .5, 1, 2, 100):
            for alpha in (.1, 30, 75, 89.9):
                for direction in ('cw', 'ccw'):
                    p = validate_request(dict(family='primal-dual',parameterization='gamma-alpha',gamma=gamma,pleatAngle=alpha,twistDirection=direction))
                    a = math.radians(alpha)
                    d = math.sqrt(1+gamma*gamma+2*gamma*math.sin(a))
                    self.assertAlmostEqual(p['scale'],gamma/d,places=12)
                    self.assertAlmostEqual(p['angle'],(1 if direction=='ccw' else -1)*math.degrees(math.acos((gamma+math.sin(a))/d)),places=7)
        for patch in ({'gamma':0},{'pleatAngle':-30},{'gamma':True},{'twistDirection':'bad'},{'postRotation':'bad'}):
            with self.assertRaises(ValueError):validate_request(dict(family='periodic',parameterization='gamma-alpha',**patch))
        for data in ({'family':'twist','postRotation':'none'},{'family':'primal-dual','gamma':1}):
            with self.assertRaises(ValueError):validate_request(data)

    def test_equivalent_cp_and_postrotation_isometry(self):
        for family,extra in [('periodic',{'rows':2,'columns':2}),('primal-dual',{'rings':1}),('archimedean',{'tiling':'3.6.3.6'}),('nonperiodic',{'kind':'penrose','penroseVersion':'origamica','depth':2}),('ring',{'sides':6})]:
            data=dict(family=family,parameterization='gamma-alpha',gamma=.5,pleatAngle=30,**extra)
            base=generate(data)
            p=base['stats']['parameters']
            old=generate(dict(family=family,angle=p['angle'],scale=p['scale'],**extra))
            self.assertEqual(self.edge_geometry(base['fold']),self.edge_geometry(old['fold']))
            for mode in ('primal','dual'):
                result=generate({**data,'postRotation':mode})
                angle=post_rotation({**p,'postRotation':mode});c,s=math.cos(angle),math.sin(angle)
                self.assertEqual(sorted(tuple(round(v,8) for v in p) for p in result['preview']['vertices']),sorted(tuple(round(v,8) for v in p) for p in base['preview']['vertices']))
                rotated=[[c*x-s*y,s*x+c*y] for x,y in base['fold']['vertices_coords']]
                self.assertEqual(self.edge_geometry(base['fold'],rotated),self.edge_geometry(result['fold']))
                self.assertEqual(result['stats']['checks']['geometry']['status'],base['stats']['checks']['geometry']['status'])

    def test_postrotation_retains_primal_or_dual_direction(self):
        # q = rho*exp(i beta)*p + (1-rho*exp(i beta))*d.
        for sign in (-1,1):
            p=validate_request(dict(family='periodic',parameterization='gamma-alpha',gamma=.8,pleatAngle=42,twistDirection='cw' if sign<0 else 'ccw'))
            z=p['scale']*complex(math.cos(math.radians(p['angle'])),math.sin(math.radians(p['angle'])))
            for mode,coefficient in [('primal',z),('dual',1-z)]:
                a=post_rotation({**p,'postRotation':mode});rotated=coefficient*complex(math.cos(a),math.sin(a))
                self.assertAlmostEqual(rotated.imag,0,places=12);self.assertGreater(rotated.real,0)

    def test_original_negative_alpha_ff_is_an_isometric_ordered_embedding(self):
        scale,turn=folded_form_scale_rotation(.8,20)
        self.assertAlmostEqual(scale,.7068324682203342,places=12)
        self.assertAlmostEqual(math.degrees(turn),-24.567994939597185,places=10)
        cw_scale,cw_turn=folded_form_scale_rotation(.8,20,'cw')
        self.assertAlmostEqual(cw_scale,scale,places=12)
        self.assertAlmostEqual(cw_turn,-turn,places=12)
        for family,extra in [('periodic',{'rows':2,'columns':2}),('primal-dual',{'rings':1}),
                             ('archimedean',{'tiling':'3.6.3.6'})]:
            for post in ('none','primal','dual'):
                result=generate(dict(family=family,parameterization='gamma-alpha',gamma=.8,
                                     pleatAngle=20,postRotation=post,**extra))
                fold=result['fold'];flat=result['source']['foldedForm']
                self.assertEqual(len(flat),len(fold['vertices_coords']))
                self.assertLess(result['source']['foldedFormMaxIsometryError'],1e-8)
                for u,v in fold['edges_vertices']:
                    self.assertAlmostEqual(math.dist(flat[u],flat[v]),
                                           math.dist(fold['vertices_coords'][u],fold['vertices_coords'][v]),places=7)

    def test_direct_ff_refuses_missing_or_nonisometric_recipe(self):
        result=generate(dict(family='periodic',rows=2,columns=2,parameterization='gamma-alpha',
                             gamma=.8,pleatAngle=20))
        fold=result['fold'];recipe=result['preview'];params=result['stats']['parameters']
        with self.assertRaisesRegex(ValueError,'缺少'):
            direct_folded_form(fold,None,params)
        broken={'kind':'shrink-rotate','vertices':[list(v) for v in recipe['vertices']]}
        broken['vertices'][0][2]+=1
        with self.assertRaisesRegex(ValueError,'不闭合'):
            direct_folded_form(fold,broken,params)
        single=generate(dict(family='primal-dual',rings=0,parameterization='gamma-alpha',
                             gamma=.8,pleatAngle=20))
        self.assertNotIn('foldedForm',single['source'])
        self.assertEqual(single['source']['foldedFormStatus'],'unavailable')

    def test_direct_ff_checks_face_diagonals_not_only_edge_lengths(self):
        # A unit square and a 60-degree rhombus have the same four edge
        # lengths, but no rigid flat fold can turn the square face into it.
        target=[[0,0],[1,0],[1.5,math.sqrt(3)/2],[.5,math.sqrt(3)/2]]
        fold={'vertices_coords':[[0,0],[1,0],[1,1],[0,1]],
              'edges_vertices':[[0,1],[1,2],[2,3],[3,0]],
              'faces_vertices':[[0,1,2,3]]}
        params=validate_request(dict(family='periodic',parameterization='gamma-alpha',
                                     gamma=.8,pleatAngle=20))
        m,phi=folded_form_scale_rotation(.8,20)
        c,s=math.cos(phi),math.sin(phi)
        recipe={'kind':'shrink-rotate','vertices':[
            [(c*x+s*y)/m,(-s*x+c*y)/m,0,0] for x,y in target]}
        _,edge_error=direct_folded_form({**fold,'faces_vertices':[]},recipe,params)
        self.assertLess(edge_error,1e-12)
        with self.assertRaisesRegex(ValueError,'纸面面内距离不闭合'):
            direct_folded_form(fold,recipe,params)


if __name__=='__main__':unittest.main()
