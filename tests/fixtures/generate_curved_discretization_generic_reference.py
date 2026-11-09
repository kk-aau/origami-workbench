"""Generate independent references, without importing production functions."""
import json
from pathlib import Path
import mpmath as mp
mp.mp.dps = 80

def original_equations(fn, endpoints, interior):
    parameters = [mp.mpf(endpoints[0]), *interior, mp.mpf(endpoints[1])]
    points = [fn(s) for s in parameters]
    directions = []
    for a, b in zip(points, points[1:]):
        delta = [y-x for x, y in zip(a, b)]
        norm = mp.sqrt(sum(x*x for x in delta))
        directions.append([x/norm for x in delta])
    return tuple(sum((directions[i-1][j]-directions[i][j])*mp.diff(lambda s: fn(s)[j], parameters[i])
                     for j in range(len(points[i]))) for i in range(1, len(parameters)-1))

parabola = mp.findroot(lambda *x: original_equations(lambda s: [-s*s, s], [0, 1], x),
                      [mp.mpf('.25'), mp.mpf('.5'), mp.mpf('.75')], tol=mp.mpf('1e-65'))
oscillatory = mp.findroot(lambda *x: original_equations(lambda s: [s, mp.sin(12*s)], [0, 1], x),
                         [mp.mpf('.12485'), mp.mpf('1.193604'), mp.mpf('.542634')], tol=mp.mpf('1e-65'))
ray = lambda degree: [float(mp.cos(mp.pi*degree/180)), float(mp.sin(mp.pi*degree/180))]
kink = mp.pi/9
magnitude = mp.sin(4*mp.pi/9)/mp.sin(mp.pi/9)
data = {
 'sourceNotebookSHA256': '19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',
 'definitions': ['In[4087]', 'In[4089]', 'In[4092]'],
 'referenceMethod': '80-digit independent mpmath literal chord equations and analytic sector angles; no production imports',
 'wolframNumericOutAvailable': False,
 'parabola': {'curve': ['-s**2','s'], 'parameters': ['0',*[mp.nstr(v,75) for v in parabola],'1']},
 'oscillatoryUnconstrained': {'curve': ['s','sin(12*s)'], 'parameters': ['0',*[mp.nstr(v,75) for v in oscillatory],'1'],
                            'referenceBranch': 'root near (0.12485,1.193604,0.542634), not a Wolfram FindRoot-path claim'},
 'kink': {'foldPoints': [[float(-mp.cos(kink)),float(mp.sin(kink))],[0.,0.],[float(mp.cos(kink)),float(mp.sin(kink))]],
          'leftRulings': [ray(100)]*3, 'rightRulings': [ray(260)]*3,
          'multipliers': [mp.nstr(magnitude,75),mp.nstr(-magnitude,75),mp.nstr(magnitude,75)],
          'interiorAnglesDegrees': [60,100,120,80]},
}
target = Path(__file__).resolve().parents[2]/'tests/fixtures/curved-discretization-generic-reference-20261001.json'
target.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(target)
