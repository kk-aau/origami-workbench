"""In[2872] ray assignments are source data, not a MILP preference."""
import json
import math
from pathlib import Path
import unittest
from collections import Counter
from unittest.mock import patch
from tessellate import generate, check_geometry, check_local_conditions
from tessellation_flat_embedding import flat_face_embedding
from tessellation_tile_patch import construct_tile_patch
from tessellation_meshes import custom_mesh
from tessellation_tile_twist import polygon_pleat_tile
from tessellation_split_exact import centered_tilt
from tessellation_archimedean_patch_catalog import two_colorable_archimedean_patch
from tessellation_lattice_patch import twist_patch_options
from tessellation_meshes import polygon_mesh

SQUARE=[[0.,0.],[1.,0.],[1.,1.],[0.,1.]]


def coordinate_assignments(fold):
    points=fold['vertices_coords']
    def key(a,b):return tuple(sorted((tuple(round(x,8) for x in a),tuple(round(x,8) for x in b))))
    return {key(points[a],points[b]):assignment for (a,b),assignment in zip(fold['edges_vertices'],fold['edges_assignment'])}


class PolygonSourceAssignmentsTests(unittest.TestCase):
    def assert_source_rays(self,fold,polygon,central,width,offset,types,ccw):
        points=fold['vertices_coords']
        def vertex(point):
            index=min(range(len(points)),key=lambda i:math.dist(points[i],point))
            self.assertLess(math.dist(points[index],point),1e-7)
            return index
        edges={tuple(sorted(pair)):assignment for pair,assignment in zip(fold['edges_vertices'],fold['edges_assignment'])}
        invert=lambda assignment:'V' if assignment=='M' else 'M'
        for i,(a,b) in enumerate(zip(polygon,polygon[1:]+polygon[:1])):
            j=(i+1)%len(polygon)
            first=[x+((1-width)/2+offset)*(y-x) for x,y in zip(a,b)]
            second=[x+((1+width)/2+offset)*(y-x) for x,y in zip(a,b)]
            c,d=vertex(central[i]),vertex(central[j])
            self.assertEqual(edges[tuple(sorted((c,d)))],types[i])
            self.assertEqual(edges[tuple(sorted((c,vertex(first))))],types[i] if ccw else invert(types[i]))
            self.assertEqual(edges[tuple(sorted((d,vertex(second))))],invert(types[i]) if ccw else types[i])

    def test_all_public_variants_keep_the_two_source_rays_for_each_central_edge(self):
        variants=[('general',dict(offset=.02,tilt=70,ccw=True)),
                  ('general',dict(offset=-.02,tilt=110,ccw=False)),
                  ('centered',dict(tilt=70)),('centered',dict(tilt=110)),
                  ('centered-angle',dict(twistAngle=35)),('centered-angle',dict(twistAngle=120)),
                  ('offset',dict(offset=.08)),('offset',dict(offset=-.08))]
        for variant,extra in variants:
            for types in (['M']*4,['V']*4,['M','V','M','V']):
                with self.subTest(variant=variant,extra=extra,types=types):
                    result=generate(dict(family='polygon-tile',variant=variant,polygon=SQUARE,width=.3,centralTypes=types,**extra))
                    detail=result['source'];fold=result['fold']
                    self.assert_source_rays(fold,SQUARE,detail['centralVertices'],.3,detail['offset'],types,detail['ccw'])
                    self.assertEqual(check_geometry(fold)['status'],'passed')
                    self.assertEqual(check_local_conditions(fold)['status'],'passed')
                    _,closure=flat_face_embedding(fold);self.assertLess(closure,1e-8)

    def test_explicit_incompatible_general_ccw_is_rejected_instead_of_repaired(self):
        for tilt,ccw in ((70,False),(110,True)):
            with self.subTest(tilt=tilt,ccw=ccw):
                # The old free-pleat helper returned a valid-looking opposite
                # direction with the exact same geometry, losing requested ccw.
                old,_,_=polygon_pleat_tile(SQUARE,.3,0,tilt,['M']*4,not ccw)
                self.assertEqual(check_local_conditions(old)['status'],'passed')
                with self.assertRaisesRegex(ValueError,'山谷赋型无解'):
                    generate(dict(family='polygon-tile',variant='general',polygon=SQUARE,
                                  width=.3,offset=0,tilt=tilt,ccw=ccw,centralTypes=['M']*4))

    def test_plain_recipe_direction_matches_centered_alt_and_perpendicular_offset_delegates(self):
        mother=custom_mesh(SQUARE,[[0,1,2,3]])
        recipes=[dict(width=.3,offset=0,tilt=70),dict(width=.3,offset=0,tilt=110),
                 dict(width=.3,offset=.08,tilt=90),dict(width=.3,offset=-.08,tilt=90),
                 dict(width=.3,offset=0,tilt=90),
                 dict(width=.3,offset=0,angleMode='twist',twistAngle=35),
                 dict(width=.3,offset=0,angleMode='twist',twistAngle=120)]
        for recipe in recipes:
            for types in (['M']*4,['V']*4,['M','V','M','V']):
                with self.subTest(recipe=recipe,types=types):
                    options={**recipe,'centralTypes':types}
                    fold=construct_tile_patch(mother,[options],SQUARE,[[0,1,2,3]],{'mergedEdges':'delete','collinearCleanup':False})
                    tilt=centered_tilt(recipe['width'],recipe['twistAngle']) if 'angleMode' in recipe else recipe['tilt']
                    ccw=(recipe['twistAngle']<90 if 'angleMode' in recipe else recipe['offset']>0 if tilt==90 and recipe['offset']!=0 else tilt<90)
                    _,_,detail=polygon_pleat_tile(SQUARE,.3,recipe['offset'],tilt,types,not ccw,preserve_source=True)
                    self.assert_source_rays(fold,SQUARE,detail['centralVertices'],.3,recipe['offset'],types,ccw)
                    self.assertEqual(check_geometry(fold)['status'],'passed')
                    self.assertEqual(check_local_conditions(fold)['status'],'passed')

    def test_old_valid_checkerboard_saved_cp_retains_every_edge_assignment(self):
        fixture=json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/p16-checkerboard-ff.json').read_text())
        params=dict(family='custom',vertices=fixture['vertices'],faces=fixture['faces'],
                    repeatX=1,repeatY=1,angle=36,scale=.3,customOutput='tile-twists',
                    tileTwists=[dict(width=.2,offset=0,tilt=tilt,centralTypes=[kind]*4)
                                for kind,tilt in zip(('M','V','V','M'),(70,110,110,70))])
        result=generate(params)
        self.assertEqual(coordinate_assignments(result['fold']),coordinate_assignments(fixture['fold']))
        self.assertEqual(check_geometry(result['fold'])['status'],'passed')
        self.assertEqual(check_local_conditions(result['fold'])['status'],'passed')

    def test_two_colorable_n9_fixed_source_rays_prove_the_seam_obstruction(self):
        source=two_colorable_archimedean_patch(9)
        options=twist_patch_options(source['sourceTiles'],[['V']*3,['M']*6,['V']*3],.2,
                                    variant='offset',offset=.1,parity=source['parity'])
        source_folds=[];legacy_folds=[]
        for polygon,recipe in zip(source['sourceTiles'],options):
            ccw=recipe['offset']>0
            fold,_,detail=polygon_pleat_tile(polygon,.2,recipe['offset'],90,recipe['centralTypes'],not ccw,preserve_source=True)
            self.assert_source_rays(fold,polygon,detail['centralVertices'],.2,recipe['offset'],recipe['centralTypes'],ccw)
            source_folds.append(fold)
            legacy_folds.append(polygon_pleat_tile(polygon,.2,recipe['offset'],90,recipe['centralTypes'])[0])
        self.assertEqual(coordinate_assignments(source_folds[0]),coordinate_assignments(legacy_folds[0]))
        self.assertNotEqual(coordinate_assignments(source_folds[1]),coordinate_assignments(legacy_folds[1]))
        self.assertEqual(coordinate_assignments(source_folds[2]),coordinate_assignments(legacy_folds[2]))
        witness=[.65,.606217782649107]
        def incident_types(folds):
            return Counter(assignment for f in folds for (a,b),assignment in zip(f['edges_vertices'],f['edges_assignment'])
                           if assignment in ('M','V') and min(math.dist(witness,f['vertices_coords'][v]) for v in (a,b))<1e-7)
        self.assertEqual(incident_types(source_folds),Counter(M=1,V=1))
        self.assertEqual(incident_types(legacy_folds),Counter(M=2))
        mother=polygon_mesh(source['sourceTiles'])
        monolithic={'mergedEdges':'delete','samePtTolerance':1e-8,'collinearCleanup':True,'collinearTolerance':1e-8}
        with self.assertRaisesRegex(ValueError,r'固定山谷不满足 Maekawa：顶点 \(0\.65, 0\.606217783\) 有 M=1、V=1'):
            construct_tile_patch(mother,options,mother['vertices_coords'],mother['faces_vertices'],monolithic)
        def legacy_plain(*args,**kwargs):return polygon_pleat_tile(*args[:5],preserve_source=False)
        with patch('tessellation_tile_patch.polygon_pleat_tile',legacy_plain):
            old=construct_tile_patch(mother,options,mother['vertices_coords'],mother['faces_vertices'],monolithic)
        self.assertEqual(check_geometry(old)['status'],'passed')
        self.assertEqual(check_local_conditions(old)['status'],'passed')


if __name__=='__main__':unittest.main()
