"""Product woven layouts use a genuine isometric ribbon construction."""
import math
import unittest

from tessellate import generate, validate_request
from tessellation_box_woven import box_woven_layout


class BoxWovenTests(unittest.TestCase):
    def test_layout_clearance_at_all_public_limits(self):
        for weave in ('plain','basket','twill'):
            for count in range(2,7):
                for width in (.1,.25,.45):
                    xs,ys=box_woven_layout(dict(rows=count,columns=count,width=width,weave=weave))
                    for positions in (xs,ys):
                        self.assertGreaterEqual(min(b-a-width for a,b in zip(positions,positions[1:])),(1-width)/2-1e-12)
                        self.assertGreaterEqual(min(positions[0]-width/2,count-positions[-1]-width/2),(1-width)/4-1e-12)
                    if weave=='basket':
                        self.assertLess(xs[1]-xs[0],1)
                        if count>2:self.assertGreater(xs[2]-xs[1],1)
                    if weave=='twill' and count>3:
                        self.assertGreater(xs[1]-xs[0],1)
                        self.assertLess(xs[3]-xs[2],1)

    def test_default_patterns_are_distinct_and_preserve_folded_source_and_anchor(self):
        folds=[]
        for weave in ('plain','basket','twill'):
            result=generate(dict(family='woven',weave=weave))
            self.assertEqual(tuple(result['stats'][key] for key in ('vertices','edges','faces')),(88,148,61))
            self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
            self.assertEqual(result['stats']['checks']['local']['status'],'passed')
            source=result['source'];fold=result['fold'];folds.append(fold)
            self.assertEqual(len(source['foldedForm']),len(fold['vertices_coords']))
            self.assertTrue(0<=source['stationaryFoldFace']<len(fold['faces_vertices']))
            self.assertLess(source['closureError'],1e-6)
            self.assertEqual(source['stripWidth'],.25)
            self.assertEqual(source['singleSideInset'],.125)
            self.assertTrue(all(abs(w-.25)<1e-12 for w in source['edgeWidths'] if w))
            self.assertEqual(result['stats']['parameters']['family'],'woven')
            for axis in (0,1):
                self.assertAlmostEqual(min(p[axis] for p in source['foldedForm']),0,places=9)
                self.assertAlmostEqual(max(p[axis] for p in source['foldedForm']),3,places=9)
            for a,b in fold['edges_vertices']:
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                       math.dist(source['foldedForm'][a],source['foldedForm'][b]),places=6)
        self.assertTrue(all(folds[a]['vertices_coords']!=folds[b]['vertices_coords'] for a,b in ((0,1),(0,2),(1,2))))

    def test_phase_is_global_sign_reversal_of_identical_geometry(self):
        reverse={'M':'V','V':'M','B':'B'}
        for weave in ('plain','basket','twill'):
            front=generate(dict(family='woven',weave=weave,phase=0))
            back=generate(dict(family='woven',weave=weave,phase=1))
            self.assertEqual(front['fold']['vertices_coords'],back['fold']['vertices_coords'])
            self.assertEqual(front['fold']['faces_vertices'],back['fold']['faces_vertices'])
            self.assertEqual(front['source']['foldedForm'],back['source']['foldedForm'])
            self.assertEqual(front['source']['stationaryFoldFace'],back['source']['stationaryFoldFace'])
            self.assertEqual([reverse[a] for a in front['fold']['edges_assignment']],back['fold']['edges_assignment'])

    def test_width_and_size_extremes_have_closed_isometric_cp(self):
        for rows,columns in ((2,2),(3,3),(2,6),(6,6)):
            for width in (.1,.45):
                for weave in ('plain','basket','twill'):
                    with self.subTest(rows=rows,columns=columns,width=width,weave=weave):
                        result=generate(dict(family='woven',rows=rows,columns=columns,width=width,weave=weave))
                        self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                        self.assertEqual(result['stats']['checks']['local']['status'],'passed')
                        self.assertLess(result['source']['closureError'],1e-6)

    def test_public_limits_remain_bounded(self):
        for patch in ({'rows':7},{'columns':1},{'width':.099},{'width':.451},{'phase':2}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):
                validate_request(dict(family='woven',**patch))


if __name__=='__main__':unittest.main()
