"""Literal In[4038]/In[4042] source functions and arbitrary mirror lists.

Reflectu assumes a unit normal in the original. Raw input normals are retained;
the assumption is diagnosed independently, never repaired by Normalize.
"""
import math
from functools import lru_cache
import numpy as np
from tessellation_curved_generic_darboux import Expression,Taylor,IntervalTaylor,GenericDarbouxError,ROUNDING,dot,values
from tessellation_curved_generic_linked_expression import GenericLinkedError
from tessellation_curved_linked_common_interval import Interval

FAMILY='planar-sequence-native'
RESULT_FAMILY='origamica-native-planar-sequence'
BUDGET=1023
PRESET={'family':FAMILY,'baseCurve':['s','.2*s**2','0'],'director':['0','0','1'],
        'mirrors':[{'point':[0,0,1],'normal':[0,0,1]},
                   {'point':[0,0,2],'normal':[0,-math.sin(math.pi/12),math.cos(math.pi/12)]}],
        'composeReflections':True,'parameterStart':-.5,'parameterEnd':.8,
        'transverseStart':0.,'transverseEnd':3.,'segments':32,'rulingSegments':8}

class PlanarSequenceError(GenericDarbouxError):pass

def validate_planar_sequence_query(data):
    if not isinstance(data,dict) or set(data)!=set(PRESET) or data.get('family')!=FAMILY:
        raise PlanarSequenceError('input-contract','原镜像序列须给完整六源、镜面列表及所有数值域。')
    q=dict(data)
    for key in ('baseCurve','director'):
        if not isinstance(q[key],list) or len(q[key])!=3:
            raise PlanarSequenceError('input-contract','原B和D各须三个完整安全表达式。')
        for expression in q[key]:
            try:Expression(expression,'s')
            except GenericLinkedError as e:raise PlanarSequenceError('expression-contract','六源仅允许原白名单标量表达式。') from e
        q[key]=q[key].copy()
    def vector(v):
        if not isinstance(v,list) or len(v)!=3 or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e12 for x in v):
            raise PlanarSequenceError('mirror-contract','原镜面点及法向各须三个±10¹²内的有限数；不Normalize。')
        return [float(x) for x in v]
    if not isinstance(q['mirrors'],list) or len(q['mirrors'])>8:
        raise PlanarSequenceError('mirror-contract','镜面列表须为0–8个原点／法向对。')
    mirrors=[]
    for m in q['mirrors']:
        if not isinstance(m,dict) or set(m)!={'point','normal'}:
            raise PlanarSequenceError('mirror-contract','每个镜面须恰含point／normal。')
        mirrors.append({'point':vector(m['point']),'normal':vector(m['normal'])})
    q['mirrors']=mirrors
    if type(q['composeReflections']) is not bool:
        raise PlanarSequenceError('input-contract','ComposeReflections须为明确布尔值。')
    for key in ('parameterStart','parameterEnd','transverseStart','transverseEnd'):
        x=q[key]
        if type(x) not in (int,float) or not math.isfinite(x):raise PlanarSequenceError('input-contract','s／w端点须为有限实数。')
        q[key]=float(x)
    if not -10<=q['parameterStart']<q['parameterEnd']<=10 or not .01<=q['parameterEnd']-q['parameterStart']<=12:
        raise PlanarSequenceError('input-contract','s域须在−10…10内且跨度0.01–12。')
    if not -1e6<=q['transverseStart']<q['transverseEnd']<=1e6:
        raise PlanarSequenceError('input-contract','w域须递增且位于±10⁶内。')
    for key,lo,hi in [('segments',8,128),('rulingSegments',2,32)]:
        if type(q[key]) is not int or not lo<=q[key]<=hi:raise PlanarSequenceError('input-contract','显示密度超出有限预算。')
    return q

def reflect_vector(x,n):return [a-2*dot(x,n)*b for a,b in zip(x,n)]
def reflect_point(x,p,n):return [a-2*dot([a-b for a,b in zip(x,p)],n)*c for a,c in zip(x,n)]

class PlanarSequenceKernel:
    def __init__(self,q):
        self.q=q;self.base=[Expression(x,'s') for x in q['baseCurve']];self.director=[Expression(x,'s') for x in q['director']]
        self.parts=[f.affine_parts(Taylor.variable(q['parameterStart'],1)) for f in self.base]
        self.origin=[math.fsum(offset)+dynamic.value for offset,dynamic in self.parts]
        extent=[]
        for s in np.linspace(q['parameterStart'],q['parameterEnd'],9):
            extent += [math.hypot(*(f(Taylor.variable(float(s),1)).c[1] for f in self.base))*(q['parameterEnd']-q['parameterStart']),
                       math.hypot(*(f(Taylor.variable(float(s),0)).value for f in self.director))*(q['transverseEnd']-q['transverseStart'])]
        self.scale=max(extent) or 1.
        if not math.isfinite(self.scale):raise PlanarSequenceError('source-numerics','原源无法在有限数值尺度求值。')
        pending=[{'point':[(math.fsum([x]+[-a for a in offset])-dynamic.value)/self.scale for x,(offset,dynamic) in zip(m['point'],self.parts)],
                  'normal':m['normal'].copy()} for m in q['mirrors']]
        self.mirrors=[]
        while pending:
            m=pending.pop(0);self.mirrors.append(m)
            if q['composeReflections']:
                pending=[{'point':reflect_point(x['point'],m['point'],m['normal']),
                          'normal':reflect_vector(x['normal'],m['normal'])} for x in pending]
        self.normal_errors=[abs(dot(m['normal'],m['normal'])-1) for m in self.mirrors]
        self.normal_compatible=all(x<=64*np.finfo(float).eps for x in self.normal_errors)
        self.finite(q['parameterStart'])

    def stages(self,argument):
        s=(IntervalTaylor if isinstance(argument,Interval) else Taylor).variable(argument,1)
        b=[]
        for f,(offset0,dynamic0) in zip(self.base,self.parts):
            offsets,dynamic=f.affine_parts(s)
            b.append((dynamic-dynamic0.value+math.fsum(offsets+[-x for x in offset0]))/self.scale)
        d=[f(s)/self.scale for f in self.director];zero=s*0
        out=[{'parameter':zero,'base':b,'fold':b,'director':d}];denominators=[]
        for m in self.mirrors:
            p,n=m['point'],m['normal'];denominator=dot(d,n)
            v=dot([zero+x-y for x,y in zip(p,b)],n)/denominator
            f=[x+v*y for x,y in zip(b,d)]
            b=reflect_point(b,[zero+x for x in p],n);d=reflect_vector(d,n)
            out.append({'parameter':v,'base':b,'fold':f,'director':d});denominators.append(denominator)
        return out,denominators

    @lru_cache(maxsize=8192)
    def finite(self,s):
        try:
            stages,_=self.stages(float(s))
            if any(not math.isfinite(float(c)) for stage in stages for v in stage.values() for x in (v if isinstance(v,list) else [v]) for c in x.c):
                raise ValueError('nonfinite literal source')
            return stages
        except (ValueError,ZeroDivisionError,OverflowError) as e:
            raise PlanarSequenceError('source-singularity','原D·m为零或字面反射／交线无法有限求值；不移动镜面或修补法向。') from e

    def domain(self):
        q=self.q;stack=[(q['parameterStart'],q['parameterEnd'],0)];cells=[];unresolved=[];calls=0
        while stack:
            a,b,depth=stack.pop();calls+=1
            if calls>BUDGET:unresolved.extend([[a,b]]+[[x,y] for x,y,_ in stack]);break
            try:
                stages,den=self.stages(Interval(a,b))
                bounds=[[Interval.cast(x.value).lo,Interval.cast(x.value).hi] for x in den]
                if any(lo<=0<=hi or not math.isfinite(lo+hi) for lo,hi in bounds):raise ValueError('division hull')
                if any(not math.isfinite(Interval.cast(x.value).lo+Interval.cast(x.value).hi) for stage in stages for v in stage.values() for x in (v if isinstance(v,list) else [v])):
                    raise ValueError('nonfinite hull')
                cells.append({'start':a,'end':b,'normalizedDenominatorBounds':bounds})
            except (ValueError,ZeroDivisionError,OverflowError):
                self.finite((a+b)/2)
                if depth>=18:unresolved.append([a,b])
                else:
                    mid=(a+b)/2;stack.extend([(mid,b,depth+1),(a,mid,depth+1)])
        cells.sort(key=lambda c:c['start']);unresolved.sort()
        return {'certified':not unresolved,'evaluations':min(calls,BUDGET+1),'verifiedCells':len(cells),'cells':cells,'unresolved':unresolved,
                'roundingModel':ROUNDING,'reason':None if not unresolved else 'original domain retained; interval subdivision unresolved'}

def query_planar_sequence_generic(data):
    q=validate_planar_sequence_query(data)
    try:
        k=PlanarSequenceKernel(q);domain=k.domain();rows=[];grid=[];metric=0.;mirror=0.
        def metric_of(stage,w):
            bp=values([x.derivative() for x in stage['base']])
            dp=values([x.derivative() for x in stage['director']]);d=values(stage['director'])
            ds=bp+w*dp;return np.asarray([ds@ds,ds@d,d@d])
        audit_nodes=sorted(set(np.linspace(q['parameterStart'],q['parameterEnd'],129))|set(np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1)))
        widths=np.linspace(q['transverseStart'],q['transverseEnd'],q['rulingSegments']+1)
        for s in audit_nodes:
            stages=k.finite(float(s))
            for w in sorted(set(widths)|{(q['transverseStart']+q['transverseEnd'])/2}):
                ref=metric_of(stages[0],w)
                for stage in stages[1:]:
                    efg=metric_of(stage,w);scales=np.asarray([max(abs(ref[0]),abs(efg[0])),math.sqrt(max(abs(ref[0]),abs(efg[0]))*max(abs(ref[2]),abs(efg[2]))),max(abs(ref[2]),abs(efg[2]))])
                    if not np.isfinite(ref).all() or not np.isfinite(efg).all() or not np.isfinite(scales).all():
                        raise PlanarSequenceError('source-numerics','原反射或度量超出有限数值范围。')
                    residual=np.divide(abs(ref-efg),scales,out=np.zeros(3),where=scales>0);metric=max(metric,float(max(residual)))
            for i,m in enumerate(k.mirrors):
                f=values(stages[i+1]['fold']);n=np.asarray(m['normal']);mirror=max(mirror,abs(float((f-np.asarray(m['point']))@n))/max(1.,float(np.linalg.norm(f-np.asarray(m['point'])))*float(np.linalg.norm(n))))
        for s in np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1):
            stages=k.finite(float(s));records=[];grids=[]
            for stage in stages:
                row={'parameter':float(stage['parameter'].value),'parameterDerivative':float(stage['parameter'].c[1])}
                for name in ('base','fold','director'):
                    v=values(stage[name]);prime=values([x.derivative() for x in stage[name]])
                    row[name]=(v*k.scale+(np.asarray(k.origin) if name!='director' else 0)).tolist()
                    row[name+'Derivative']=(prime*k.scale).tolist();row['normalized'+name.title()]=v.tolist();row['normalized'+name.title()+'Derivative']=prime.tolist()
                records.append(row);points=[(values(stage['base'])+w*values(stage['director'])).tolist() for w in widths]
                grids.append({'normalizedPoints':points,'points':[(np.asarray(p)*k.scale+np.asarray(k.origin)).tolist() for p in points],
                              'EFG':[(metric_of(stage,w)*k.scale*k.scale).tolist() for w in widths]})
            rows.append({'s':float(s),'stages':records});grid.append({'s':float(s),'stages':grids})
        return {'family':RESULT_FAMILY,'query':q,'source':{'functions':['PlanarCurvedFold3DSequence','NPlanarCurvedFold3DSequence'],
                'definitionCells':['In[4038]','In[4042]'],'reflectuDefinitionCell':'In[152]',
                'initialEntry':['0','B','B','D'],'stageEntry':['v','reflectedB','fold','reflectedD'],
                'normalNormalized':False,'interpolationReproduced':False,'symbolicOptionsReproduced':False},
                'normalization':{'origin':k.origin,'scale':k.scale},
                'effectiveMirrors':[{'point':[x*k.scale+y for x,y in zip(m['point'],k.origin)],'normalizedPoint':m['point'],'normal':m['normal']} for m in k.mirrors],
                'domain':domain,'diagnostics':{'validationNodes':129,'maximumRelativeMetricDifference':metric,'maximumNormalizedMirrorPlaneResidual':mirror,
                    'maximumMirrorNormalSquaredLengthError':max(k.normal_errors,default=0.),'normalCompatibilityTolerance':float(64*np.finfo(float).eps)},
                'certification':{'literalOriginalSequenceEvaluated':True,'sourceDomainCertified':domain['certified'],
                    'mirrorNormalsCompatible':k.normal_compatible,'conditionalReflectionIsometryCertified':k.normal_compatible,
                    'finiteMetricVerified':metric<=2e-8,'cutOrderVerified':False,'globalInjectivityChecked':False,'selfCollisionChecked':False,
                    'exactStraightCreaseFOLD':False,'adoptableCreasePattern':False},'sample':{'rows':rows},'grid':grid}
    except PlanarSequenceError:raise
    except (ValueError,ZeroDivisionError,OverflowError) as e:raise PlanarSequenceError('source-numerics','原完整镜像序列未能有限求值。') from e
