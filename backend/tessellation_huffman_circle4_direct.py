"""Original In[4070] four arguments and all seventeen return items.

The existing closed-column query remains separate. A direct call neither
invokes In[4071]'s FindRoot nor certifies closure/physical adoption.
"""
import math
import numpy as np
from tessellation_huffman_column import Circle4Audit,Circle4Parameters,HALF_PI,THIRD_RULING_OFFSET

ITEMS=('f0','f1','f2','f3','ff0','ff1','ff2','ff3','xL','xR','yL','yR','z','pv','q','gamma1','gamma2')
BUDGET=12000

def validate_circle4_direct(data):
    if not isinstance(data,dict) or set(data)!={'family','mode','parametersDeg','divisions'} or data.get('family')!='huffman-circle4-in4072' or data.get('mode')!='direct-four-arguments':
        raise ValueError('HCwCCircle4 direct input requires four numeric angles and sampling divisions.')
    values=data['parametersDeg']
    if not isinstance(values,list) or len(values)!=4 or any(type(v) not in (int,float) or not math.isfinite(v) for v in values):
        raise ValueError('Four finite real degree arguments are required; booleans and formulas are not accepted.')
    # Explicitly documented local real domain, not a claim to implement the
    # whole unrestricted Wolfram NumericQ (including complex) predicate.
    Circle4Parameters(*map(math.radians,values))
    n=data['divisions']
    if type(n) is not int or not 8<=n<=64:
        raise ValueError('Sampling divisions must be an integer from 8 through 64.')
    return {'family':'huffman-circle4-in4072','mode':'direct-four-arguments','parametersDeg':list(values),'divisions':n}

def unit(v):
    n=float(np.linalg.norm(v))
    if not math.isfinite(n) or n<=1e-10:raise ValueError('An original mirror plane or pivot direction is singular.')
    return np.asarray(v)/n

def query_circle4_direct(data):
    query=validate_circle4_direct(data);args=list(map(math.radians,query['parametersDeg']))
    model=Circle4Audit(Circle4Parameters(*args),max_evaluations=BUDGET)
    frames=model.sample(query['divisions']);first,last=frames[0],frames[-1]
    yL=unit(np.cross(last['ff2']-last['ff1'],last['ff0']-last['ff1']))
    yR=model._axis.copy();z=unit(np.cross(yL,yR));xL=np.cross(yL,z);xR=np.cross(yR,z)
    pv=unit((first['ff2']+first['ff0'])/2-first['ff1'])
    constants={'xL':xL,'xR':xR,'yL':yL,'yR':yR,'z':z,'pv':pv}
    rows=[]
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
    residuals=model.closure_residuals().tolist()
    result={'family':'origamica-huffman-circle4-direct','query':query,
      'source':{'function':'HCwCCircle4','constructionCell':'In[4070]','argumentUnits':'radians','arguments':args,'originalArgumentPredicate':'NumericQ',
        'implementedDomain':'0<ti1<ti2<pi/2;0<gamma1i<pi;-pi<gamma2i<0;finite-real-and-nonsingular',
        'originalNumericQDomainComplete':False,'originalReturnNames':list(ITEMS),'representation':'sampled-original-17-return-items','wolframExecuted':False},
      'originalItems':original,'sample':{'rows':rows,'pairedBlocks':2},
      'closure':{'mode':'not-enforced','residuals':residuals,'maximumAbsoluteResidual':max(map(abs,residuals)),'closedColumnCertified':False,'rootSearchExecuted':False},
      'certification':{'thirdRulingOffset':THIRD_RULING_OFFSET,'completeBlockExactIsometry':False,'exactStraightCreaseFOLD':False,'adoptableCreasePattern':False,'deploymentPathChecked':False,'selfCollisionChecked':False},
      'numerics':{'method':'existing-RK45-angle-and-Darboux','evaluationCount':model.integration_evaluations,'evaluationBudget':BUDGET,'initialDarboux':[[1,0,0],[0,0,1],[-1,0,0],[0,-1,0]]}}
    # Enforce the literal geometry before permitting it to leave the worker.
    for r in rows:
        if not all(math.isfinite(float(v)) for g in ('flat','folded','flatMirror','foldedMirror') for p in r[g] for v in p):raise ValueError('Nonfinite direct HCwCCircle4 geometry.')
        if abs(r['foldedThirdRulingLength']-r['flatThirdRulingLength']-THIRD_RULING_OFFSET)>1e-12:raise ValueError('Original third-ruling offset was lost.')
    if not all(math.isfinite(v) for v in residuals):raise ValueError('Nonfinite original closure diagnostics.')
    return result
