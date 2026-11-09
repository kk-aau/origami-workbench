"""Original In[3502] PotPanels is independent of rotational sector count."""
import json
import math
from pathlib import Path
import unittest
from unittest.mock import patch

from tessellate import generate
from tessellation_rectangular_pot import validate_rectangular_pot

FIXTURE = Path(__file__).resolve().parents[1]/'tests/fixtures/rectangular-repeat-panels-20261010.json'
BASE = {'family':'rectangular-pot', 'crossSection':[[0,0],[1,1],[1,2],[1,3],[2,4]],
        'sectors':5, 'panels':5, 'asymmetry':0, 'gapHalfAngleDeg':0,
        'flangeExcess':0, 'typeMinimumAngleDeg':10}


def literal_vertices(query):
    # Notebook In[3488] zero-gap symmetric branch, then In[3502] sequential join.
    # This independent reference does not call the production row/assembly code.
    phi = math.pi/query['sectors']; h=max(x for x,_ in query['crossSection'])*math.tan(phi)
    u=1/math.cos(phi/2)**2; radius=0.; expected=set()
    for level,(x,z) in enumerate(query['crossSection']):
        if level:radius+=math.dist(query['crossSection'][level-1],(x,z))
        w=x*math.tan(phi); wing=(h-w)*u/2
        cp=[(radius,y) for y in (0,w,w+wing,2*h-w-wing,2*h-w,2*h)]
        ff=(x*math.cos(2*phi),x*math.sin(2*phi),z)
        ee=(ff[0]+w*math.cos(2*phi-math.pi/2),ff[1]+w*math.sin(2*phi-math.pi/2),z)
        xyz=[(x,0,z),(x,w,z),
             (x+wing*math.cos(2*phi-math.pi/2),w+wing*math.sin(2*phi-math.pi/2),z),
             (ee[0]+wing*math.cos(math.pi/2),ee[1]+wing*math.sin(math.pi/2),z),ee,ff]
        for panel in range(query['panels']):
            angle=2*phi*panel;c,s=math.cos(angle),math.sin(angle)
            for p,q in zip(cp,xyz):
                expected.add(tuple(round(v,8) for v in
                    (p[0],p[1]+2*h*panel,c*q[0]-s*q[1],s*q[0]+c*q[1],q[2])))
    return expected


class RepeatedRectangularPanelsTests(unittest.TestCase):
    def test_original_literal_m_plus_one_and_two_m_keep_unique_flat_sheet(self):
        for panels,counts,overlap in [(6,(125,244,120),20),(10,(205,404,200),100)]:
            with self.subTest(panels=panels):
                query={**BASE,'panels':panels};response=generate(query)
                f=response['fold'];xyz=response['source']['foldedForm3D']
                self.assertEqual(tuple(response['stats'][k] for k in ('vertices','edges','faces')),counts)
                actual={tuple(round(v,8) for v in (*p,*q)) for p,q in zip(f['vertices_coords'],xyz)}
                self.assertEqual(actual,literal_vertices(query))
                self.assertEqual(len({tuple(p) for p in f['vertices_coords']}),counts[0])
                self.assertEqual(len({tuple(sorted(e)) for e in f['edges_vertices']}),counts[1])
                self.assertEqual(len({tuple(sorted(face)) for face in f['faces_vertices']}),counts[2])
                self.assertEqual(counts[0]-counts[1]+counts[2],1)
                error=max(abs(math.dist(f['vertices_coords'][a],f['vertices_coords'][b])-math.dist(xyz[a],xyz[b]))
                          for face in f['faces_vertices'] for i,a in enumerate(face) for b in face[i+1:])
                self.assertLess(error,1e-10)
                images={tuple(sorted(tuple(round(v,8) for v in xyz[i]) for i in face)) for face in f['faces_vertices']}
                self.assertEqual(counts[2]-len(images),overlap)
                self.assertEqual(response['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(response['stats']['checks']['layerOrder']['status'],'not_checked')
                self.assertFalse(response['source']['selfCollisionChecked'])
                self.assertFalse(response['source']['continuousRigidPathChecked'])
                self.assertTrue(response['source']['circumferentialRepetition']['spatialImagesOverlap'])

    def test_complete_previous_public_results_remain_exact(self):
        fixture=json.loads(FIXTURE.read_text(encoding='utf-8'))
        with patch('tessellation_rectangular_pot.time.perf_counter',return_value=0):
            for case in fixture['legacyCases']:
                with self.subTest(query=case['query']):
                    response=generate(case['query'])
                    self.assertEqual(response,case['response'])
                    self.assertNotIn('circumferentialRepetition',response['source'])

    def test_resource_boundary_and_nonintegral_counts_stay_closed(self):
        boundary=generate({**BASE,'panels':30})
        self.assertEqual(boundary['stats']['faces'],600)
        self.assertEqual(boundary['stats']['checks']['geometry']['status'],'passed')
        for count in (0,-1,31,6.0,6.5,True,float('inf')):
            with self.subTest(count=count),self.assertRaises(ValueError):
                validate_rectangular_pot({**BASE,'panels':count})
        # Long profiles retain the same original 600-face estimate.
        points=[[1,float(i)/2] for i in range(24)]
        self.assertEqual(validate_rectangular_pot({**BASE,'crossSection':points,'panels':5})['panels'],5)
        with self.assertRaises(ValueError):validate_rectangular_pot({**BASE,'crossSection':points,'panels':6})

    def test_bad_gap_still_rejects_and_flat_inset_preserves_true_coordinates(self):
        with self.assertRaises(ValueError):generate({**BASE,'panels':6,'gapHalfAngleDeg':1})
        original=generate({**BASE,'panels':6,'asymmetry':-1})
        decorated=generate({**BASE,'panels':6,'asymmetry':-1,'flatFlangeInset':.1})
        self.assertEqual(original['fold'],decorated['fold'])
        self.assertEqual(original['source']['foldedForm3D'],decorated['source']['foldedForm3D'])


if __name__=='__main__':unittest.main()
