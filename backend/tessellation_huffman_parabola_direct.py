"""The real four numeric arguments and 17 items in partial In[4058]."""
import math
import numpy as np
from tessellation_huffman_parabola import ParabolaAudit,ParabolaParameters,HALF_PI,THIRD_RULING_OFFSET

ITEMS=('f0','f1','f2','f3','ff0','ff1','ff2','ff3','xL','xR','yL','yR','z','pv','q','gamma1','gamma2')
BUDGET=12000
def validate_parabola_direct(data):
    if not isinstance(data,dict) or set(data)!={'family','mode','parametersDeg','divisions'} or data.get('family')!='huffman-parabola-in4060' or data.get('mode')!='direct-four-arguments':
        raise ValueError('HCwCParabola direct input requires four numeric angles and sampling divisions.')
    values=data['parametersDeg']
    if not isinstance(values,list) or len(values)!=4 or any(type(v) not in (int,float) or not math.isfinite(v) for v in values):
        raise ValueError('Four finite real degree arguments are required; booleans and formulas are not accepted.')
    ParabolaParameters(*map(math.radians,values))
    n=data['divisions']
    if type(n) is not int or not 8<=n<=64:raise ValueError('Sampling divisions must be an integer from 8 through 64.')
    return {'family':'huffman-parabola-in4060','mode':'direct-four-arguments','parametersDeg':list(values),'divisions':n}
def unit(v):
    n=float(np.linalg.norm(v))
    if not math.isfinite(n) or n<=1e-10:raise ValueError('An original mirror plane or pivot direction is singular.')
    return np.asarray(v)/n
def query_parabola_direct(data):
    query=validate_parabola_direct(data);args=list(map(math.radians,query['parametersDeg']))
    model=ParabolaAudit(ParabolaParameters(*args),max_evaluations=BUDGET);frames=model.sample(query['divisions']);first,last=frames[0],frames[-1]
    yL=unit(np.cross(last['ff2']-last['ff1'],last['ff0']-last['ff1']));yR=model._axis.copy();z=unit(np.cross(yL,yR));xL=np.cross(yL,z);xR=np.cross(yR,z);pv=unit((first['ff2']+first['ff0'])/2-first['ff1'])
    constants={'xL':xL,'xR':xR,'yL':yL,'yR':yR,'z':z,'pv':pv};rows=[]
    for item in model.paired_sample(query['divisions']):
        b=item['base'];rows.append({'t':float(b['t']),'anglesDeg':[math.degrees(float(b[k])) for k in ('q','gamma1','gamma2')],
          'flat':[b['f'+str(i)].tolist() for i in range(4)],'folded':[b['ff'+str(i)].tolist() for i in range(4)],
          'flatMirror':[item['flatMirror']['f'+str(i)].tolist() for i in range(4)],'foldedMirror':[item['foldedMirror']['ff'+str(i)].tolist() for i in range(4)],
          'flatThirdRulingLength':float(b['flatThirdRulingLength']),'foldedThirdRulingLength':float(b['foldedThirdRulingLength'])})
    original=[]
    for name in ITEMS:
        if name in constants:original.append({'name':name,'kind':'constant-vector','dimension':3,'value':constants[name].tolist()})
        elif name in ('q','gamma1','gamma2'):original.append({'name':name,'kind':'scalar-function-samples','domain':[0,HALF_PI],'values':[float(f[name]) for f in frames]})
        else:original.append({'name':name,'kind':'vector-function-samples','dimension':3 if name.startswith('ff') else 2,'domain':[0,HALF_PI],'values':[f[name].tolist() for f in frames]})
    for r in rows:
        if not all(math.isfinite(float(v)) for g in ('flat','folded','flatMirror','foldedMirror') for p in r[g] for v in p):raise ValueError('Nonfinite direct HCwCParabola geometry.')
        if abs(r['foldedThirdRulingLength']-r['flatThirdRulingLength']-THIRD_RULING_OFFSET)>1e-12:raise ValueError('Original third-ruling offset was lost.')
        p=r['flat'][2]
        if abs(p[0]+p[1]**2/8-2)>1e-8:raise ValueError('Original confocal parabola equation did not verify.')
    return {'family':'origamica-huffman-parabola-direct','query':query,
      'source':{'function':'HCwCParabola','constructionCell':'In[4058]','argumentUnits':'radians','arguments':args,'originalArgumentPredicate':'NumericQ',
        'implementedDomain':'0<ti1<ti2<pi/2;0<gamma1i<pi;-pi<gamma2i<0;finite-real-and-nonsingular',
        'originalNumericQDomainComplete':False,'originalCompletionStatus':'partially-worked-out','originalReturnNames':list(ITEMS),'representation':'sampled-original-17-return-items','wolframExecuted':False},
      'originalItems':original,'sample':{'rows':rows,'pairedBlocks':2},
      'diagnostics':{'terminalParabolaParameterDeg':rows[-1]['anglesDeg'][0],'closureConditionsSaved':False,'thirdRulingLengthDifference':THIRD_RULING_OFFSET,'parabolaEquation':'x + y^2/8 = 2'},
      'certification':{'thirdRulingOffset':THIRD_RULING_OFFSET,'completeBlockExactIsometry':False,'exactStraightCreaseFOLD':False,'adoptableCreasePattern':False,'deploymentPathChecked':False,'selfCollisionChecked':False},
      'numerics':{'method':'existing-RK45-angle-and-Darboux','evaluationCount':model.integration_evaluations,'evaluationBudget':BUDGET,'initialDarboux':[[1,0,0],[0,0,1],[-1,0,0],[0,-1,0]]}}
