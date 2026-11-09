import math
import unittest
from collections import defaultdict

import numpy as np

from tessellation_goldberg import goldberg_indexed_line_graph,goldberg_line_segments,goldberg_mesh,goldberg_patch_mesh,goldberg_point,goldberg_reference_query,goldberg_tile_specs
from tessellation_meshes import reciprocal_centers
from tessellation_prune import prune_mesh
from tessellate import check_geometry,dispatch_request,generate,validate_request


def notebook_point(order,radius,wedge,index):
    """Algebraic evaluation of GoldbergPoint, notebook 246285–246307.

    The implementation rotates a chord step. This independent reference
    interpolates directly between adjacent radial unit vectors instead.
    """
    angle=2*math.pi*wedge/order
    next_angle=angle+2*math.pi/order
    return ((radius-index)*math.cos(angle)+index*math.cos(next_angle),
            (radius-index)*math.sin(angle)+index*math.sin(next_angle))


def notebook_edges(order,rings):
    """The ordered three Tables in MakeGoldbergTiling, 246437–246501."""
    for wedge in range(order):
        p=lambda r,l:notebook_point(order,r,wedge,l)
        for index in range(rings+1):
            for radius in range(index,rings):
                yield p(radius,index),p(radius+1,index)
    for wedge in range(order):
        p=lambda r,l:notebook_point(order,r,wedge,l)
        for index in range(rings+1):
            for radius in range(index+1,rings+1):
                yield p(radius,index),p(radius,index+1)
    for wedge in range(order):
        p=lambda r,l:notebook_point(order,r,wedge,l)
        for index in range(rings+1):
            for radius in range(index+1,rings):
                yield p(radius,index),p(radius+1,index+1)


class GoldbergTests(unittest.TestCase):
    def test_zero_offset_source_function_keeps_original_ordered_rotation_metadata(self):
        # GoldbergTiling In[3324] joins all m patches in order. In[3326]
        # instead joins m/2 patches, copies them through Pi, then applies
        # Mod[rot+Pi,2Pi,-Pi] even when o=0. There is no saved Wolfram Out;
        # these are independently evaluated source expressions, not an
        # interpreter-output comparison.
        for m,n in ((6,1),(8,2),(10,3)):
            with self.subTest(order=m,rings=n):
                query=dict(mode='tile-tiling',order=m,rings=n,offset=0)
                full=goldberg_reference_query({**query,'sourceVariant':'full'})
                zero=goldberg_reference_query({**query,'sourceVariant':'offset'})
                self.assertEqual(full['sourceFunction'],'GoldbergTiling')
                self.assertEqual(zero['sourceFunction'],'GoldbergOffsetTiling')
                self.assertEqual(full['sourceVariant'],'full')
                self.assertEqual(zero['sourceVariant'],'offset')
                self.assertEqual((len(full['tileSpecs']),len(zero['tileSpecs'])),
                                 (m*n*n,m*n*n))
                for left,right in zip(full['faces'],zero['faces']):
                    for a,b in zip(left,right):
                        self.assertLess(math.dist(a,b),1e-12)
                self.assertEqual(len(full['segments']),len(zero['segments']))
                for (a,b),(c,d) in zip(full['segments'],zero['segments']):
                    self.assertLess(math.dist(a,c),1e-12)
                    self.assertLess(math.dist(b,d),1e-12)
                expected_order=[]
                for wedge in range(1,m+1):
                    for i in range(1,n+1):
                        for j in range(1,i+1):
                            expected_order.append((wedge,[i,j],'A'))
                            if i!=j:expected_order.append((wedge,[i,j],'B'))
                self.assertEqual([(spec['wedge'],spec['cell'],spec['branch'])
                                  for spec in full['tileSpecs']],expected_order)
                for first,second in zip(full['tileSpecs'],zero['tileSpecs']):
                    turn=first['wedge']-1+(first['branch']=='B')
                    full_angle=2*math.pi*turn/m
                    source_offset_angle=full_angle-(2*math.pi if first['wedge']>m//2 else 0)
                    self.assertAlmostEqual(first['rotationRadians'],full_angle,places=12)
                    self.assertAlmostEqual(second['rotationRadians'],source_offset_angle,places=12)
                    self.assertEqual(second['rotationPiFraction'],
                                     first['rotationPiFraction'] if first['wedge']<=m//2
                                     else [2*(turn-m)//math.gcd(2*(turn-m),m),
                                           m//math.gcd(2*(turn-m),m)])
                    self.assertEqual(first['offset'],second['offset'])
                    for a,b in zip(first['vertices'],second['vertices']):
                        self.assertLess(math.dist(a,b),1e-12)

        # In[3326] uses o only in the lower half translation before the
        # common -o/2 reference-frame shift. Test signed and fractional o
        # separately from the integer-only MakeOffsetGoldbergTiling graph.
        for m,n,o in ((6,2,-.75),(8,2,.5),(10,3,1)):
            with self.subTest(order=m,rings=n,offset=o):
                unshifted=goldberg_reference_query(dict(mode='tile-tiling',order=m,
                    rings=n,offset=0,sourceVariant='offset'))['tileSpecs']
                shifted=goldberg_reference_query(dict(mode='tile-tiling',order=m,
                    rings=n,offset=o,sourceVariant='offset'))['tileSpecs']
                for before,after in zip(unshifted,shifted):
                    dx=-o/2 if before['wedge']<=m//2 else o/2
                    self.assertEqual(before['rotationPiFraction'],after['rotationPiFraction'])
                    self.assertEqual(before['cell'],after['cell'])
                    self.assertEqual(before['branch'],after['branch'])
                    self.assertLess(math.dist(after['offset'],
                                              (before['offset'][0]+dx,before['offset'][1])),1e-12)
                    for old,new in zip(before['vertices'],after['vertices']):
                        self.assertLess(math.dist(new,(old[0]+dx,old[1])),1e-12)
        with self.assertRaisesRegex(ValueError,'不接受非零偏移'):
            goldberg_reference_query(dict(mode='tile-tiling',order=8,rings=2,
                                          offset=.5,sourceVariant='full'))
        with self.assertRaisesRegex(ValueError,'仅适用于偶数阶'):
            goldberg_reference_query(dict(mode='tile-tiling',order=7,rings=2,
                                          offset=0,sourceVariant='offset'))
        with self.assertRaisesRegex(ValueError,'仅可选'):
            goldberg_reference_query(dict(mode='offset-lines',order=8,rings=2,
                                          offset=1,sourceVariant='offset'))

    def test_original_line_list_preserves_edge_family_and_offset_group_order(self):
        # In[3359] returns Flatten[{radial Table, chord Table, diagonal
        # Table}, 3], preserving each directed point pair. In[3368] uses
        # GatherBy on y < -10^-6 before translating and appending bridges.
        for m,n,o in ((5,2,0),(7,3,0),(6,1,1),(8,2,1),(8,2,3),
                      (8,2,5),(6,3,6)):
            with self.subTest(order=m,rings=n,offset=o):
                original=list(notebook_edges(m,n))
                if o:
                    top=[edge for edge in original
                         if not any(point[1]<-1e-6 for point in edge)]
                    bottom=[edge for edge in original
                            if any(point[1]<-1e-6 for point in edge)]
                    expected=[((a[0]-o/2,a[1]),(b[0]-o/2,b[1])) for a,b in top]
                    expected.extend(((a[0]+o/2,a[1]),(b[0]+o/2,b[1]))
                                    for a,b in bottom)
                    expected.extend(((n+i-o/2,0),(n+i+1-o/2,0))
                                    for i in range(o))
                else:
                    expected=original
                actual=goldberg_line_segments(m,n,o)
                self.assertEqual(len(actual),len(expected))
                for index,(segment,(a,b)) in enumerate(zip(actual,expected),1):
                    self.assertLess(math.dist(segment[0],a),1e-11,msg=f'edge {index} start')
                    self.assertLess(math.dist(segment[1],b),1e-11,msg=f'edge {index} end')
                reference=goldberg_reference_query(dict(mode='offset-lines',order=m,
                                                       rings=n,offset=o))
                self.assertEqual(reference['segments'],actual)
                self.assertEqual(reference['sourceFunction'],
                                 'MakeOffsetGoldbergTiling' if o else 'MakeGoldbergTiling')

    def test_tile_tiling_reference_accepts_real_offsets_without_inventing_a_plane_graph(self):
        # GoldbergOffsetTiling In[3326] translates the lower half by o; unlike
        # MakeOffsetGoldbergTiling, it neither loops over o bridge edges nor
        # requires an integer. Evaluate In[3326] independently at o=1/2.
        q=math.sqrt(2)/2
        reference=goldberg_reference_query(dict(mode='tile-tiling',order=8,rings=2,offset=.5))
        self.assertEqual(reference['sourceFunction'],'GoldbergOffsetTiling')
        self.assertEqual(reference['topology'],'ordered-unit-triangle-tile-list')
        self.assertEqual((reference['triangleCount'],len(reference['faces'])),(32,32))
        self.assertEqual(reference['tileFrameTranslation'],[-.25,0])
        for actual,expected in zip(reference['faces'][0],((-0.25,0),(.75,0),(q-.25,q))):
            self.assertLess(math.dist(actual,expected),1e-12)
        for actual,expected in zip(reference['faces'][16],((.25,0),(-.75,0),(.25-q,-q))):
            self.assertLess(math.dist(actual,expected),1e-12)
        self.assertEqual(reference['tileSpecs'][16]['rotationPiFraction'],[-1,1])
        self.assertEqual(reference['dualTargets'],[])
        self.assertEqual(reference['dualSegments'],[])
        self.assertFalse(reference['creasePattern'])
        self.assertFalse(reference['flatFoldabilityChecked'])

        negative=goldberg_reference_query(dict(mode='tile-tiling',order=8,rings=2,offset=-.75))
        self.assertEqual(negative['tileSpecs'][0]['offset'],[.375,0.])
        self.assertEqual(negative['tileSpecs'][16]['offset'],[-.375,0.])
        self.assertEqual(negative['sourceFunction'],'GoldbergOffsetTiling')
        ordinary=goldberg_reference_query(dict(mode='tile-tiling',order=7,rings=2,offset=0))
        self.assertEqual(ordinary['sourceFunction'],'GoldbergTiling')
        self.assertEqual(len(ordinary['faces']),28)
        integer_tiles=goldberg_reference_query(dict(mode='tile-tiling',order=8,rings=2,offset=1))
        integer_lines=goldberg_reference_query(dict(mode='offset-lines',order=8,rings=2,offset=1))
        edge=lambda a,b:tuple(sorted((tuple(round(v,7) for v in a),tuple(round(v,7) for v in b))))
        self.assertEqual(integer_tiles['tileSpecs'],integer_lines['tileSpecs'])
        self.assertEqual({edge(*segment) for segment in integer_tiles['segments']},
                         {edge(*segment) for segment in integer_lines['segments']})
        for invalid in (float('nan'),float('inf'),65,-65,True):
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):
                goldberg_reference_query(dict(mode='tile-tiling',order=8,rings=2,offset=invalid))
        with self.assertRaisesRegex(ValueError,'偶数旋转阶'):
            goldberg_reference_query(dict(mode='tile-tiling',order=7,rings=2,offset=.5))
        with self.assertRaisesRegex(ValueError,'须为整数'):
            goldberg_reference_query(dict(mode='offset-lines',order=8,rings=2,offset=.5))

    def test_original_unit_triangle_tile_specs_reconstruct_patch_and_tiling(self):
        # In[3322] returns {UnitTriangleTile, angles}, offset, rotation, 1.
        # UnitTriangleVertices (In[366]) has a unit horizontal base and a
        # third point sin(B)/sin(C) in the direction of angle A.
        def triangle(face):
            return frozenset(tuple(round(v,7) for v in point) for point in face)

        for m,n in ((3,1),(7,2),(8,3),(12,4)):
            with self.subTest(mode='patch',order=m,rings=n):
                specs=goldberg_tile_specs(m,n,patch_only=True)
                patch=goldberg_patch_mesh(m,n)
                points=patch['vertices_coords']
                self.assertEqual(len(specs),n*n)
                self.assertEqual([spec['tileIndex'] for spec in specs],list(range(1,n*n+1)))
                self.assertEqual([triangle(spec['vertices']) for spec in specs],
                                 [triangle([points[i] for i in face]) for face in patch['faces_vertices']])
                for spec in specs:
                    self.assertEqual(spec['tileType'],'UnitTriangleTile')
                    self.assertEqual(spec['scale'],1)
                    self.assertAlmostEqual(sum(spec['anglesRadians']),math.pi)
                    self.assertEqual(spec['wedge'],1)
                    self.assertEqual(spec['offset'],spec['vertices'][0])
            with self.subTest(mode='tiling',order=m,rings=n):
                specs=goldberg_tile_specs(m,n)
                mother=goldberg_mesh(m,n)
                points=mother['vertices_coords']
                self.assertEqual(len(specs),m*n*n)
                self.assertEqual({triangle(spec['vertices']) for spec in specs},
                                 {triangle([points[i] for i in face]) for face in mother['faces_vertices']})

        sample=goldberg_tile_specs(7,2,patch_only=True)
        self.assertEqual([(spec['cell'],spec['branch']) for spec in sample],
                         [([1,1],'A'),([2,1],'A'),([2,1],'B'),([2,2],'A')])
        self.assertEqual(sample[0]['anglePiFractions'],[[2,7],[5,14],[5,14]])
        self.assertEqual(sample[2]['anglePiFractions'],[[5,14],[2,7],[5,14]])
        self.assertEqual(sample[2]['rotationPiFraction'],[2,7])
        self.assertEqual(sample[2]['offset'],[1.,0.])

    def test_offset_tile_specs_match_original_line_graph_even_when_disconnected(self):
        def edge(a,b):
            return tuple(sorted((tuple(round(v,7) for v in a),tuple(round(v,7) for v in b))))
        for m,n,o in ((8,2,0),(8,2,1),(8,2,3),(8,2,4),(8,2,5),(6,3,6)):
            with self.subTest(order=m,rings=n,offset=o):
                specs=goldberg_tile_specs(m,n,o)
                lines={edge(*segment) for segment in goldberg_line_segments(m,n,o)}
                spec_edges={edge(a,b) for spec in specs for a,b in
                            zip(spec['vertices'],spec['vertices'][1:]+spec['vertices'][:1])}
                self.assertTrue(spec_edges<=lines)
                self.assertEqual(len(specs),m*n*n)
                reference=goldberg_reference_query(dict(mode='offset-lines',order=m,rings=n,offset=o))
                self.assertEqual(reference['tileSpecs'],specs)
                self.assertEqual(reference['tileFrameTranslation'],[-o/2,0] if o else [0,0])
                if o and m==8:
                    bottom=next(spec for spec in specs if spec['wedge']==5)
                    # GoldbergOffsetTiling normalizes bottom rotations into
                    # [-pi,pi), unlike the unshifted GoldbergTiling join.
                    self.assertEqual(bottom['rotationPiFraction'],[-1,1])
                    self.assertAlmostEqual(bottom['rotationRadians'],-math.pi)
        with self.assertRaisesRegex(ValueError,'不支持偏移'):
            goldberg_tile_specs(7,2,1)

    def test_reference_dual_lines_are_finite_reciprocal_edges_only(self):
        def edge(a,b):
            return tuple(sorted((tuple(round(v,8) for v in a),tuple(round(v,8) for v in b))))

        # For six unit triangles the circumcenters form a regular hexagon;
        # this numerical anchor is independent of the graph adjacency code.
        regular=goldberg_reference_query(dict(mode='offset-lines',order=6,rings=1,offset=0))
        root3=math.sqrt(3)
        centers=[(0,root3/3),(.5,root3/6),(.5,-root3/6),
                 (0,-root3/3),(-.5,-root3/6),(-.5,root3/6)]
        expected={edge(a,b) for a,b in zip(centers,centers[1:]+centers[:1])}
        self.assertEqual({edge(a,b) for a,b in regular['dualSegments']},expected)
        self.assertEqual(len(regular['dualTargets']),6)
        self.assertFalse(regular['creasePattern'])

        patch=goldberg_reference_query(dict(mode='sector-patch',order=8,rings=3))
        self.assertEqual(len(patch['dualSegments']),9)
        self.assertEqual(len(patch['dualTargets']),9)

        offset=goldberg_reference_query(dict(mode='offset-lines',order=8,rings=2,offset=1))
        self.assertEqual(len(offset['dualTargets']),8*2*2)
        self.assertEqual(len(offset['dualSegments']),39)
        self.assertEqual(offset['faces'],[])
        self.assertFalse(offset['flatFoldabilityChecked'])

        # At and beyond o=2n there is no single face mesh to dualize.
        for o in (4,5):
            reference=goldberg_reference_query(dict(mode='offset-lines',order=8,rings=2,offset=o))
            self.assertEqual(reference['dualTargets'],[])
            self.assertEqual(reference['dualSegments'],[])

    def test_reference_query_keeps_patch_and_unrestricted_line_drawing_out_of_cp(self):
        patch=dispatch_request(dict(operation='goldberg-reference',mode='sector-patch',order=8,rings=3))
        self.assertEqual(patch['kind'],'goldberg-numerical-reference')
        self.assertEqual(patch['topology'],'single-sector-face-mesh')
        self.assertEqual((patch['triangleCount'],len(patch['faces'])),(9,9))
        self.assertEqual(len(patch['dualTargets']),9)
        self.assertEqual(patch['output'],'reference-geometry')
        self.assertFalse(patch['creasePattern'])
        self.assertFalse(patch['mountainValleyAssigned'])
        self.assertFalse(patch['flatFoldabilityChecked'])
        self.assertNotIn('fold',patch)
        expected=goldberg_patch_mesh(8,3)
        points=expected['vertices_coords']
        self.assertEqual(patch['faces'],[[points[i] for i in face] for face in expected['faces_vertices']])
        self.assertEqual(patch['segments'],[[points[a],points[b]] for a,b in expected['edges_vertices']])
        self.assertEqual(patch['dualTargets'],expected['zhezhi_goldberg_dual_targets'])

        touching=goldberg_reference_query(dict(mode='offset-lines',order=8,rings=2,offset=4))
        separated=dispatch_request(dict(operation='goldberg-reference',mode='offset-lines',order=8,rings=2,offset=5))
        self.assertEqual(touching['topology'],'point-contact-face-patches')
        self.assertEqual(separated['topology'],'separated-face-patches-with-line-bridge')
        self.assertEqual(len(separated['segments']),8*2*(3*2+1)//2+5)
        self.assertEqual(separated['segments'],goldberg_line_segments(8,2,5))
        self.assertEqual(separated['faces'],[])
        self.assertEqual(separated['dualTargets'],[])
        self.assertFalse(separated['creasePattern'])
        self.assertNotIn('fold',separated)
        self.assertEqual(generate(dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',
                                       goldbergOrder=8,goldbergRings=2,goldbergOffset=1,goldbergOutput='tiling'))['source']['output'],'tiling')

    def test_large_offset_indexify_reference_preserves_order_direction_and_first_seen_vertices(self):
        # In[3370] applies Indexify[elist,2] to In[3368]'s ordered segments.
        # The source PtOnPtQ default is Euclidean 1e-6, and its first match
        # wins. This remains line-graph data, not a connected face mesh.
        reference=goldberg_reference_query(dict(mode='offset-lines',order=8,rings=2,offset=5))
        graph=reference['indexedGraph']
        self.assertEqual((len(graph['vertices']),len(graph['edges'])),(30,61))
        self.assertEqual(graph['indexBase'],0)
        self.assertEqual(graph['bridgeEdgeIndices'],[56,57,58,59,60])
        self.assertEqual(graph['edges'][:2],[[0,1],[1,2]])
        self.assertEqual(graph['vertices'][:3],[[-2.5,0.],[-1.5,0.],[-.5,0.]])
        self.assertEqual(graph['edges'][56],[2,28])
        self.assertLess(math.dist(graph['vertices'][28],[.5,0.]),1e-12)
        for (a,b),(p,q) in zip(graph['edges'],reference['segments']):
            self.assertLessEqual(math.dist(graph['vertices'][a],p),1e-6)
            self.assertLessEqual(math.dist(graph['vertices'][b],q),1e-6)
        self.assertIsNone(goldberg_reference_query(dict(mode='tile-tiling',order=8,rings=2,offset=5))['indexedGraph'])
        self.assertIsNone(goldberg_reference_query(dict(mode='sector-patch',order=8,rings=2))['indexedGraph'])
        self.assertEqual(reference['faces'],[])
        self.assertEqual(reference['dualTargets'],[])
        self.assertFalse(reference['creasePattern'])
        self.assertFalse(reference['flatFoldabilityChecked'])
        with self.assertRaisesRegex(ValueError,'小于两倍径向层数'):
            validate_request(dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',
                                  goldbergOrder=8,goldbergRings=2,goldbergOffset=5,goldbergOutput='tiling'))

    def test_indexify_numeric_tolerance_and_bridge_provenance_do_not_add_faces(self):
        segments=[[[0.,0.],[1.,0.]],[[1.+5e-7,0.],[1.,1.]],[[1.,1.],[2.,1.]]]
        graph=goldberg_indexed_line_graph(segments,1)
        self.assertEqual(graph,{'vertices':[[0.,0.],[1.,0.],[1.,1.],[2.,1.]],
                                'edges':[[0,1],[1,2],[2,3]],'indexBase':0,'bridgeEdgeIndices':[2]})

    def test_reference_query_rejects_invalid_modes_and_never_relaxes_cp_validation(self):
        valid=dict(operation='goldberg-reference',mode='offset-lines',order=8,rings=2,offset=5)
        for patch in (dict(mode='fold'),dict(order=True),dict(rings=0),dict(order=17),
                      dict(offset=-1),dict(offset=65),dict(order=7),dict(extra='x')):
            with self.subTest(patch=patch),self.assertRaises(ValueError):
                dispatch_request({**valid,**patch})
        with self.assertRaisesRegex(ValueError,'单扇区网格不使用上下偏移'):
            dispatch_request({**valid,'mode':'sector-patch'})
        with self.assertRaisesRegex(ValueError,'小于两倍径向层数'):
            validate_request(dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',
                                  goldbergOrder=8,goldbergRings=2,goldbergOffset=5,goldbergOutput='tiling'))

    def test_notebook_exact_hexagon_and_offset_numeric_anchors(self):
        # Origamica GoldbergPoint (notebook 246285–246307) and the three
        # MakeGoldbergTiling edge families (246437–246501) imply these fixed
        # radical coordinates. These anchors do not call goldberg_point to
        # calculate the expected values, unlike the general edge-set test.
        root3=math.sqrt(3)
        regular=goldberg_mesh(6,1)
        actual={tuple(round(v,8) for v in point) for point in regular['vertices_coords']}
        expected={(0.,0.),(1.,0.),(.5,root3/2),(-.5,root3/2),
                  (-1.,0.),(-.5,-root3/2),(.5,-root3/2)}
        expected={tuple(round(v,8) for v in point) for point in expected}
        self.assertEqual(actual,expected)
        dual={tuple(round(v,8) for v in center) for center in regular['zhezhi_goldberg_dual_targets']}
        expected_dual={(0.,root3/3),(.5,root3/6),(.5,-root3/6),
                       (0.,-root3/3),(-.5,-root3/6),(-.5,root3/6)}
        self.assertEqual(dual,{tuple(round(v,8) for v in point) for point in expected_dual})

        # MakeOffsetGoldbergTiling (246910–247000) translates the two
        # half-disks by ±1/2 and bridges their positive-axis endpoints.
        offset=goldberg_mesh(8,2,1)
        points=offset['vertices_coords']
        axes={round(p[0],8) for p in points if abs(p[1])<1e-9}
        self.assertEqual(axes,{-2.5,-1.5,-.5,.5,1.5,2.5})
        self.assertTrue(any({tuple(round(x,8) for x in points[a]),
                             tuple(round(x,8) for x in points[b])}=={(1.5,0.),(2.5,0.)}
                            for a,b in offset['edges_vertices']))
        q=math.sqrt(2)/2
        first={(-.5,0.),(.5,0.),(round(q-.5,8),round(q,8))}
        target=(0.,round((math.sqrt(2)-1)/2,8))
        self.assertTrue(any({tuple(round(x,8) for x in points[i]) for i in face}==first
                            and tuple(round(x,8) for x in offset['zhezhi_goldberg_dual_targets'][j])==target
                            for j,face in enumerate(offset['faces_vertices'])))

    def test_offset_edge_set_matches_original_two_half_translation_and_bridge(self):
        # MakeOffsetGoldbergTiling splits the unshifted edge list by whether
        # either endpoint lies below y=0, translates the two halves by ±o/2,
        # and inserts o unit bridge segments along the positive x axis.
        def edge(a,b):
            # polygon_mesh serializes coordinates to 9 places; compare at 7
            # to avoid a half-ulp rounding boundary in 10-fold sine values.
            return tuple(sorted((tuple(round(x,7) for x in a),tuple(round(x,7) for x in b))))
        for m,n,o in ((6,1,1),(8,2,1),(8,2,2),(8,2,3),(6,3,2),(6,3,5),(10,3,3)):
            with self.subTest(order=m,rings=n,offset=o):
                expected=set()
                for a,b in notebook_edges(m,n):
                    shift=o/2 if a[1]<-1e-6 or b[1]<-1e-6 else -o/2
                    expected.add(edge((a[0]+shift,a[1]),(b[0]+shift,b[1])))
                for i in range(o):
                    expected.add(edge((n+i-o/2,0),(n+i+1-o/2,0)))
                offset=goldberg_mesh(m,n,o)
                actual={edge(offset['vertices_coords'][a],offset['vertices_coords'][b])
                        for a,b in offset['edges_vertices']}
                self.assertEqual(actual,expected)
                tiled=generate(dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',
                                    goldbergOrder=m,goldbergRings=n,goldbergOffset=o,goldbergOutput='tiling'))
                points=tiled['mother']['vertices_coords']
                api_edges={edge(points[a],points[b]) for a,b in tiled['mother']['edges_vertices']}
                self.assertEqual(api_edges,expected)
                self.assertEqual(tiled['stats']['tiles'],m*n*n)

    def test_notebook_radial_coordinates_and_exact_triangle_counts(self):
        for m,n in ((3,1),(5,2),(7,3),(8,2),(12,4)):
            phi=math.pi/m
            for k in (0,1,m-1):
                for r,l in ((0,0),(1,0),(1,1),(n,n//2)):
                    p=goldberg_point(m,r,k,l)
                    expected=notebook_point(m,r,k,l)
                    self.assertAlmostEqual(p[0],expected[0],places=12)
                    self.assertAlmostEqual(p[1],expected[1],places=12)
            mother=goldberg_mesh(m,n)
            expected_vertices={tuple(round(v,7) for v in notebook_point(m,r,k,l))
                               for k in range(m) for r in range(n+1) for l in range(r+1)}
            actual_vertices={tuple(round(v,7) for v in p) for p in mother['vertices_coords']}
            self.assertEqual(actual_vertices,expected_vertices)
            self.assertEqual(len(mother['faces_vertices']),m*n*n)
            self.assertEqual(check_geometry(mother)['status'],'passed')
            self.assertEqual(len(mother['vertices_coords'])-len(mother['edges_vertices'])+len(mother['faces_vertices']),1)
            area=sum(abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(ps,ps[1:]+ps[:1])))/2 for ps in ([mother['vertices_coords'][i] for i in face] for face in mother['faces_vertices']))
            self.assertAlmostEqual(area,m*n*n*math.sin(2*phi)/2,places=8)
            # Notebook MakeGoldbergTiling defines three edge families, not a
            # generic subdivision. Their welded edge set must match exactly.
            edge=lambda a,b:tuple(sorted((tuple(round(x,7) for x in a),tuple(round(x,7) for x in b))))
            expected={edge(a,b) for a,b in notebook_edges(m,n)}
            actual={edge(mother['vertices_coords'][a],mother['vertices_coords'][b]) for a,b in mother['edges_vertices']}
            self.assertEqual(actual,expected)

    def test_single_sector_patch_matches_original_n_squared_triangle_formula(self):
        # GoldbergPatch returns n² unit-edge-base isosceles triangles in one
        # wedge (notebook 242966–243068), before rotational joining.
        for m,n in ((3,1),(5,2),(8,3),(12,4)):
            with self.subTest(order=m,rings=n):
                patch=goldberg_patch_mesh(m,n)
                points=patch['vertices_coords']
                self.assertEqual(len(patch['faces_vertices']),n*n)
                self.assertEqual(len(points)-len(patch['edges_vertices'])+len(patch['faces_vertices']),1)
                self.assertEqual(check_geometry(patch)['status'],'passed')
                def triangle(r,l,upper):
                    indices=((r,l),(r+1,l),(r+1,l+1)) if upper else ((r,l),(r+1,l+1),(r,l+1))
                    return frozenset(tuple(round(v,7) for v in notebook_point(m,i,0,j)) for i,j in indices)
                expected={triangle(r,l,True) for r in range(n) for l in range(r+1)}
                expected.update(triangle(r,l,False) for r in range(n) for l in range(r))
                actual={frozenset(tuple(round(v,7) for v in points[i]) for i in face)
                        for face in patch['faces_vertices']}
                self.assertEqual(actual,expected)
                first=triangle(0,0,True)
                self.assertIn(first,actual)
                self.assertEqual(len(patch['zhezhi_goldberg_dual_targets']),n*n)

    def test_in_3323_seven_fold_two_ring_patch_preserves_original_tile_indices(self):
        # In[3323] displays GoldbergPatch[7,2] with TileIndices. The Table in
        # In[3322] emits each upper triangle and immediately its companion
        # lower triangle before advancing to the next cell.
        angle=2*math.pi/7
        c,s=math.cos(angle),math.sin(angle)
        origin=(0.,0.)
        one=(1.,0.)
        two=(2.,0.)
        first=(c,s)
        middle=(1+c,s)
        outer=(2*c,2*s)
        expected=[(origin,one,first),
                  (one,two,middle),
                  (one,middle,first),
                  (first,middle,outer)]
        reference=goldberg_reference_query(dict(mode='sector-patch',order=7,rings=2))
        self.assertEqual(reference['triangleCount'],4)
        self.assertEqual(len(reference['faces']),4)
        for numbered_face,original_tile in zip(reference['faces'],expected):
            self.assertTrue(all(any(math.dist(actual,target)<2e-9
                                    for actual in numbered_face)
                                for target in original_tile))
        patch=goldberg_patch_mesh(7,2)
        self.assertEqual(len(patch['zhezhi_goldberg_dual_targets']),4)
        for face,center in zip(reference['faces'],reference['dualTargets']):
            self.assertLess(max(abs(math.dist(center,point)-math.dist(center,face[0]))
                                for point in face[1:]),1e-8)
        # The adoptable mother is constructed from MakeGoldbergTiling's edge
        # graph, not the symbolic GoldbergPatch tile list. Its face order is
        # kept stable for saved dual-target indices, while centers must still
        # match the same geometric triangles.
        mother=goldberg_mesh(7,2)
        def face_key(face):
            return frozenset(tuple(round(value,7) for value in point)
                             for point in face)
        reference_centers={face_key(face):center for face,center in
                           zip(reference['faces'],reference['dualTargets'])}
        points=mother['vertices_coords']
        first_wedge=[([points[index] for index in face],center)
                     for face,center in zip(mother['faces_vertices'][:4],
                                            mother['zhezhi_goldberg_dual_targets'][:4])]
        self.assertEqual({face_key(face) for face,_ in first_wedge},
                         set(reference_centers))
        for face,center in first_wedge:
            self.assertLess(math.dist(center,reference_centers[face_key(face)]),1e-8)

    def test_offset_halves_keep_unit_seam_and_reciprocal_dual(self):
        for offset in (0,1,2,3):
            mother=goldberg_mesh(8,2,offset)
            self.assertEqual(check_geometry(mother)['status'],'passed')
            self.assertEqual(len(mother['faces_vertices']),32)
            targets=mother['zhezhi_goldberg_dual_targets']
            centers,dual=reciprocal_centers(mother,targets)
            self.assertLess(max(math.dist(a,b) for a,b in zip(centers,targets)),1e-8)
            owners=defaultdict(list)
            for i,face in enumerate(mother['faces_vertices']):
                for a,b in zip(face,face[1:]+face[:1]):owners[tuple(sorted((a,b)))].append(i)
            for (a,b),faces in owners.items():
                if len(faces)!=2:continue
                edge=[mother['vertices_coords'][b][j]-mother['vertices_coords'][a][j] for j in (0,1)]
                between=[centers[faces[1]][j]-centers[faces[0]][j] for j in (0,1)]
                self.assertAlmostEqual(sum(x*y for x,y in zip(edge,between)),0,places=7)
            self.assertEqual(len(dual['edges_vertices']),sum(len(v)==2 for v in owners.values()))
            result=generate(dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',goldbergOrder=8,goldbergRings=2,goldbergOffset=offset,goldbergOutput='twist'))
            self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
            self.assertEqual(result['stats']['checks']['local']['status'],'passed')
            self.assertEqual(result['stats']['tiles'],32)

    def test_all_face_duals_match_independent_bisector_solve(self):
        # MakeGoldbergTilingPrimalDualGraph delegates to the triangle
        # circumcenter reciprocal (notebook 246631–246664, 247130–247164).
        # Solve the two equal-distance linear equations independently of the
        # determinant formula used by goldberg_circumcenters.
        for m,n,o in ((3,1,0),(4,1,0),(5,2,0),(6,3,2),(8,2,3),(10,3,3)):
            with self.subTest(order=m,rings=n,offset=o):
                mother=goldberg_mesh(m,n,o)
                points=np.array(mother['vertices_coords'])
                self.assertEqual(len(mother['zhezhi_goldberg_dual_targets']),m*n*n)
                for face,target in zip(mother['faces_vertices'],mother['zhezhi_goldberg_dual_targets']):
                    a,b,c=points[face]
                    matrix=2*np.stack((b-a,c-a))
                    rhs=np.array((b@b-a@a,c@c-a@a))
                    self.assertLess(math.dist(np.linalg.solve(matrix,rhs),target),2e-8)

    def test_three_and_four_fold_central_dual_is_outside_or_on_boundary(self):
        # The central wedge has points 0, (1,0), (cos 2π/m,sin 2π/m).
        # Its circumcenter is (1/2,tan(π/m)/2). Its origin barycentric
        # weight is cos(2π/m)/(1+cos(2π/m)): negative for m=3, zero for
        # m=4, strictly positive for m>=5. Hence the m=3/4 primal-dual
        # twist is rejected while the original mother tiling stays valid.
        for m in (3,4,5):
            mother=goldberg_mesh(m,1)
            points=mother['vertices_coords']
            expected=[.5,.5*math.tan(math.pi/m)]
            central=next(i for i,face in enumerate(mother['faces_vertices'])
                         if any(math.dist(points[v],[0,0])<1e-8 for v in face)
                         and any(math.dist(points[v],[1,0])<1e-8 for v in face)
                         and any(math.dist(points[v],[math.cos(2*math.pi/m),math.sin(2*math.pi/m)])<1e-8 for v in face))
            self.assertLess(math.dist(mother['zhezhi_goldberg_dual_targets'][central],expected),2e-8)
            weight=math.cos(2*math.pi/m)/(1+math.cos(2*math.pi/m))
            if m==3:self.assertLess(weight,0)
            elif m==4:self.assertAlmostEqual(weight,0,places=12)
            else:self.assertGreater(weight,0)
            params=dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',goldbergOrder=m,goldbergRings=1)
            self.assertEqual(generate({**params,'goldbergOutput':'tiling'})['stats']['checks']['geometry']['status'],'passed')
            if m<5:
                with self.assertRaisesRegex(ValueError,'3/4 阶 Goldberg'):
                    validate_request({**params,'goldbergOutput':'twist'})
            else:
                self.assertEqual(generate({**params,'goldbergOutput':'twist'})['stats']['checks']['local']['status'],'passed')

    def test_offset_beyond_shared_seam_is_explicitly_rejected(self):
        # The notebook's raw line-list accepts o>=2n (246910–247000), but its
        # bridge then joins two face patches only at a point or across a gap.
        # Neither is a single connected sheet of faces for the twist pipeline.
        for m,n in ((6,1),(8,2),(6,3)):
            params=dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',
                        goldbergOrder=m,goldbergRings=n,goldbergOffset=2*n,goldbergOutput='tiling')
            with self.subTest(order=m,rings=n),self.assertRaisesRegex(ValueError,'小于两倍径向层数'):
                validate_request(params)
            with self.assertRaisesRegex(ValueError,'小于两倍径向层数'):
                goldberg_mesh(m,n,2*n)

    def test_offset_tile_seam_topology_and_saved_adoptable_examples(self):
        # In[3326] joins upper and lower tile lists without inventing a
        # connecting face. In[3327] saves (m,n,o)=(8,2,1). Their horizontal
        # boundary intervals overlap by 2*n-o; whole edges match only when o
        # is integral. At 2*n the patches touch at one vertex, beyond it a
        # raw line bridge connects boundaries without joining any faces.
        # Negative integral offsets also match whole seam edges in the tile
        # list, but the original MakeOffsetGoldbergTiling line constructor
        # explicitly aborts for o<0, so this does not establish a source CP.
        def seam(specs):
            edges=[set(),set()]
            for spec in specs:
                half=0 if spec['wedge']<=4 else 1
                vertices=spec['vertices']
                for a,b in zip(vertices,vertices[1:]+vertices[:1]):
                    if abs(a[1])<1e-8 and abs(b[1])<1e-8:
                        edges[half].add(tuple(sorted((round(a[0],8),round(b[0],8)))))
            return edges
        for offset,expected_common,expected_overlap in ((1,3,3),(-1,3,3),(4,0,0),(5,0,-1),(.5,0,3.5)):
            with self.subTest(offset=offset):
                upper,lower=seam(goldberg_tile_specs(8,2,offset,offset_tiling=True))
                self.assertEqual(len(upper & lower),expected_common)
                top=(min(a for a,_ in upper),max(b for _,b in upper))
                bottom=(min(a for a,_ in lower),max(b for _,b in lower))
                overlap=min(top[1],bottom[1])-max(top[0],bottom[0])
                self.assertAlmostEqual(overlap,expected_overlap,places=8)
                if offset==4:self.assertEqual(top[1],bottom[0])
                if offset==5:self.assertLess(top[1],bottom[0])
                if offset==.5:self.assertFalse({x for edge in upper for x in edge}
                                                    & {x for edge in lower for x in edge})

        # The saved complete and one-unit-offset examples already have a
        # continuous mother mesh and usable local crease candidates.
        for order,rings,offset in ((7,2,0),(8,2,1)):
            with self.subTest(saved=(order,rings,offset)):
                result=generate(dict(family='nonperiodic',kind='goldberg',
                    goldbergVersion='origamica',goldbergOrder=order,
                    goldbergRings=rings,goldbergOffset=offset,goldbergOutput='twist'))
                self.assertEqual(result['stats']['tiles'],order*rings*rings)
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'passed')

    def test_original_raw_line_list_supports_offsets_beyond_paper_mesh_domain(self):
        # Independent endpoint interpolation and exact translation/bridge
        # expressions from notebook 246285–246307 and 246910–247000.
        def edge(a,b):
            return tuple(sorted((tuple(round(x,7) for x in a),tuple(round(x,7) for x in b))))
        for m,n,o in ((6,1,2),(6,1,3),(8,2,4),(8,2,5),(8,2,6),(6,3,6),(6,3,8)):
            with self.subTest(order=m,rings=n,offset=o):
                expected=[]
                for a,b in notebook_edges(m,n):
                    shift=o/2 if a[1]<-1e-6 or b[1]<-1e-6 else -o/2
                    expected.append(edge((a[0]+shift,a[1]),(b[0]+shift,b[1])))
                expected.extend(edge((n+i-o/2,0),(n+i+1-o/2,0)) for i in range(o))
                actual=[edge(*segment) for segment in goldberg_line_segments(m,n,o)]
                self.assertEqual(len(actual),m*n*(3*n+1)//2+o)
                self.assertEqual(set(actual),set(expected))
                self.assertEqual(len(actual),len(set(actual)))
                # The upper right and lower left endpoints have no common
                # face edge once o reaches 2n. For o>2n the bridge spans a
                # literal empty interval between the two triangle patches.
                top_right=n-o/2
                lower_left=-n+o/2
                self.assertLessEqual(top_right,lower_left)
                if o>2*n:
                    gap_edges=[edge((top_right+i,0),(top_right+i+1,0)) for i in range(o-2*n)]
                    self.assertTrue(set(gap_edges).issubset(actual))
        with self.assertRaisesRegex(ValueError,'偶数阶'):
            goldberg_line_segments(7,2,4)
        with self.assertRaisesRegex(ValueError,'不得为负'):
            goldberg_line_segments(8,2,-1)
        with self.assertRaisesRegex(ValueError,'安全规模'):
            goldberg_line_segments(8,2,6000)

    def test_output_and_legacy_contracts_are_distinct(self):
        base=dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',goldbergOrder=7,goldbergRings=2)
        tiled=generate({**base,'goldbergOutput':'tiling'})
        self.assertEqual(tiled['source']['output'],'tiling')
        self.assertEqual(tiled['stats']['foldability'],'not_applicable')
        self.assertEqual(set(tiled['fold']['edges_assignment']),{'B','F'})
        self.assertEqual(len(tiled['mother']['faces_vertices']),28)
        short=generate({**base,'goldbergOrder':3,'goldbergOutput':'tiling'})
        self.assertEqual(short['stats']['foldability'],'not_applicable')
        legacy=generate(dict(family='nonperiodic',kind='goldberg',depth=1))
        self.assertNotEqual(legacy['mother']['faces_vertices'],tiled['mother']['faces_vertices'])
        for patch in (dict(goldbergVersion='legacy',goldbergOrder=4),dict(goldbergVersion='origamica',goldbergOrder=3),dict(goldbergVersion='origamica',goldbergOrder=4),dict(goldbergVersion='origamica',goldbergOrder=7,goldbergOffset=1),dict(goldbergVersion='origamica',goldbergOrder=8,goldbergRings=1,goldbergOffset=2),dict(goldbergVersion='origamica',goldbergOrder=8,goldbergRings=2,goldbergOffset=4),dict(goldbergVersion='origamica',goldbergOrder=6,goldbergRings=3,goldbergOffset=6),dict(goldbergVersion='origamica',goldbergOrder=16,goldbergRings=5)):
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({**base,**patch})

    def test_pruning_preserves_original_circumcenter_targets(self):
        mother=goldberg_mesh(8,2,1)
        boundary=[[-.65,-.65],[.65,-.65],[.65,.65],[-.65,.65]]
        pruned=prune_mesh(mother,boundary)
        self.assertLess(len(pruned['faces_vertices']),len(mother['faces_vertices']))
        targets=pruned['zhezhi_goldberg_dual_targets']
        self.assertEqual(len(targets),len(pruned['faces_vertices']))
        centers,_=reciprocal_centers(pruned,targets)
        self.assertLess(max(math.dist(a,b) for a,b in zip(centers,targets)),1e-8)
        result=generate(dict(family='nonperiodic',kind='goldberg',goldbergVersion='origamica',goldbergOrder=8,goldbergRings=2,goldbergOffset=1,goldbergOutput='twist',pruneBoundary=boundary))
        self.assertEqual(result['stats']['tiles'],len(targets))
        self.assertEqual(result['stats']['checks']['local']['status'],'passed')


if __name__=='__main__':unittest.main()
