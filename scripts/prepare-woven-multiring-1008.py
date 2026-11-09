"""Public-engine multi-ring fixtures, preserving complete original arrays."""
import copy,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from tessellate import generate
base=json.loads(Path('output/audits/woven-multiring-probe-1008.json').read_text(encoding='utf-8'))['params']
items=[('one-ring',base)]
two=copy.deepcopy(base);two['graph']['vertices'] += [[4,1],[5,1],[5,2],[4,2]];two['graph']['edges'] += [[9,10],[10,11],[11,12],[12,9]];two['graph']['ringHoles'].append(dict(face=0,component=2));items.append(('two-rings',two))
triangle=copy.deepcopy(base);triangle['graph']['vertices']=triangle['graph']['vertices'][:5]+[[2,2],[3,2],[2.5,3]];triangle['graph']['edges']=triangle['graph']['edges'][:8]+[[5,6],[6,7],[7,5]];triangle.update(optimization='origamica-merit',minPleat=.3,minBorderPleat=.05);items.append(('triangle-merit',triangle))
mixed=copy.deepcopy(base);mixed['graph']=dict(vertices=[[-2,-2],[2,-2],[2,2],[-2,2],[-1,-1],[1,-1],[1,1],[-1,1],[-.2,-1.7],[.2,-1.7],[.2,-1.3],[-.2,-1.3]],edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7],[8,9],[9,10],[10,11],[11,8]],holeFaces=[4],ringHoles=[dict(face=0,component=1)]);mixed['width']=.04;items.append(('cell-and-ring-hole',mixed))
concave=copy.deepcopy(base);concave['graph']['vertices']=concave['graph']['vertices'][:5]+[[2,2],[3,2],[3,2.4],[2.4,2.4],[2.4,3],[2,3]];concave['graph']['edges']=concave['graph']['edges'][:8]+[[5+i,5+(i+1)%6] for i in range(6)];items.append(('concave-ring',concave))
cases=[]
for name,p in items:
 r=generate(p);cases.append(dict(name=name,params=p,response=r));print(name,'V/E/F',len(r['fold']['vertices_coords']),len(r['fold']['edges_vertices']),len(r['fold']['faces_vertices']),'rings',sum(map(len,r['fold']['faces_holes'])),'closure',r['source']['closureError'])
Path('tests/fixtures/woven-multiring-1008.json').write_text(json.dumps(dict(cases=cases),ensure_ascii=False,indent=2),encoding='utf-8')
