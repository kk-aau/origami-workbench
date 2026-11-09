import sys,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellation_woven_graph import woven_graph_data
from tessellation_patterns import planar_faces
from tessellate import generate
graph=dict(vertices=[[-2,-2],[2,-2],[2,2],[-2,2],[-1,-1],[1,-1],[1,1],[-1,1]],edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])
faces=planar_faces(graph['vertices'],graph['edges']);hole=next(i for i,f in enumerate(faces) if set(f)=={4,5,6,7})
params=dict(family='woven-lines',mode='graph',graph=dict(graph,holeFaces=[hole]),width=.08,parity=1,minPleat=1,minBorderPleat=.01,borderInset='auto',stationaryFace=0)
response=generate(params)
out=root/'output/audits/woven-mother-holes-probe-1008.json';out.write_text(json.dumps(dict(params=params,response=response),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(holeFace=hole,stats=response['stats'],source=response['source'].get('wovenMotherHoles')),ensure_ascii=False))
