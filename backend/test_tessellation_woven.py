import copy
import math
import unittest

from tessellate import generate,validate_request,check_geometry,check_local_conditions
from tessellation_line_groups import arrangement,chord_lines,random_lines,inset_faces
from tessellation_woven import woven_pattern,BOX


class WovenTests(unittest.TestCase):
    def test_three_modes_both_parities_and_true_isometric_folded_form(self):
        for mode in ('lines','chord','random'):
            for parity in (-1,1):
                with self.subTest(mode=mode,parity=parity):
                    result=generate(dict(family='woven-lines',mode=mode,parity=parity))
                    self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                    self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                    fold=result['fold'];cp=fold['vertices_coords'];ff=result['source']['foldedForm']
                    for face in fold['faces_vertices']:
                        for i,a in enumerate(face):
                            for b in face[i+1:]:self.assertAlmostEqual(math.dist(cp[a],cp[b]),math.dist(ff[a],ff[b]),places=7)
                    self.assertLess(result['source']['closureError'],1e-7)

    def test_width_owned_by_whole_collinear_line(self):
        lines=[[0,-.3,.06],[90,-.2,.12],[45,.4,.04]];data=arrangement(lines,BOX)
        for owner,width in zip(data['edgeLines'],data['edgeWidths']):
            if owner>=0:self.assertEqual(width,lines[owner][2])
        polygons=inset_faces(data)
        self.assertEqual(len(polygons),len(data['mesh']['faces_vertices']))
        a=woven_pattern(data)[0];b=woven_pattern(arrangement([[x,y,w*.8] for x,y,w in lines],BOX))[0]
        self.assertNotEqual(a['vertices_coords'],b['vertices_coords'])
        self.assertEqual(a['edges_vertices'],b['edges_vertices'])

    def test_saved_four_line_widths_and_near_collapse_probe(self):
        # Notebook In[3431]: x=1/1.5, y=.5/.9 in [0,2] x [0,1.5],
        # with alternating inset distances .2/.1 (strip widths .4/.2).
        boundary=[[0,0],[2,0],[2,1.5],[0,1.5]]
        lines=[[0,.5,.4],[0,.9,.2],[90,-1,.4],[90,-1.5,.2]]
        data=arrangement(lines,boundary)
        self.assertEqual([len(data['mesh'][key]) for key in
                          ('vertices_coords','edges_vertices','faces_vertices')],[16,24,9])
        for ratio in (2,2.99):
            with self.subTest(ratio=ratio):
                lines[0][2]=.2*ratio
                fold,flat,info=woven_pattern(arrangement(lines,boundary),parity=-1)
                self.assertEqual([len(fold[key]) for key in ('vertices_coords','faces_vertices')],[52,33])
                self.assertEqual(len(flat),52)
                self.assertLess(info['closureError'],1e-7)
                self.assertEqual(check_geometry(fold)['status'],'passed')
                self.assertEqual(check_local_conditions(fold)['status'],'passed')
        # The 0.4-wide middle band vanishes at this exact sum of half-widths;
        # a genuinely collapsed inset must still fail rather than emit a CP.
        lines[0][2]=.6
        with self.assertRaisesRegex(ValueError,'内缩边退化'):
            woven_pattern(arrangement(lines,boundary),parity=-1)

    def test_periodic_boundaries_and_stationary_face(self):
        data=arrangement([[0,-.4,.08],[0,.4,.08],[90,-.4,.08],[90,.4,.08]],BOX)
        p=data['mesh']['vertices_coords']
        pairs=[[i,j] for i,a in enumerate(p) for j,b in enumerate(p)
               if(abs(a[0]+1)<1e-8 and abs(b[0]-1)<1e-8 and abs(a[1]-b[1])<1e-8 and abs(a[1])<.9)
               or(abs(a[1]+1)<1e-8 and abs(b[1]-1)<1e-8 and abs(a[0]-b[0])<1e-8 and abs(a[0])<.9)]
        a,ff,info=woven_pattern(data,periodicity=pairs)
        self.assertEqual(len(info['periodVectors']),2)
        b,other,other_info=woven_pattern(data,periodicity=pairs,stationary=1)
        self.assertEqual(ff,other)
        self.assertNotEqual(a['vertices_coords'],b['vertices_coords'])
        for x,y in a['edges_vertices']:self.assertAlmostEqual(math.dist(a['vertices_coords'][x],a['vertices_coords'][y]),math.dist(b['vertices_coords'][x],b['vertices_coords'][y]),places=7)
        self.assertEqual(check_local_conditions(a)['status'],'passed')
        self.assertEqual(check_local_conditions(b)['status'],'passed')

    def test_periodic_repeat_can_change_pitch_along_its_direction(self):
        # Notebook 254479–254548 uses (new_b-new_a-dr) dot R90(dr) = 0:
        # only the displacement normal to the mother period is constrained.
        # This mother graph has x-period 2; its valid unfolded period is about
        # (2.120117, -0.102171). Fixing both components to dr rejected it.
        data=arrangement([[0,-.35,.055],[0,.42,.055],[90,-.42,.05],[90,.34,.05]],BOX)
        points=data['mesh']['vertices_coords']
        pairs=[[i,j] for i,a in enumerate(points) for j,b in enumerate(points)
               if abs(a[0]+1)<1e-8 and abs(b[0]-1)<1e-8
               and abs(a[1]-.42)<1e-8 and abs(b[1]-.42)<1e-8]
        self.assertEqual(len(pairs),1)
        fold,_,info=woven_pattern(data,periodicity=pairs)
        self.assertEqual(check_geometry(fold)['status'],'passed')
        self.assertEqual(check_local_conditions(fold)['status'],'passed')
        self.assertEqual(len(info['periodVectors']),1)
        self.assertGreater(math.hypot(*info['periodVectors'][0]),2.05)

    def test_line_without_crossings_and_partial_random_result(self):
        data=arrangement([[25,0,.05]],BOX)
        fold,_,_=woven_pattern(data)
        self.assertEqual(check_local_conditions(fold)['status'],'not_applicable')
        a,info=random_lines(20,.01,BOX,12,max_tries=1)
        self.assertEqual(info['generated'],1);self.assertEqual(info['attempts'],1)
        self.assertEqual(random_lines(20,.01,BOX,12,max_tries=1),(a,info))

    def test_small_line_edits_choose_a_planar_unfolding_branch(self):
        for angle in (44,45,46,47):
            with self.subTest(angle=angle):
                r=generate(dict(family='woven-lines',lines=[[0,-.25,1],[90,-.25,1.2],[angle,.4,.7]]))
                self.assertEqual(r['stats']['checks']['geometry']['status'],'passed')
        # At 48 degrees the narrow corner cell vanishes under these widths;
        # this is an infeasible inset, not a different unfolding branch.
        with self.assertRaisesRegex(ValueError,'内缩分区已消失'):
            generate(dict(family='woven-lines',lines=[[0,-.25,1],[90,-.25,1.2],[48,.4,.7]]))

    def test_chord_symmetry_and_custom_rotated_point_boundary(self):
        lines,boundary=chord_lines([[0,.4,.03]],7)
        self.assertEqual(len(lines),7)
        data=arrangement(lines,boundary)
        theta=2*math.pi/7
        points=data['mesh']['vertices_coords']
        for x,y in points:
            rotated=[x*math.cos(theta)-y*math.sin(theta),x*math.sin(theta)+y*math.cos(theta)]
            self.assertLess(min(math.dist(rotated,p) for p in points),1e-7)
        _,polygon=chord_lines([[0,.2,.03]],5,[[1,0]])
        self.assertEqual(len(polygon),5)

    def test_reject_invalid_inputs_without_partial_crease(self):
        for value in ({'mode':'other'},{'width':True},{'minPleat':0},{'parity':0},{'periodicity':[[0,0]]},{'lines':[[0,0,.01]]},{'mode':'random','order':7}):
            with self.subTest(value=value),self.assertRaises(ValueError):validate_request(dict(family='woven-lines',**value))
        with self.assertRaises(ValueError):arrangement([[0,0,.1],[60,0,.1],[120,0,.1]],BOX)
        with self.assertRaises(ValueError):arrangement([[0,.2,.1],[180,-.2,.1]],BOX)
        with self.assertRaises(ValueError):inset_faces(arrangement([[0,0,1.5],[0,.1,1.5]],BOX))
        with self.assertRaises(ValueError):woven_pattern(arrangement([[0,0,.1],[90,0,.1]],BOX),stationary=40)
        with self.assertRaises(ValueError):woven_pattern(arrangement([[0,0,.1],[90,0,.1]],BOX),periodicity=[[0,1]])


if __name__=='__main__':unittest.main()
