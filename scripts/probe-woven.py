import json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from tessellation_line_groups import arrangement,chord_lines,random_lines
from tessellation_woven import woven_pattern
from tessellate import check_local_conditions

box=[[-1,-1],[1,-1],[1,1],[-1,1]]
cases=[('cross',[[0,0,.1],[90,0,.1]],box),('oblique',[[0,0,.1],[60,0,.15]],box),
       ('three',[[0,-.25,.1],[90,-.25,.15],[45,.4,.07]],box),
       ('grid',[[0,-.4,.08],[0,.4,.06],[90,-.4,.1],[90,.4,.07]],box)]
lines,boundary=chord_lines([[0,.4,.035]],7);cases.append(('star',lines,boundary))
lines,_=random_lines(5,.15,box,12,width=.04);cases.append(('random',lines,box))
results=[]
for name,lines,boundary in cases:
    start=time.perf_counter()
    try:
        fold,flat,info=woven_pattern(arrangement(lines,boundary))
        check=check_local_conditions(fold)
        print(name,len(fold['vertices_coords']),check,info['closureError'],info['solveEvaluations'],time.perf_counter()-start,flush=True)
        results.append(dict(name=name,fold=fold,flat=flat,info=info))
    except Exception as e:print(name,type(e).__name__,str(e),time.perf_counter()-start,flush=True)
Path('output/woven-probe.json').write_text(json.dumps(results))
