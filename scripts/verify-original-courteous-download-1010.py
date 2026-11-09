"""Independent actual-file oracle; imports no construction/producer modules."""
from pathlib import Path
from decimal import Decimal,localcontext
import hashlib
import json
import math
import random

HERE=Path(__file__).resolve().parent.parent
OUT=HERE/'output/original-ring-unsafe-courteous-browser-1010/courteous'
checks=[];files=[];measurements=[]


def check(value,label):
    assert value,label
    checks.append(label)


def read(name):
    path=OUT/name;raw=path.read_bytes()
    files.append({'path':str(path.relative_to(HERE)),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
    return json.loads(raw) if path.suffix in ('.json','.fold') else raw.decode('utf-8')


def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def sub(a,b):return [a[0]-b[0],a[1]-b[1]]
def near(a,b,tolerance=1e-9):
    if isinstance(b,(float,int)) and not isinstance(b,bool):return isinstance(a,(float,int)) and not isinstance(a,bool) and abs(a-b)<=tolerance*max(1,abs(b))
    if isinstance(b,list):return isinstance(a,list) and len(a)==len(b) and all(near(x,y,tolerance) for x,y in zip(a,b))
    if isinstance(b,dict):return isinstance(a,dict) and set(a)==set(b) and all(near(a[k],v,tolerance) for k,v in b.items())
    return a==b


def literal_stream(p):
    """Original polar draws and literal acceptance; clipping via independent
    line-edge intersections rather than the producer's half-plane interval.
    """
    boundary=p['boundary'];existing=[[a[:],b[:]] for a,b in zip(boundary,boundary[1:]+boundary[:1])]
    old=[q[:] for q in boundary]
    lo=[min(q[k] for q in boundary) for k in (0,1)];hi=[max(q[k] for q in boundary) for k in (0,1)]
    center=[(a+b)/2 for a,b in zip(lo,hi)];radius=math.dist(lo,hi);rng=random.Random(p['seed'])
    draws=[];provider=candidates=outside=failures=nonintersection=resource=0;stop=None
    orientation=1 if sum(cross(a,b) for a,b in zip(boundary,boundary[1:]+boundary[:1]))>0 else -1
    epsilon=32*math.ulp(max(1,*(abs(v) for q in boundary for v in q))**2)
    def inside(q):return all(orientation*cross(sub(b,a),sub(q,a))>=-epsilon for a,b in zip(boundary,boundary[1:]+boundary[:1]))
    def draw():
        v=rng.random();draws.append(v);return v
    while len(existing)-len(boundary)<p['count'] and failures<p['maxTries'] and resource<5000:
        point=None
        while point is None and resource<5000:
            provider+=1;resource+=1;r=draw();theta=draw()*2*math.pi
            q=[center[0]+radius*r*math.cos(theta),center[1]+radius*r*math.sin(theta)]
            if inside(q):point=q
            else:outside+=1
        if resource>=5000:stop='resource-attempts';break
        resource+=1;candidates+=1;theta=draw()*2*math.pi;direction=[math.cos(theta),math.sin(theta)]
        hits=[]
        for a,b in zip(boundary,boundary[1:]+boundary[:1]):
            edge=sub(b,a);det=cross(direction,edge)
            if det==0:continue
            t=cross(sub(a,point),edge)/det;u=cross(sub(a,point),direction)/det
            if -1e-12<=u<=1+1e-12:hits.append((t,[point[k]+t*direction[k] for k in (0,1)]))
        assert len(hits)>=2
        hits.sort();segment=[hits[0][1],hits[-1][1]];newints=[]
        for a,b in existing:
            d=sub(segment[1],segment[0]);edge=sub(b,a);det=cross(d,edge)
            if det==0:continue
            t=cross(sub(a,segment[0]),edge)/det;q=[segment[0][k]+t*d[k] for k in (0,1)]
            if inside(q):newints.append(q)
        if len(newints)<=2 and len(existing)!=len(boundary):nonintersection+=1;continue
        if any(math.dist(a,b)<p['minDistance'] for i,a in enumerate(newints) for b in newints[i+1:]) or any(math.dist(a,b)<p['minDistance'] for a in newints for b in old):
            failures+=1;continue
        existing.append(segment);old.extend(newints)
    stop=stop or ('goal' if len(existing)-len(boundary)==p['count'] else 'distance-failures' if failures>=p['maxTries'] else 'resource-attempts')
    return {'completeLines':existing,'randomDraws':draws,'attempts':candidates,'providerAttempts':provider,
            'outsideCenterRejections':outside,'distanceFailures':failures,'noInteriorIntersectionRejections':nonintersection,
            'resourceAttempts':resource,'stopReason':stop}


def segment_rows(doc):return [[s['a'],s['b'],s['assignment']] for s in doc['segments']]
def canonical(a,b,assignment):return tuple(sorted((tuple(round(x,8) for x in a),tuple(round(x,8) for x in b))))+(assignment,)


def check_response(r,label):
    p=r['stats']['parameters'];s=r['source']['courteousAnarchy'];oracle=literal_stream(p)
    check(p['randomVersion']=='original-courteous',label+': original mode in actual canonical params')
    check(s['function']=='MakeCourteousAnarchyLines' and s['definitionLines']==[[251806,251819],[251821,252110]],label+': precise source contract')
    check(s['randomDraws']==oracle['randomDraws'],label+': independently seeded Python uniform draw sequence exact')
    check(near(s['completeLines'],oracle['completeLines'],1e-11),label+': independent polar stream and ordered complete Line endpoints')
    check(all(s[k]==v for k,v in oracle.items() if k not in ('completeLines','randomDraws')),label+': every original fail/rejection/provider/resource counter and stop exact')
    check(s['resourceAttempts']==s['providerAttempts']+s['attempts'] and s['resourceAttempts']<=5000 and len(s['randomDraws'])==2*s['providerAttempts']+s['attempts'],label+': total resource covers provider retries')
    check(not s['wolframExecuted'] and not s['wolframSeedSequenceReproduced'] and not s['originalGraphOptionsReproduced'] and s['motherGraphRoute']=='local-arrangement-from-accepted-lines',label+': exact finite boundary and no Graph/runtime claim')
    cp=r['fold']['vertices_coords'];ff=r['source']['foldedForm'];edges=r['fold']['edges_vertices'];kinds=r['fold']['edges_assignment']
    check(r['stats']['checks']['geometry']['status']=='passed' and r['stats']['checks']['local']['status']=='passed',label+': actual generator gates passed')
    check(len(edges)==len({tuple(sorted(e)) for e in edges}) and all(math.dist(cp[a],cp[b])>1e-9 for a,b in edges),label+': no omitted/duplicate/zero CP edge')
    for i,(a,b) in enumerate(edges):
        for c,d in edges[i+1:]:
            if len({a,b,c,d})<4:continue
            da,db=sub(cp[b],cp[a]),sub(cp[d],cp[c]);det=cross(da,db)
            if abs(det)<1e-14:continue
            t=cross(sub(cp[c],cp[a]),db)/det;u=cross(sub(cp[c],cp[a]),da)/det
            assert not (1e-8<t<1-1e-8 and 1e-8<u<1-1e-8),(label,'CP crossing')
    check(True,label+': independent CP crossing audit')
    checked=0
    for vertex,q in enumerate(cp):
        incident=[i for i,e in enumerate(edges) if vertex in e]
        if any(kinds[i]=='B' for i in incident):continue
        angles=sorted(math.atan2(cp[edges[i][1] if edges[i][0]==vertex else edges[i][0]][1]-q[1],cp[edges[i][1] if edges[i][0]==vertex else edges[i][0]][0]-q[0])%(2*math.pi) for i in incident)
        assert len(angles)%2==0
        sectors=[(angles[(i+1)%len(angles)]-a)%(2*math.pi) for i,a in enumerate(angles)]
        assert abs(sum(sectors[::2])-math.pi)<1e-6
        assert abs(sum(kinds[i]=='M' for i in incident)-sum(kinds[i]=='V' for i in incident))==2
        checked+=1
    check(checked==r['stats']['checks']['local']['interiorVertices'],label+': independent Kawasaki/Maekawa at every interior vertex')
    maximum=Decimal(0)
    with localcontext() as ctx:
        ctx.prec=60
        def length(a,b):return sum((Decimal(str(x))-Decimal(str(y)))**2 for x,y in zip(a,b)).sqrt()
        for face in r['fold']['faces_vertices']:
            for i,a in enumerate(face):
                for b in face[i+1:]:maximum=max(maximum,abs(length(cp[a],cp[b])-length(ff[a],ff[b])))
    check(maximum<Decimal('1e-8'),label+': independent 60digit all-pairs CP/FF face isometry')
    measurements.append({'name':label,'cpCounts':[len(cp),len(edges),len(r['fold']['faces_vertices'])],
        'maximumFaceDistanceErrorDecimal':str(maximum),'uniformDraws':len(s['randomDraws']),'resourceAttempts':s['resourceAttempts']})
    return p


for name in ['seed-zero','seed-one']:
    response=read(name+'-response.json');params=check_response(response,name)
    doc=read(name+'.json');fold=read(name+'.fold');dxf=read(name+'.dxf')
    metadata=doc['metadata']['tessellation']
    check(metadata['parameters']==params and metadata['source']==response['source'],name+': actual ordinary native JSON retains full origin/params/accepted Lines/FF')
    check(fold['zhezhi_metadata']['tessellation']==metadata,name+': ordinary FOLD retains exact supported source metadata')
    check(fold['frame_classes']==['creasePattern'] and 'file_frames' not in fold,name+': ordinary FOLD is actual 2D CP, not a fake FF frame')
    rows=segment_rows(doc);doc_edges={canonical(*row) for row in rows}
    fold_edges={canonical(fold['vertices_coords'][a],fold['vertices_coords'][b],kind) for (a,b),kind in zip(fold['edges_vertices'],fold['edges_assignment'])}
    check(len(rows)==response['stats']['edges'] and len(doc_edges)==len(rows) and doc_edges==fold_edges,name+': ordinary FOLD/JSON every CP edge once with assignments')
    raw_cp=response['fold']['vertices_coords'];raw_edges=response['fold']['edges_vertices']
    first=doc['segments'][0];edge=raw_edges[0];vector=sub(raw_cp[edge[1]],raw_cp[edge[0]]);doc_vector=sub(first['b'],first['a'])
    scale=sum(x*y for x,y in zip(vector,doc_vector))/sum(x*x for x in vector)
    offset=[first['a'][k]-scale*raw_cp[edge[0]][k] for k in (0,1)]
    check(scale>0 and all(s['id']=='fold-'+str(i) and near(s['a'],[scale*raw_cp[a][k]+offset[k] for k in (0,1)]) and near(s['b'],[scale*raw_cp[b][k]+offset[k] for k in (0,1)]) for i,(s,(a,b)) in enumerate(zip(doc['segments'],raw_edges))),name+': normal paper normalization is uniform affine map of actual CP')
    lines=dxf.splitlines();pairs=[(int(lines[i].strip()),lines[i+1].strip()) for i in range(0,len(lines),2)]
    records=[];current=None
    for code,value in pairs:
        if code==0:
            if current is not None:records.append(current)
            current={'type':value}
        elif current is not None:current[code]=value
    if current:records.append(current)
    entities=[r for r in records if r['type']=='LINE'];layer_map={'MountainLine':'M','ValleyLine':'V','CutLine':'B','AuxiliaryLine':'A','UnassignedLine':'U','FlatLine':'F'}
    dx_edges=set()
    for entity in entities:
        kind=layer_map.get(entity.get(8));assert kind is not None,entity
        a=[float(entity[10]),-float(entity[20])];b=[float(entity[11]),-float(entity[21])]
        dx_edges.add(canonical(a,b,kind))
    check(len(entities)==len(rows) and len(dx_edges)==len(rows) and dx_edges==doc_edges,name+': ordinary R12 LINE DXF every actual CP edge once, correct y conversion and layers')
    check(not any(r['type'] in ['LWPOLYLINE','POLYLINE','ARC','SPLINE'] for r in records),name+': ordinary DXF remains LINE')

reopened=read('seed-zero-json-reopened.json');original=read('seed-zero.json')
check(reopened['metadata']['tessellation']==original['metadata']['tessellation'] and segment_rows(reopened)==segment_rows(original),'native source/project actual JSON reopening keeps all parameters/source/CP points exact')
reopened_fold=read('seed-one-fold-reopened.json');original=read('seed-one.json')
check(reopened_fold['metadata']['tessellation']==original['metadata']['tessellation'],'actual FOLD reopening retains native mode/source metadata')
check({canonical(*r) for r in segment_rows(reopened_fold)}=={canonical(*r) for r in segment_rows(original)},'actual FOLD reopening retains all CP geometry/assignment')
restored=read('seed-zero-restored-response.json');first=read('seed-zero-response.json')
for value in [restored,first]:value['stats'].pop('elapsedMs')
check(restored==first,'real reopened parameters reconstruct full original response except measured elapsed')
wide=read('seed-zero-wider-response.json');check_response(wide,'seed-zero-wider')
check(wide['source']['courteousAnarchy']['completeLines']==first['source']['courteousAnarchy']['completeLines'] and wide['fold']!=first['fold'],'actual width edit preserves original mother Lines and changes real CP')
legacy=read('legacy-switched-response.json')
check('randomVersion' not in legacy['stats']['parameters'] and 'courteousAnarchy' not in legacy['source'],'actual legacy switch has no new native/default false fields')
browser=read('browser-evidence.json');log=(OUT/'browser-tests.log').read_text(encoding='utf-8-sig')
check(browser['passed']==18 and not browser['errors'] and browser['actualOrdinaryFileDownloads']==8 and '### Error' not in log,'real final CLI result and browser checks passed')
for name in ['boundary-edited','boundary-seed','boundary-count']:
    r=read(name+'-response.json');check_response(r,name)
    check(r['stats']['parameters']['boundary'][0][0]==-1.05,name+': exact edited boundary is kept in reconstructed native params')
for name,mode in [('switch-graph','graph'),('switch-chord','chord')]:
    r=read(name+'-response.json')
    check(r['stats']['parameters']['mode']==mode and 'randomVersion' not in r['stats']['parameters'] and 'courteousAnarchy' not in r['source'],name+': no native random leftovers')
old=read('switch-old-response.json')
check(old['stats']['parameters']['wovenVersion']=='original-old' and 'randomVersion' not in old['stats']['parameters'] and 'courteousAnarchy' not in old['source'] and old['source']['oldWoven']['function']=='MakeSimpleWovenTessellationOld','actual original Old source preserved after native random switch')
switches=read('browser-switch-evidence.json')
check(switches['passed']==9 and not switches['errors'] and '### Error' not in (OUT/'browser-switches.log').read_text(encoding='utf-8-sig'),'actual mode/boundary/seed/count switch CLI passed')
report={'schema':'courteous-independent-actual-download-v1','producerImports':[],
        'passed':len(checks),'checks':checks,'measurements':measurements,'files':files,
        'actualOrdinaryFileDownloads':8,'originalGraphAllOptionsClaimed':False}
(OUT/'download-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':len(checks),'actualOrdinaryFileDownloads':8,'independentCPAndFF':len(measurements)}))
