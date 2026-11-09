"""Generate real independent-mother responses through the public API."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
single=dict(vertices=[[.001,.001],[1,0],[0,1],[-1,0],[0,-1]],edges=[[1,2],[2,3],[3,4],[4,1],[0,1],[0,2],[0,3],[0,4]])
graph=dict(vertices=single['vertices']+[[x+8,y] for x,y in single['vertices']],edges=single['edges']+[[a+5,b+5] for a,b in single['edges']])
base=dict(family='woven-lines',mode='graph',graph=graph,width=.08,parity=1,minPleat=1,minBorderPleat=.01,borderInset='auto',stationaryFace=0)
full=dict(edgeCount=16,entries=[dict(edge=e,line=kind,**{'from':graph['vertices'][a]},to=graph['vertices'][b],inset=.04) for e,((a,b),kind) in enumerate(zip(graph['edges'],woven_graph_data(graph)['edgeLines']))])
merit_single=dict(vertices=[[-1,-1],[1,-1],[1,1],[-1,1]],edges=[[0,1],[1,2],[2,3],[3,0],[0,2]])
merit_graph=dict(vertices=merit_single['vertices']+[[x+8,y] for x,y in merit_single['vertices']],edges=merit_single['edges']+[[a+4,b+4] for a,b in merit_single['edges']])
cases=[]
for name,params in [('pair',base),('fixed-second',dict(base,stationaryFace=4)),('full-insets',dict(base,fullEdgeInsets=full)),('empty-period',dict(base,periodicityEnabled=True,periodicity=[])),('periodic-pair',dict(base,periodicityEnabled=True,periodicity=[[1,6]])),('merit-cut-pair',dict(base,graph=merit_graph,optimization='origamica-merit',minPleat=.3,minBorderPleat=.05))]:
    response=generate(params);cases.append(dict(name=name,params=params,response=response));print(name,response['stats']['vertices'],response['stats']['edges'],response['stats']['faces'],response['source'].get('wovenIndependentMother'),flush=True)
(ROOT/'tests/fixtures/woven-independent-1008.json').write_text(json.dumps(dict(cases=cases),ensure_ascii=False,indent=2),encoding='utf8')
