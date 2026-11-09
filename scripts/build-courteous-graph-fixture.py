"""Regenerate finite numerical producer samples; independent oracle is separate."""
import json
from pathlib import Path
import sys
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from tessellate import generate
from tessellation_courteous_graph import original_graph

base=dict(family='woven-lines',mode='random',randomVersion='original-courteous-graph',boundary=[[-1,-1],[1,-1],[1,1],[-1,1]],count=2,minDistance=.05,seed=0,maxTries=20000,width=.02,parity=1,minPleat=.1,minBorderPleat=.001,borderInset='auto',stationaryFace=0,optimization='origamica-merit')
queries=[('seed0-default',base),('seed1',dict(base,seed=1)),('seed0-zero-intersection',dict(base,intersectionTolerance=0)),('seed0-narrow-tolerances',dict(base,samePtTolerance=1e-8,intersectionTolerance=2e-6)),('seed0-clockwise',dict(base,boundary=list(reversed(base['boundary'])))),('seed0-width',dict(base,width=.025))]
cases=[]
for name,params in queries:
    with patch('time.perf_counter',return_value=0):response=generate(params)
    cases.append(dict(name=name,params=response['stats']['parameters'],response=response))
primitives=[
    ('cross',[[[0.,0.],[1.,0.]],[[.5,-1.],[.5,1.]]],1e-6,1e-6),
    ('near-t-connect',[[[0.,0.],[1.,0.]],[[.5,.03125],[.5,1.]]],.04,.03125),
    ('near-t-separate',[[[0.,0.],[1.,0.]],[[.5,.03125],[.5,1.]]],.001,.03125),
    ('near-t-under-limit',[[[0.,0.],[1.,0.]],[[.5,.03125],[.5,1.]]],.04,.031),
    ('duplicate-reverse',[[[0.,0.],[1.,0.]],[[1.,0.],[0.,0.]]],1e-6,1e-6),
    ('partial-overlap',[[[0.,0.],[4.,0.]],[[2.,0.],[6.,0.]]],1e-6,1e-6),
    ('three-way-cross',[[[-1.,0.],[1.,0.]],[[0.,-1.],[0.,1.]], [[-1.,-1.],[1.,1.]]],1e-6,1e-6),
]
primitive_cases=[]
for name,segments,same_tol,intersection_tol in primitives:
    _,proof=original_graph(segments,same_tol,intersection_tol)
    primitive_cases.append(dict(name=name,completeLines=segments,samePtTolerance=same_tol,intersectionTolerance=intersection_tol,proof=proof))
mother=cases[0]['response']['mother'];owners=cases[0]['response']['source']['edgeLines']
full=dict(edgeCount=len(owners),entries=[dict(edge=i,line=owners[i],from_=mother['vertices_coords'][a],to=mother['vertices_coords'][b],inset=.01) for i,(a,b) in enumerate(mother['edges_vertices'])])
for entry in full['entries']:entry['from']=entry.pop('from_')
segments=[dict(line=owners[i],from_=mother['vertices_coords'][a],to=mother['vertices_coords'][b],inset=.0125) for i,(a,b) in enumerate(mother['edges_vertices']) if owners[i]==0]
for entry in segments:entry['from']=entry.pop('from_')
inset_cases=[]
for name,params in [('full-original-graph-h',dict(base,fullEdgeInsets=full)),('segment-original-graph-h',dict(base,segmentInsets=segments))]:
    with patch('time.perf_counter',return_value=0):response=generate(params)
    inset_cases.append(dict(name=name,params=response['stats']['parameters'],response=response))
target=ROOT/'tests/fixtures/courteous-graph-20261010.json'
target.write_text(json.dumps(dict(cases=cases,primitiveCases=primitive_cases,insetCases=inset_cases),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(target=str(target),cases=len(cases),primitiveCases=len(primitive_cases),insetCases=len(inset_cases))))
