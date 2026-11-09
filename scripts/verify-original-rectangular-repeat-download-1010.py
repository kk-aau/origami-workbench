"""Independent original row/edge/DCEL and actual JSON/FOLD/LINE DXF readback."""
from pathlib import Path
import collections,json,math

here=Path(__file__).resolve().parents[1]
directory=here/'output/original-rectangular-repeat-browser-1010'
def point(p):return tuple(round(float(v),8) for v in p)
def edge(a,b):return tuple(sorted((point(a),point(b))))
def original_grid(query):
    phi=math.pi/query['sectors'];pts=query['crossSection'];h=max(x for x,_ in pts)*math.tan(phi)
    u=1/math.cos(phi/2)**2;radius=0.;grid=[];vertex_pairs=set()
    for i,(x,z) in enumerate(pts):
        if i:radius+=math.dist(pts[i-1],(x,z))
        w=x*math.tan(phi);wing=(h-w)*u/2
        cp=[(radius,y) for y in (0,w,w+wing,2*h-w-wing,2*h-w,2*h)]
        ff=(x*math.cos(2*phi),x*math.sin(2*phi),z)
        ee=(ff[0]+w*math.cos(2*phi-math.pi/2),ff[1]+w*math.sin(2*phi-math.pi/2),z)
        xyz=[(x,0,z),(x,w,z),
             (x+wing*math.cos(2*phi-math.pi/2),w+wing*math.sin(2*phi-math.pi/2),z),
             (ee[0]+wing*math.cos(math.pi/2),ee[1]+wing*math.sin(math.pi/2),z),ee,ff]
        grid.append(cp)
        for panel in range(query['panels']):
            angle=2*phi*panel;c,s=math.cos(angle),math.sin(angle)
            for p,q in zip(cp,xyz):vertex_pairs.add(point((p[0],p[1]+2*h*panel,c*q[0]-s*q[1],s*q[0]+c*q[1],q[2])))
    edges={}
    for panel in range(query['panels']):
        p=lambda i,j:(grid[i][j][0],grid[i][j][1]+2*h*panel)
        for i in range(len(pts)-1):
            for j in range(6):
                a,b=p(i,j),p(i+1,j)
                if point(a)!=point(b):edges[edge(a,b)]=(a,b)
        for i in range(len(pts)):
            for j in range(5):
                a,b=p(i,j),p(i,j+1)
                if point(a)!=point(b):edges[edge(a,b)]=(a,b)
    return vertex_pairs,edges

def bounded_faces(vertices,edges):
    adjacency={i:[] for i in range(len(vertices))}
    for a,b in edges:adjacency[a].append(b);adjacency[b].append(a)
    for i,neighbors in adjacency.items():neighbors.sort(key=lambda j:math.atan2(vertices[j][1]-vertices[i][1],vertices[j][0]-vertices[i][0]))
    visited=set();found=[]
    for a,b in edges:
        for start in ((a,b),(b,a)):
            if start in visited:continue
            half=start;face=[]
            while half not in visited:
                visited.add(half);a,b=half;face.append(a)
                ring=adjacency[b];half=(b,ring[(ring.index(a)-1)%len(ring)])
            assert half==start
            area=sum(vertices[a][0]*vertices[b][1]-vertices[b][0]*vertices[a][1] for a,b in zip(face,face[1:]+face[:1]))
            if area>1e-9:found.append(tuple(sorted(face)))
    assert len(visited)==2*len(edges)
    return sorted(found)

def dxf_lines(text):
    tokens=text.strip().splitlines();pairs=[(tokens[i].strip(),tokens[i+1].strip()) for i in range(0,len(tokens),2)]
    result=[];i=0
    while i<len(pairs):
        if pairs[i]!=('0','LINE'):i+=1;continue
        i+=1;values={}
        while i<len(pairs) and pairs[i][0]!='0':values[pairs[i][0]]=pairs[i][1];i+=1
        result.append((edge((float(values['10']),-float(values['20'])),(float(values['11']),-float(values['21']))),values['8']))
    return result

rows=[]
for panels,counts in [(6,(125,244,120)),(10,(205,404,200))]:
    load=lambda suffix:json.loads((directory/f'panels-{panels}{suffix}').read_text(encoding='utf-8'))
    response=load('-response.json');project=load('.zhezhi.json');fold=load('.fold')
    query=response['stats']['parameters'];assert query['panels']==panels and query['asymmetry']==query['gapHalfAngleDeg']==query['flangeExcess']==0
    original_pairs,original_edges=original_grid(query)
    graph=response['fold'];xyz=response['source']['foldedForm3D'];flat=graph['vertices_coords']
    assert {point((*p,*q)) for p,q in zip(flat,xyz)}==original_pairs
    assert {edge(flat[a],flat[b]) for a,b in graph['edges_vertices']}==set(original_edges)
    assert bounded_faces(flat,graph['edges_vertices'])==sorted(tuple(sorted(face)) for face in graph['faces_vertices'])
    assert (len(flat),len(graph['edges_vertices']),len(graph['faces_vertices']))==counts
    err=max(abs(math.dist(flat[a],flat[b])-math.dist(xyz[a],xyz[b])) for face in graph['faces_vertices'] for i,a in enumerate(face) for b in face[i+1:]);assert err<1e-10
    metadata=project['metadata']['tessellation']
    # Backend's existing canonical parameters include a zero display inset;
    # the old UI stores the same default by omission. Every requested input survives.
    canonical=dict(metadata['parameters']);canonical.setdefault('flatFlangeInset',0)
    assert canonical==query and metadata['source']==response['source']
    assert metadata['source']['selfCollisionChecked'] is False and metadata['source']['continuousRigidPathChecked'] is False
    assert metadata['stats']['checks']['layerOrder']['status']=='not_checked'
    maxx=max(p[0] for p in flat);minx=min(p[0] for p in flat);maxy=max(p[1] for p in flat);miny=min(p[1] for p in flat)
    scale=200/max(maxx-minx,maxy-miny)
    normalized=lambda p:((p[0]-minx)*scale,(p[1]-miny)*scale)
    expected=collections.Counter(edge(normalized(a),normalized(b)) for a,b in original_edges.values())
    native=collections.Counter(edge(s['a'],s['b']) for s in project['segments']);assert native==expected
    folded=collections.Counter(edge(fold['vertices_coords'][a],fold['vertices_coords'][b]) for a,b in fold['edges_vertices']);assert folded==expected
    assert fold['zhezhi_metadata']['tessellation']['source']==response['source']
    dxf=dxf_lines((directory/f'panels-{panels}.dxf').read_text(encoding='utf-8'));assert len(dxf)==counts[1]
    assert collections.Counter(e for e,_ in dxf)==expected
    layers={'B':'CutLine','M':'MountainLine','V':'ValleyLine','U':'UnassignedLine','F':'FlatLine','A':'AuxiliaryLine'}
    assert collections.Counter(dxf)==collections.Counter((edge(s['a'],s['b']),layers[s['assignment']]) for s in project['segments'])

    tokens=(directory/f'panels-{panels}.dxf').read_text(encoding='utf-8').strip().splitlines();rawlines=[];values=None
    for code,value in zip(tokens[::2],tokens[1::2]):
        if code.strip()=='0':
            values={} if value.strip()=='LINE' else None
            if values is not None:rawlines.append(values)
        elif values is not None:values[code.strip()]=value.strip()
    assert len(rawlines)==len(project['segments'])
    for line,segment in zip(rawlines,project['segments']):
        assert tuple(float(line[k]) for k in ('10','20','11','21'))==(segment['a'][0],-segment['a'][1],segment['b'][0],-segment['b'][1])
        assert line['8']==layers[segment['assignment']]
    rows.append({'panels':panels,'actualFilesRead':4,'counts':counts,'literalCPAndFFRowsExact':True,'allOriginalEdgesOnce':True,'independentHalfEdgeFacesExact':True,'maximumIndependentFaceDistanceError':err,'projectParametersAndCompleteSourceExact':True,'jsonFoldDxfEdgeAndAssignmentReadback':True,'layerOrder':'not_checked'})
evidence={'schema':'rectangular-repeat-independent-download-readback-v1','passed':len(rows),'actualFilesRead':8,'cases':rows}
(directory/'independent-download-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(evidence,ensure_ascii=False))
