import unittest
import itertools
import math

from tessellate import generate, validate_request
from tessellation_tile_twist import polygon_pleat_tile
from tessellation_tile_patch import construct_tile_patch
from tessellation_split_exact import exact_split, DEFAULT_POLYGON
from tessellation_split_exact import centered_tilt


GRID = dict(family='custom', vertices=[[0,0],[.5,0],[1,0],[0,.5],[.5,.5],[1,.5],[0,1],[.5,1],[1,1]],
            faces=[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]], repeatX=1, repeatY=1,
            customOutput='tile-twists', angle=36, scale=.3)


def twists(angles=(70,110,110,70)):
    return [dict(width=.2, offset=0, tilt=t, centralTypes=[['M','V','V','M'][i]]*4)
            for i,t in enumerate(angles)]


class TilePatchTests(unittest.TestCase):
    def test_original_centered_alt_tiles_hold_twist_angle_when_width_changes(self):
        # Origamica In[2905]/In[2960] delegates the (w, alpha) tile to its
        # centered (w, tau) constructor using CenteredTwistTiltAngle[w,alpha].
        # Four joined squares exercise both alpha branches and real seams.
        alpha=math.degrees(math.atan2(.2*math.sin(math.radians(70)),
                                      math.cos(math.radians(70))))
        for width in (.2,.32):
            with self.subTest(width=width):
                angles=(alpha,180-alpha,180-alpha,alpha)
                choices=[dict(width=width,offset=0,angleMode='twist',
                              twistAngle=angle,centralTypes=[kind]*4)
                         for angle,kind in zip(angles,('M','V','V','M'))]
                request={**GRID,'tileTwists':choices}
                validated=validate_request(request)
                self.assertEqual(validated['tileTwists'],choices)
                result=generate(request)
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                self.assertLess(result['source']['closureError'],1e-8)
                self.assertEqual(result['source']['tileTwists'],choices)
                # The independent inverse formula proves alpha is the held
                # parameter, while tau changes when the width changes.
                tau=math.degrees(math.atan2(math.sin(math.radians(alpha)),
                                            width*math.cos(math.radians(alpha))))
                self.assertAlmostEqual(centered_tilt(width,alpha),tau,places=12)
                expected=[dict(width=width,offset=0,tilt=centered_tilt(width,angle),
                               centralTypes=[kind]*4)
                          for angle,kind in zip(angles,('M','V','V','M'))]
                explicit=generate({**GRID,'tileTwists':expected})
                self.assertEqual(result['fold']['vertices_coords'],explicit['fold']['vertices_coords'])
                self.assertEqual(result['fold']['edges_vertices'],explicit['fold']['edges_vertices'])
                self.assertEqual(result['fold']['faces_vertices'],explicit['fold']['faces_vertices'])
        for bad in ({**choices[0],'offset':.03},
                    {**choices[0],'twistAngle':float('nan')},
                    {**choices[0],'tilt':70},
                    {**choices[0],'twistAngle':180}):
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                validate_request({**GRID,'tileTwists':[bad,*choices[1:]]})

    def test_original_centered_split_alt_derives_direction_from_alpha(self):
        # Origamica In[2960] sets offset 0, tau from (w, alpha), and
        # ccw=(alpha<90 degrees) for the split quadrilateral tile.
        source=DEFAULT_POLYGON
        mother=generate(dict(family='custom',vertices=source,faces=[[0,1,2,3]],
                             repeatX=1,repeatY=1,customOutput='tiling'))['mother']
        common=dict(width=.2,offset=0,centralTypes=['V','M','M','M'],
                    construction='split',baseVertex=1,connection='M')
        alpha=30
        alt={**common,'angleMode':'twist','twistAngle':alpha}
        validated=validate_request(dict(family='custom',vertices=source,faces=[[0,1,2,3]],
                                        repeatX=1,repeatY=1,customOutput='tile-twists',
                                        tileTwists=[alt]))
        self.assertEqual(validated['tileTwists'][0],alt)
        actual=construct_tile_patch(mother,[alt],source,[[0,1,2,3]])
        explicit=construct_tile_patch(mother,[{**common,'tilt':centered_tilt(.2,alpha),
                                                'ccw':True}],source,[[0,1,2,3]])
        self.assertEqual(actual['vertices_coords'],explicit['vertices_coords'])
        self.assertEqual(actual['edges_vertices'],explicit['edges_vertices'])
        self.assertEqual(actual['edges_assignment'],explicit['edges_assignment'])
        with self.assertRaises(ValueError):
            validate_request({**validated,'tileTwists':[{**alt,'ccw':True}]})

    def test_original_monolithic_collinear_cleanup_and_explicit_edge_mode(self):
        # The saved In[2984] call uses MonolithicEmbedTiling's two True
        # defaults: KillMergedEdges and CollinearCleanup.  Older workbench
        # projects intentionally retain their pre-option straight vertices.
        vertices=[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]]
        faces=[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]]
        mother=generate(dict(family='custom',vertices=vertices,faces=faces,
                             repeatX=1,repeatY=1,customOutput='tiling'))['mother']
        choices=[dict(width=.18,offset=0,tilt=centered_tilt(.18,30),
                      centralTypes=[kind]*4) for kind in ('V','M','M','V')]
        original=construct_tile_patch(mother,choices,vertices,faces,{
            'mergedEdges':'delete','samePtTolerance':1e-8,
            'collinearCleanup':True,'collinearTolerance':1e-8})
        legacy=construct_tile_patch(mother,choices,vertices,faces)
        self.assertEqual((len(original['vertices_coords']),len(original['edges_vertices']),
                          len(original['faces_vertices'])),(36,60,25))
        self.assertEqual((len(legacy['vertices_coords']),len(legacy['edges_vertices']),
                          len(legacy['faces_vertices'])),(48,72,25))
        self.assertEqual(original['zhezhi_merged_edge_mode'],'delete')
        request=dict(family='custom',vertices=vertices,faces=faces,repeatX=1,repeatY=1,
                     customOutput='tile-twists',tileTwists=choices,
                     monolithicOptions=original['zhezhi_monolithic_options'])
        result=generate(request)
        self.assertEqual((result['stats']['vertices'],result['stats']['edges'],
                          result['stats']['faces']),(36,60,25))
        self.assertEqual(result['source']['monolithicOptions'],request['monolithicOptions'])
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        self.assertEqual(len(result['source']['foldedForm']),36)
        self.assertLess(result['source']['closureError'],1e-8)
        with self.assertRaises(ValueError):
            construct_tile_patch(mother,choices,vertices,faces,{
                'mergedEdges':'retain','samePtTolerance':1e-8,
                'collinearCleanup':True,'collinearTolerance':1e-8})
        for invalid in ({**request['monolithicOptions'],'samePtTolerance':True},
                        {**request['monolithicOptions'],'collinearTolerance':-1},
                        {**request['monolithicOptions'],'mergedEdges':'unknown'},
                        {**request['monolithicOptions'],'unrecognized':1}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_request({**request,'monolithicOptions':invalid})
        with self.assertRaises(ValueError):
            validate_request({**request,'customOutput':'tiling'})

    def test_original_monolithic_four_square_alt_twist_uses_deleted_glue_edges(self):
        # Origamica In[2984]: UnitRegularPolygonVertices[4], w=.18,
        # alpha=30 degrees, center types V/M/M/V. There is no stored numeric
        # graph in the notebook, so compare the independent angle/line
        # intersection equations and CP/FF invariants of that saved input.
        unit_grid=dict(family='custom',
                       vertices=[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
                       faces=[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]],
                       repeatX=1,repeatY=1,customOutput='tile-twists')
        width=.18
        alpha=math.radians(30)
        tilt=math.degrees(math.atan2(math.sin(alpha),width*math.cos(alpha)))
        self.assertAlmostEqual(tilt,centered_tilt(width,30),places=12)
        choices=[dict(width=width,offset=0,tilt=tilt,centralTypes=[kind]*4)
                 for kind in ('V','M','M','V')]
        result=generate({**unit_grid,'tileTwists':choices})
        fold=result['fold']
        self.assertEqual(fold['zhezhi_merged_edge_mode'],'delete')
        self.assertEqual(result['source']['mergedEdgeMode'],'delete')
        self.assertEqual((result['stats']['vertices'],result['stats']['edges'],result['stats']['faces']),
                         (48,72,25))
        self.assertEqual({kind:fold['edges_assignment'].count(kind) for kind in ('M','V','B','U')},
                         {'M':24,'V':24,'B':24,'U':0})
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        self.assertLess(result['source']['closureError'],1e-8)
        # Shared glue borders are no longer creases; five merged CP faces
        # cross tile seams and therefore correctly have no single tile owner.
        self.assertEqual(fold['zhezhi_face_tile_instance'].count(-1),5)
        c,s=math.cos(math.radians(tilt)),math.sin(math.radians(tilt))
        distance=.41*(s-c)
        expected=[.41+distance*c,distance*s]
        tile,_,details=polygon_pleat_tile([[0,0],[1,0],[1,1],[0,1]],width,0,tilt,['V']*4)
        self.assertLess(math.dist(details['centralVertices'][0],expected),1e-12)
        self.assertTrue(any(math.dist(point,expected)<1e-8 for point in fold['vertices_coords']))
        flat=result['source']['foldedForm']
        for face in fold['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=7)

    def test_mixed_original_split_quadrilateral_and_triangle_form_one_isometric_patch(self):
        # Origamica QuadrilateralOffsetSplitTwistTile and MonolithicEmbedTiling:
        # the upper quad matches the notebook's saved split vertex example.
        vertices=[*DEFAULT_POLYGON,[.5,-math.sqrt(3)/2]]
        split=dict(width=.15,offset=0,tilt=70,centralTypes=['V','M','M','M'],
                   construction='split',baseVertex=1,connection='M',ccw=True)
        ordinary=dict(width=.15,offset=0,tilt=110,centralTypes=['M']*3)
        params={**GRID,'vertices':vertices,'faces':[[0,1,2,3],[1,0,4]],
                'tileTwists':[split,ordinary]}
        result=generate(params)
        self.assertEqual(result['stats']['tiles'],2)
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        self.assertEqual(result['stats']['faces'],18)
        self.assertEqual(result['fold']['zhezhi_face_tile_instance'].count(0),11)
        self.assertEqual(result['fold']['zhezhi_face_tile_instance'].count(1),7)
        self.assertEqual(result['fold']['zhezhi_face_tile_source'],
                         result['fold']['zhezhi_face_tile_instance'])
        self.assertLess(result['source']['closureError'],1e-8)
        def edge_map(fold):
            points=fold['vertices_coords']
            return {tuple(sorted((tuple(round(x,8) for x in points[a]),
                                  tuple(round(x,8) for x in points[b])))):kind
                    for (a,b),kind in zip(fold['edges_vertices'],fold['edges_assignment'])}
        original,_,detail=exact_split(DEFAULT_POLYGON,.15,0,70,1,'M',['V','M','M','M'],True)
        self.assertTrue(detail['split'])
        # The split points are fixed by geometry and match the saved
        # Origamica In[2937] coordinates, independently of central M/V.
        expected=[[.8266771271306932,.6914772237847899],[.5377494199370402,1.0373391045553066],
                  [.3264428058213553,.6551380809327898],[.5446589793151859,.3287603437034611],
                  [.12553846967075538,.5382351155027026]]
        for actual,point in zip(detail['centralVertices'],expected):
            self.assertLess(math.dist(actual,point),1e-10)
        merged=edge_map(result['fold'])
        for edge,kind in edge_map(original).items():
            if kind!='B':self.assertEqual(merged[edge],kind)
        flat=result['source']['foldedForm']
        self.assertEqual(len(flat),result['stats']['vertices'])
        for face in result['fold']['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(result['fold']['vertices_coords'][a],result['fold']['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=7)
        # A same-angle neighbor becomes valid when the temporary tile border
        # is removed; the old retained-seam branch needed complementary tilt.
        joined=generate({**params,'tileTwists':[split,{**ordinary,'tilt':70}]})
        self.assertEqual(joined['fold']['zhezhi_merged_edge_mode'],'delete')
        self.assertEqual(joined['source']['mergedEdgeMode'],'delete')
        self.assertEqual(joined['stats']['checks']['local']['status'],'passed')
        bad=[split,{**ordinary,'tilt':90}]
        with self.assertRaises(ValueError):generate({**params,'tileTwists':bad})
        bad=[split,{**ordinary,'width':.2}]
        with self.assertRaises(ValueError):generate({**params,'tileTwists':bad})

    def test_split_base_and_edge_types_follow_original_face_after_reordering(self):
        cases=[([0,1,2,3],1,['M','M','V','V']),
               ([1,2,3,0],0,['M','V','V','M']),
               ([0,3,2,1],3,['V','V','M','M'])]
        patterns=[]
        for face,base,types in cases:
            tile=dict(width=.15,offset=0,tilt=70,centralTypes=types,
                      construction='split',baseVertex=base,connection='M',ccw=True)
            result=generate({**GRID,'vertices':DEFAULT_POLYGON,'faces':[face],
                             'tileTwists':[tile]})
            points=result['fold']['vertices_coords']
            patterns.append({tuple(sorted((tuple(round(x,8) for x in points[a]),
                                          tuple(round(x,8) for x in points[b])))):kind
                             for (a,b),kind in zip(result['fold']['edges_vertices'],result['fold']['edges_assignment'])})
        self.assertEqual(patterns[0],patterns[1])
        self.assertEqual(patterns[0],patterns[2])

    def test_split_input_requires_quadrilateral_and_complete_parameters(self):
        tile=dict(width=.15,offset=0,tilt=70,centralTypes=['M','M','V','V'],
                  construction='split',baseVertex=1,connection='M',ccw=True)
        for wrong in ({**tile,'baseVertex':4},{**tile,'baseVertex':True},
                      {**tile,'connection':'U'},{**tile,'ccw':1},
                      {k:v for k,v in tile.items() if k!='ccw'},
                      {**tile,'construction':'unknown'}):
            with self.subTest(wrong=wrong),self.assertRaises(ValueError):
                validate_request({**GRID,'vertices':DEFAULT_POLYGON,'faces':[[0,1,2,3]],
                                  'tileTwists':[wrong]})
        with self.assertRaises(ValueError):
            validate_request({**GRID,'vertices':[[0,0],[1,0],[.5,1]],'faces':[[0,1,2]],
                              'tileTwists':[{**tile,'centralTypes':['M']*3}]})

    def test_checkerboard_complementary_pleats_merge_into_single_cp(self):
        result=generate({**GRID,'tileTwists':twists()})
        self.assertEqual(result['source']['mergedEdgeMode'],'retained-crease')
        self.assertEqual(result['source']['mergedEdgeMode'],
                         result['fold']['zhezhi_merged_edge_mode'])
        self.assertEqual(result['stats']['tiles'],4)
        self.assertEqual(result['stats']['faces'],36)
        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
        self.assertEqual(result['fold']['edges_assignment'].count('U'),0)
        self.assertGreater(result['fold']['edges_assignment'].count('M'),0)
        self.assertGreater(result['fold']['edges_assignment'].count('V'),0)
        flat=result['source']['foldedForm']
        self.assertEqual(len(flat),result['stats']['vertices'])
        self.assertLess(result['source']['closureError'],1e-8)
        for face in result['fold']['faces_vertices']:
            for a,b in itertools.combinations(face,2):
                self.assertAlmostEqual(math.dist(result['fold']['vertices_coords'][a],result['fold']['vertices_coords'][b]),
                                       math.dist(flat[a],flat[b]),places=7)
        repeated=generate({**GRID,'repeatX':2,'repeatY':2,'tileTwists':twists()})
        self.assertEqual(repeated['stats']['tiles'],16)
        self.assertEqual(repeated['stats']['faces'],144)
        self.assertEqual(repeated['stats']['checks']['geometry']['status'],'passed')
        self.assertEqual(repeated['stats']['checks']['local']['status'],'passed')
        self.assertEqual({i:repeated['fold']['zhezhi_face_tile_instance'].count(i) for i in range(16)},
                         {i:9 for i in range(16)})
        self.assertEqual({i:repeated['fold']['zhezhi_face_tile_source'].count(i) for i in range(4)},
                         {i:36 for i in range(4)})
        mother=repeated['mother'];fold=repeated['fold']
        for face,instance,source in zip(fold['faces_vertices'],fold['zhezhi_face_tile_instance'],
                                        fold['zhezhi_face_tile_source']):
            self.assertEqual(source,mother['zhezhi_custom_face_index'][instance])
            polygon=[mother['vertices_coords'][v] for v in mother['faces_vertices'][instance]]
            # Every reconstructed CP face, not only its centroid, belongs to
            # the recorded source tile after 2x2 lattice repetition.
            for v in face:
                point=fold['vertices_coords'][v]
                turns=[(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0])
                       for a,b in zip(polygon,polygon[1:]+polygon[:1])]
                self.assertTrue(min(turns)>=-1e-7 or max(turns)<=1e-7)

    def test_original_monolithic_pattern_repeats_to_36_tiles_without_seam_borders(self):
        # Origamica MakeLatticeTiling permits arbitrarily large tilings of
        # full-edge neighbors. Exercise the actual original four-square
        # MonolithicEmbedTiling motif beyond the former 16-tile limit.
        grid={**GRID,
              'vertices':[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]]}
        choices=[dict(width=.18,offset=0,tilt=centered_tilt(.18,30),
                      centralTypes=[kind]*4) for kind in ('V','M','M','V')]
        for repeat_x,repeat_y in ((3,2),(3,3)):
            with self.subTest(repeatX=repeat_x,repeatY=repeat_y):
                result=generate({**grid,'repeatX':repeat_x,'repeatY':repeat_y,
                                 'tileTwists':choices})
                fold=result['fold'];mother=result['mother'];source=result['source']
                count=4*repeat_x*repeat_y
                self.assertEqual(result['stats']['tiles'],count)
                self.assertEqual(len(mother['faces_vertices']),count)
                self.assertEqual(source['mergedEdgeMode'],'delete')
                self.assertEqual(fold['zhezhi_merged_edge_mode'],'delete')
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                self.assertEqual(fold['edges_assignment'].count('U'),0)
                self.assertEqual(result['stats']['vertices']-result['stats']['edges']+
                                 result['stats']['faces'],1)
                self.assertLess(source['closureError'],1e-7)
                coords=fold['vertices_coords'];flat=source['foldedForm']
                self.assertEqual(len(coords),len(flat))
                for face in fold['faces_vertices']:
                    for a,b in itertools.combinations(face,2):
                        self.assertLess(abs(math.dist(coords[a],coords[b])-
                                            math.dist(flat[a],flat[b])),1e-7)
                # Deleting every duplicated B/B edge must leave boundary
                # segments only on the rectangular outer paper border.
                width,height=2*repeat_x,2*repeat_y
                for (a,b),kind in zip(fold['edges_vertices'],fold['edges_assignment']):
                    if kind!='B':continue
                    self.assertTrue(any(abs(coords[a][axis]-value)<1e-7 and
                                        abs(coords[b][axis]-value)<1e-7
                                        for axis,value in ((0,0),(0,width),(1,0),(1,height))))
                instances=fold['zhezhi_face_tile_instance']
                sources=fold['zhezhi_face_tile_source']
                self.assertEqual(len(instances),len(fold['faces_vertices']))
                self.assertEqual(len(sources),len(instances))
                self.assertEqual(set(instances),set(range(count))|{-1})
                for instance,source_index in zip(instances,sources):
                    self.assertEqual(source_index,
                                     mother['zhezhi_custom_face_index'][instance]
                                     if instance>=0 else -1)

    def test_tile_count_limit_is_above_16_but_bounded(self):
        valid={**GRID,'tileTwists':twists(),'repeatX':3,'repeatY':3}
        self.assertEqual(validate_request(valid)['repeatX'],3)
        too_many={**GRID,'tileTwists':twists(),
                  'range1':[0,9],'range2':[0,0],
                  'lattice':[[1,0],[0,1]]}
        with self.assertRaisesRegex(ValueError,'36'):
            validate_request(too_many)

    def test_t_junction_requires_source_tile_vertices_to_be_aligned_first(self):
        # The mother mesh can conform a T seam, but MonolithicEmbedTiling's
        # whole-edge merge does not define how one pleat border should meet
        # two others. Reject rather than silently fabricating that topology.
        params={**GRID,
                'vertices':[[0,0],[1,0],[2,0],[1,.5],[2,.5],[0,1],[1,1],[2,1]],
                'faces':[[0,1,6,5],[1,2,4,3],[3,4,7,6]],
                'tileTwists':[dict(width=.2,offset=0,tilt=70,centralTypes=['M']*4)
                              for _ in range(3)]}
        with self.assertRaisesRegex(ValueError,'细分'):
            generate(params)

    def test_unmatched_width_and_noncomplementary_angles_reject(self):
        wrong=twists();wrong[1]['width']=.3
        with self.assertRaises(ValueError):generate({**GRID,'tileTwists':wrong})
        with self.assertRaises(ValueError):generate({**GRID,'tileTwists':twists((70,70,110,70))})

    def test_per_edge_central_types_follow_source_face_order(self):
        polygon=[[0,0],[1,0],[1,1],[0,1]]
        types=['V','M','M','M']
        single={**GRID,'vertices':polygon,'faces':[[0,1,2,3]],'tileTwists':[dict(width=.2,offset=0,tilt=70,centralTypes=types)]}
        result=generate(single)
        direct,_,_=polygon_pleat_tile(polygon,.2,0,70,types)
        def edge_map(fold):
            coords=fold['vertices_coords']
            return {tuple(sorted((tuple(round(v,8) for v in coords[a]),tuple(round(v,8) for v in coords[b])))):kind
                    for (a,b),kind in zip(fold['edges_vertices'],fold['edges_assignment'])}
        self.assertEqual(edge_map(result['fold']),edge_map(direct))

    def test_input_contract_rejects_missing_or_unrelated_specs(self):
        for params in ({**GRID},{**GRID,'tileTwists':twists()[:2]},
                       {**GRID,'tileTwists':twists(),'parameterization':'gamma-alpha'}):
            with self.subTest(params=params),self.assertRaises(ValueError):validate_request(params)

    def test_stationary_face_changes_only_flat_embedding_frame(self):
        params={**GRID,'tileTwists':twists()}
        default=generate(params)
        anchored=generate({**params,'stationaryFace':20})
        self.assertEqual(default['fold'],anchored['fold'])
        self.assertEqual(anchored['source']['foldedFormStationaryFace'],20)
        self.assertNotEqual(default['source']['foldedForm'],anchored['source']['foldedForm'])
        self.assertLess(default['source']['closureError'],1e-8)
        self.assertLess(anchored['source']['closureError'],1e-8)
        fold=anchored['fold']; flat=anchored['source']['foldedForm']
        for vertex in fold['faces_vertices'][20]:
            self.assertLess(math.dist(flat[vertex],fold['vertices_coords'][vertex]),1e-8)
        for a,b in itertools.combinations(range(len(flat)),2):
            self.assertAlmostEqual(math.dist(default['source']['foldedForm'][a],
                                             default['source']['foldedForm'][b]),
                                   math.dist(flat[a],flat[b]),places=7)

    def test_stationary_face_rejects_invalid_or_unrelated_requests(self):
        params={**GRID,'tileTwists':twists()}
        for invalid in (-1,True,1.5,'2',4097):
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):
                validate_request({**params,'stationaryFace':invalid})
        with self.assertRaises(ValueError):
            generate({**params,'stationaryFace':36})
        for output in ('tiling','twist'):
            with self.subTest(output=output),self.assertRaises(ValueError):
                validate_request({**GRID,'customOutput':output,'stationaryFace':0})


if __name__=='__main__':unittest.main()
