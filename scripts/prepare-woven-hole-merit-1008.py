"""Public source fixtures for hole closure with the original square-sum objective."""
import sys,json,copy,math
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
base=json.loads((root/'tests/fixtures/woven-hole-merit-1008.json').read_text(encoding='utf8'))['params'];cases=[('asymmetric',base)]
sym=copy.deepcopy(base);sym['graph']['vertices'][0][0]=-2;cases.append(('exact-lower',sym))
for name,patch in [('reverse',dict(parity=-1)),('other-root',dict(stationaryFace=2)),('no-border',dict(borderInset='none'))]:cases.append((name,dict(base,**patch)))
scaled=copy.deepcopy(base);angle=.37;c,s=math.cos(angle),math.sin(angle);scaled['graph']['vertices']=[[3*(c*x-s*y)+50,3*(s*x+c*y)-70] for x,y in scaled['graph']['vertices']];scaled['width']*=3;cases.append(('rotated-scaled-translated',scaled))
full=copy.deepcopy(base);data=woven_graph_data(full['graph']);full['fullEdgeInsets']=dict(edgeCount=len(full['graph']['edges']),entries=[dict(edge=i,line=data['edgeLines'][i],**{'from':full['graph']['vertices'][a]},to=full['graph']['vertices'][b],inset=.04) for i,(a,b) in enumerate(full['graph']['edges'])]);cases.append(('full-insets',full))
pair=copy.deepcopy(base);g=pair['graph'];n=len(g['vertices']);g['vertices'] += [[x+6,y] for x,y in g['vertices'][:n]];g['edges'] += [[a+n,b+n] for a,b in g['edges'].copy()];g['holeFaces']=[4,9];pair['stationaryFace']=5;cases.append(('independent-other-root',pair))
out=[]
for name,params in cases:
    try:
        response=generate(params);out.append(dict(name=name,status='generated',params=params,response=response))
    except ValueError as exc:out.append(dict(name=name,status='not-certified',params=params,reason=str(exc)))
(root/'output/audits/woven-hole-merit-cases-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps([dict(name=c['name'],status=c['status'],closure=c['response']['source']['closureError'] if 'response' in c else None,reason=c.get('reason')) for c in out],ensure_ascii=False))
