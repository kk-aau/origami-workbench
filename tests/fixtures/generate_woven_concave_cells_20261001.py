"""Record real P42 responses; independent source checks live in backend tests."""
import copy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from tessellate import generate
from tessellation_woven_graph import woven_graph_data

GRAPH=dict(vertices=[[0,0],[1,0],[.2,.2],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]],
           edges=[[i,i%8+1] for i in range(1,9)]+[[0,i] for i in (1,3,5,7)])
BASE=dict(family='woven-lines',mode='graph',graph=GRAPH,width=.06,parity=1,
          minPleat=.1,minBorderPleat=.001,borderInset='auto',stationaryFace=0)

def records():
    data=woven_graph_data(GRAPH)
    full=dict(edgeCount=len(GRAPH['edges']),entries=[dict(edge=i,line=data['edgeLines'][i],
        **{'from':GRAPH['vertices'][a]},to=GRAPH['vertices'][b],inset=.012+.001*i)
        for i,(a,b) in enumerate(GRAPH['edges'])])
    queries=[('reflex-cell-positive',BASE),('reflex-cell-negative',dict(BASE,parity=-1)),
             ('reflex-cell-fixed-F3',dict(BASE,stationaryFace=2)),
             ('reflex-cell-none',dict(BASE,borderInset='none')),
             ('reflex-cell-full-insets',dict(BASE,fullEdgeInsets=full))]
    return [dict(name=name,params=copy.deepcopy(query),response=generate(query)) for name,query in queries]

if __name__=='__main__':
    target=Path(__file__).with_name('woven-concave-cells-20261001.json')
    target.write_text(json.dumps(dict(sourceNotebookSha256='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',
        sourceDefinitions=['In[931] InsetPoly','In[3428] MakeSimpleWovenTessellation','In[583] FlatFoldabilityCondition','UnfoldGraph2D'],
        cases=records()),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(target)
