"""Literal dedicated ReshapeCone3D and ReshapeTandev3D numeric contracts.

These source frames are not the generic q!=0 ruled-surface frame. Cone uses
an auxiliary unit-speed recovery curve and then discards it. Tandev uses
Normalize(dprime) cross raw d, and preserves the original raw zeta/initials.
"""
import ast
import math
import numpy as np
import sympy as sp
from tessellation_curved_generic_darboux import (
    DarbouxKernel, GenericDarbouxError, Expression, Taylor, IntervalTaylor, values,
    dot, cross, times, magnitude, ROUNDING, METRIC_TOLERANCE, DEVELOPABILITY_TOLERANCE,
    initial_frame_compatibility,
)
from tessellation_curved_matched_pair_query import symbolic_node, simplified, algebraic_budget
from tessellation_curved_linked_common_interval import Interval, down, up

CONE_FAMILY='reshape-cone-generic-native'
TANDEV_FAMILY='reshape-tandev-generic-native'
CERTIFICATION_BUDGET=1023
CONE_PRESET={'family':CONE_FAMILY,'baseCurve':['0','0','0'],
    'director':['2*s/(1+s**2+(.3+.2*s**2)**2)','2*(.3+.2*s**2)/(1+s**2+(.3+.2*s**2)**2)',
                '(1-s**2-(.3+.2*s**2)**2)/(1+s**2+(.3+.2*s**2)**2)'],
    'beta':'0','sigma':1,'psi':1,'initialParameter':0.,'initialPoint':[0.,0.,0.],
    'initialDirector':[0.,.6/1.09,.91/1.09],'initialNormal':[0.,-.91/1.09,.6/1.09],
    'parameterStart':0.,'parameterEnd':1.,'transverseStart':.2,'transverseEnd':1.,'segments':32,'rulingSegments':16}
TANDEV_PRESET={'family':TANDEV_FAMILY,'baseCurve':['sin(s)','s**2/4','1-cos(s)'],
    'director':['cos(s)/sqrt(1+s**2/4)','(s/2)/sqrt(1+s**2/4)','sin(s)/sqrt(1+s**2/4)'],
    'torsion':'-2*s*sqrt(1+s**2/4)/(5+s**2)','sigma':1,'psi':-1,'initialParameter':0.,
    'initialPoint':[0.,0.,0.],'initialDirector':[1.,0.,0.],'initialNormal':[0.,-2/math.sqrt(5),1/math.sqrt(5)],
    'parameterStart':0.,'parameterEnd':1.,'transverseStart':.15,'transverseEnd':.5,'segments':32,'rulingSegments':16}

class SpecialReshapeError(GenericDarbouxError):pass

def validate_special_reshape_query(data,cone):
    preset=CONE_PRESET if cone else TANDEV_PRESET
    if not isinstance(data,dict) or set(data)-set(preset):raise SpecialReshapeError('input-contract','专用重塑输入须仅含原合同字段。')
    q={**preset,**data}
    if q['family']!=preset['family']:raise SpecialReshapeError('input-contract','专用重塑类型不匹配。')
    for key in ('baseCurve','director'):
        if not isinstance(q[key],list) or len(q[key])!=3:raise SpecialReshapeError('input-contract','原b/d各须为三个安全标量源。')
        for source in q[key]:Expression(source,'s')
        q[key]=list(q[key])
    Expression(q['beta' if cone else 'torsion'],'s')
    for key in ('sigma','psi'):
        if type(q[key]) is not int or q[key] not in (-1,1):raise SpecialReshapeError('input-contract','原σ/ψ须为固定±1。')
    for key in ('parameterStart','parameterEnd','transverseStart','transverseEnd','initialParameter'):
        x=q[key]
        if type(x) not in (int,float) or not math.isfinite(x):raise SpecialReshapeError('input-contract','原域和ui须有限。')
        q[key]=float(x)
    a,b=q['parameterStart'],q['parameterEnd']
    if not -10<=a<b<=10 or not .01<=b-a<=12 or not a<=q['initialParameter']<=b:raise SpecialReshapeError('input-contract','s域须在−10…10，长度.01–12且ui在原域内。')
    if not -1e6<=q['transverseStart']<q['transverseEnd']<=1e6:raise SpecialReshapeError('input-contract','w域须在±10⁶内递增。')
    for key,lo,hi in [('segments',8,128),('rulingSegments',2,64)]:
        if type(q[key]) is not int or not lo<=q[key]<=hi:raise SpecialReshapeError('input-contract','密度超出有限显示预算。')
    for key in ('initialPoint','initialDirector','initialNormal'):
        v=q[key]
        if not isinstance(v,list) or len(v)!=3 or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e12 for x in v):
            raise SpecialReshapeError('input-contract','原bbi/ddi/uui须为三个有限raw坐标，组件不超过10¹²。')
        q[key]=[float(x) for x in v]
    return q

def square(x):
    if not isinstance(x,Interval):return x*x
    a,b=x.lo,x.hi
    return Interval(max(0.,down(0. if a<=0<=b else min(a*a,b*b))),up(max(a*a,b*b)))
def scalar_length(items):
    if not any(isinstance(x,Interval) for x in items):return math.hypot(*items)
    total=sum((square(Interval.cast(x)) for x in items),Interval(0.))
    return Interval(max(0.,down(math.sqrt(max(0.,total.lo)))),up(math.sqrt(max(0.,total.hi))))
def value_bounds(x):
    x=Interval.cast(x);return [x.lo,x.hi]

def source_identity(curves,cone):
    """Sufficient source identities, constructed only from validated AST nodes."""
    try:
        if max(algebraic_budget(f.tree) for row in curves for f in row)>32:return False
        s=sp.Symbol('s',real=True);b,d=[[symbolic_node(f.tree,s) for f in row] for row in curves];bp=[sp.diff(x,s) for x in b]
        unit=simplified(dot(d,d)-1)==0
        native=all(simplified(x)==0 for x in bp) if cone else all(simplified(x)==0 for x in cross(bp,d))
        return bool(unit and native)
    except (ValueError,TypeError,ZeroDivisionError,RecursionError,OverflowError,NotImplementedError,sp.PolynomialError):return False

class SpecialReshapeKernel(DarbouxKernel):
    def __init__(self,q,cone):
        self.query=q;self.cone=cone;self.ui=q['initialParameter'];self.dimension=3;self.flatten=False
        self.curves=[[Expression(x,'s') for x in q[key]] for key in ('baseCurve','director')]
        self.coefficient=Expression(q['beta' if cone else 'torsion'],'s')
        self.parts=[f.affine_parts(Taylor.variable(self.ui,3)) for f in self.curves[0]]
        self.source_origin=np.asarray([math.fsum(offset)+dynamic.value for offset,dynamic in self.parts]);self.target_origin=np.asarray(q['initialPoint'])
        base_speeds=[];director_lengths=[]
        for s in np.linspace(q['parameterStart'],q['parameterEnd'],9):
            variable=Taylor.variable(float(s),1)
            base_speeds.append(math.hypot(*(f.affine_parts(variable)[1].c[1] for f in self.curves[0])))
            director_lengths.append(math.hypot(*(f(variable).value for f in self.curves[1])))
        span=q['parameterEnd']-q['parameterStart'];self.scale=max(base_speeds)*span
        if cone:self.scale=max(self.scale,max(director_lengths)*max(abs(q['transverseStart']),abs(q['transverseEnd']),q['transverseEnd']-q['transverseStart'])) or 1.
        if not math.isfinite(self.scale) or self.scale<=0:raise SpecialReshapeError('source-scale','原几何速度无法有限归一化。')
        self.analytic=source_identity(self.curves,cone)
        native=self.finite_point(self.ui);self.zeta=None if cone else float(values(native['T'])@values(native['d'])*self.scale)
        self.initial_normal=np.asarray(q['initialNormal'])
        if cone:
            self.initial_left=q['sigma']*np.asarray(q['initialDirector']);self.initial_tangent=np.cross(self.initial_left,self.initial_normal)
        else:
            self.initial_tangent=self.zeta*np.asarray(q['initialDirector']);self.initial_left=np.cross(self.initial_normal,self.initial_tangent)
        self.frame=initial_frame_compatibility([self.initial_tangent,self.initial_left,self.initial_normal])
        self.initial_state=np.concatenate(([0.,0.,0.],self.initial_tangent,self.initial_left,self.initial_normal))
        self.forward=self.backward=None;self.integration_calls=0

    def point(self,argument):
        variable=(IntervalTaylor if isinstance(argument,Interval) else Taylor).variable(argument,3)
        b=[]
        for f,(origin_offset,origin_dynamic) in zip(self.curves[0],self.parts):
            offset,dynamic=f.affine_parts(variable);b.append((dynamic-origin_dynamic.value+math.fsum(offset+[-x for x in origin_offset]))/self.scale)
        d=[f(variable)/self.scale for f in self.curves[1]];bp=[x.derivative() for x in b];dp=[x.derivative() for x in d]
        base_speed=scalar_length([x.value*self.scale for x in bp]);director_length=scalar_length([x.value*self.scale for x in d])
        director_prime_speed=scalar_length([x.value*self.scale for x in dp]);zero=variable.constant(0.,2)
        if self.cone:
            v=variable.constant(1/self.scale,2);g=variable.constant(-self.query['sigma']*self.query['psi']*director_prime_speed,2)
            h=self.coefficient(variable);z=zero;l=times(d,self.query['sigma']*self.scale)
            frame_defined=not isinstance(argument,Interval) and director_prime_speed>0
            t=times(dp,self.query['psi']/magnitude(dp)) if frame_defined else [zero]*3
            u=cross(t,l)
        else:
            v=magnitude(bp);t=times(bp,1/v);u=times(cross(times(dp,1/magnitude(dp)),times(d,self.scale)),self.query['sigma']*self.query['psi'])
            l=cross(u,t);g=dot(l,[x.derivative() for x in t]);h=zero;z=self.coefficient(variable);frame_defined=True
        return {'b':b,'d':d,'bp':bp,'dp':dp,'v':v,'T':t,'L':l,'U':u,'g':g,'h':h,'z':z,
                'baseSpeed':base_speed,'directorLength':director_length,'directorPrimeSpeed':director_prime_speed,'frameDefined':frame_defined}

    def target(self,s,p):
        state=self.initial_state if s==self.ui else (self.backward if s<self.ui else self.forward).sol(s)
        t,l,u=[np.asarray(state[i:i+3]) for i in (3,6,9)];v,g,h,z=[p[k].value for k in ('v','g','h','z')]
        if self.cone:
            b=bp=np.zeros(3);d=self.query['sigma']*l/self.scale;dp=self.query['sigma']*(-g*t+z*u)/self.scale
        else:
            b=np.asarray(state[:3]);bp=v*t;d=self.zeta*t/self.scale;dp=self.zeta*(g*l+h*u)/self.scale
        return {'b':b,'bp':bp,'d':d,'dp':dp,'T':t,'L':l,'U':u}

    def areas(self,p,w):
        w=Interval.cast(w);ds=[x+y*w for x,y in zip(p['bp'],p['dp'])];area=cross(ds,p['d'])
        source=sum((square(Interval.cast(x.value)) for x in area),Interval(0.))
        # Form the normalized area before squaring: a separately evaluated
        # scale**4 may underflow even when the final normalized area is finite.
        g=Interval.cast(p['g'].value)
        formal=square(w*g*(1. if self.cone else self.zeta*self.zeta)/self.scale/self.scale)
        return {'source':source,'formal':formal}

    def cell(self,a,b):
        p=self.point(Interval(a,b))
        if not self.cone and (Interval.cast(p['baseSpeed']).lo<=0 or Interval.cast(p['directorPrimeSpeed']).lo<=0):raise ValueError('original tandev normalization not enclosed')
        fields={key+'Bounds':value_bounds(p[value]) for key,value in [('baseSpeed','baseSpeed'),('directorLength','directorLength'),('directorPrimeSpeed','directorPrimeSpeed')]}
        fields.update({key+'Bounds':value_bounds(p[key].value) for key in ('g','h','z')})
        fields.update({key+'NormalizedAreaSquaredBounds':value_bounds(value) for key,value in self.areas(p,Interval(self.query['transverseStart'],self.query['transverseEnd'])).items()})
        if any(not math.isfinite(x) for pair in fields.values() for x in pair):raise ValueError('nonfinite interval coefficient/area')
        return {'start':a,'end':b,**fields}

    def domain(self):
        q=self.query;stack=[(q['parameterStart'],q['parameterEnd'],0)];cells=[];unresolved=[];evaluations=0
        while stack:
            a,b,depth=stack.pop();evaluations+=1
            if evaluations>CERTIFICATION_BUDGET:unresolved.extend([[a,b]]+[[x,y] for x,y,_ in stack]);break
            try:
                cell=self.cell(a,b);uncertain=[key for key in ('source','formal') if cell[key+'NormalizedAreaSquaredBounds'][0]<=0]
                if uncertain and depth<10 and evaluations+len(stack)+2<CERTIFICATION_BUDGET:
                    mid=self.finite_point((a+b)/2);bounds=self.areas(mid,Interval(q['transverseStart'],q['transverseEnd']))
                    if any(bounds[key].lo>0 for key in uncertain):
                        middle=(a+b)/2;stack.extend([(middle,b,depth+1),(a,middle,depth+1)]);continue
                cells.append(cell)
            except (ValueError,ZeroDivisionError,OverflowError):
                self.finite_point((a+b)/2)
                if depth>=18 or b-a<=1e-9:unresolved.append([a,b])
                else:
                    middle=(a+b)/2;stack.extend([(middle,b,depth+1),(a,middle,depth+1)])
        cells.sort(key=lambda c:c['start']);unresolved.sort();certified=not unresolved
        def strip(key):
            minima=[c[key+'NormalizedAreaSquaredBounds'][0] for c in cells];valid=certified and minima and min(minima)>0
            return {'status':'verified' if valid else 'unknown','minimumAreaSquaredLowerBound':min(minima) if valid else None,
                    'reason':None if valid else 'complete literal strip area unresolved; original width retained'}
        return {'certified':certified,'evaluations':evaluations,'verifiedCells':len(cells),'cells':cells,'unresolved':unresolved,
                **{'minimum'+key+'LowerBound':min(c[key[0].lower()+key[1:]+'Bounds'][0] for c in cells) if certified else None for key in ('BaseSpeed','DirectorLength','DirectorPrimeSpeed')},
                'roundingModel':ROUNDING,'reason':None if certified else 'interval coefficient/area budget exhausted; original domain retained',
                'sourceStripRegularity':strip('source'),'formalStripRegularity':strip('formal')}

    def row(self,s,p,t):
        row={'s':float(s)}
        for prefix,origin,items in [('Source',self.source_origin,[(k,values(p[v])) for k,v in [('Base','b'),('Director','d'),('BaseDerivative','bp'),('DirectorDerivative','dp')]]),
                                   ('Target',self.target_origin,[(k,t[v]) for k,v in [('Base','b'),('Director','d'),('BaseDerivative','bp'),('DirectorDerivative','dp')]])]:
            for suffix,x in items:
                row[prefix.lower()+suffix]=(x*self.scale+(origin if suffix=='Base' else 0)).tolist();row['normalized'+prefix+suffix]=x.tolist()
        for key,frame in [('sourceAuxiliaryTangent','T'),('sourceAuxiliaryLeftNormal','L'),('sourceAuxiliaryNormal','U')]:row[key]=values(p[frame]).tolist()
        row['sourceAuxiliaryFrameDefined']=p['frameDefined'];row['targetTangent']=t['T'].tolist();row['targetLeftNormal']=t['L'].tolist();row['targetNormal']=t['U'].tolist()
        row['coefficients']={'speed':p['v'].value*self.scale,'normalizedSpeed':p['v'].value,'sourceBaseSpeed':p['baseSpeed'],
                             'sourceDirectorLength':p['directorLength'],'sourceDirectorPrimeSpeed':p['directorPrimeSpeed'],**{key:p[key].value for key in ('g','h','z')}}
        return row

def special_result(kernel,domain):
    q=kernel.query;widths=np.linspace(q['transverseStart'],q['transverseEnd'],q['rulingSegments']+1)
    audit_widths=sorted(set(widths)|{(q['transverseStart']+q['transverseEnd'])/2});rows=[];grid=[];metric=frame=develop=compatibility=0.;focus={'source':False,'formal':False}
    for s in sorted(set(np.linspace(q['parameterStart'],q['parameterEnd'],129)) | set(np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1))):
        p=kernel.finite_point(float(s));t=kernel.target(float(s),p);bp,d,dp=[values(p[k]) for k in ('bp','d','dp')]
        bases=[np.column_stack([t[k] for k in ('T','L','U')])]
        if p['frameDefined']:bases.append(np.column_stack([values(p[k]) for k in ('T','L','U')]))
        frame=max(frame,*(float(np.max(np.abs(b.T@b-np.eye(3)))) for b in bases))
        length=p['directorLength'];native=math.hypot(*bp)/max(math.hypot(*d),np.finfo(float).tiny) if kernel.cone else math.hypot(*np.cross(bp,d))/max(math.hypot(*bp)*math.hypot(*d),np.finfo(float).tiny)
        compatibility=max(compatibility,abs(length*length-1),native)
        triple=abs(float(np.dot(np.cross(t['bp'],t['d']),t['dp'])));den=math.hypot(*t['bp'])*math.hypot(*t['d'])*math.hypot(*t['dp'])
        develop=max(develop,triple/max(den,np.finfo(float).tiny))
        for w in audit_widths:
            ds,dt=bp+w*dp,t['bp']+w*t['dp'];sm=np.asarray([ds@ds,ds@d,d@d]);tm=np.asarray([dt@dt,dt@t['d'],t['d']@t['d']]);e,g=max(sm[0],tm[0]),max(sm[2],tm[2])
            metric=max(metric,float(np.max(np.abs(sm-tm)/np.maximum([e,math.sqrt(e)*math.sqrt(g),g],np.finfo(float).tiny))))
            # Exact finite zero-area witnesses are independently enclosed below.
            if float(np.dot(np.cross(ds,d),np.cross(ds,d)))==0 or float(np.dot(np.cross(dt,t['d']),np.cross(dt,t['d'])))==0:
                narrow=kernel.point(Interval(float(s)));areas=kernel.areas(narrow,Interval(float(w)))
                for key in focus:
                    if areas[key].lo==areas[key].hi==0:focus[key]=True
    for s in np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1):
        p=kernel.finite_point(float(s));t=kernel.target(float(s),p);rows.append(kernel.row(s,p,t));ns=[values(p['b'])+w*values(p['d']) for w in widths];nt=[t['b']+w*t['d'] for w in widths]
        item={'s':float(s),'normalizedSource':[x.tolist() for x in ns],'normalizedTarget':[x.tolist() for x in nt],
              'source':[(x*kernel.scale+kernel.source_origin).tolist() for x in ns],'target':[(x*kernel.scale+kernel.target_origin).tolist() for x in nt]}
        for label,bp,d,dp in [('source',values(p['bp']),values(p['d']),values(p['dp'])),('target',t['bp'],t['d'],t['dp'])]:item[label+'EFG']=[[float((bp+w*dp)@(bp+w*dp)),float((bp+w*dp)@d),float(d@d)] for w in widths]
        grid.append(item)
    if q['transverseStart']<=0<=q['transverseEnd']:
        focus['formal']=True
        if kernel.analytic:focus['source']=True
    for stage in focus:
        if focus[stage]:domain[stage+'StripRegularity']={'status':'degenerate','minimumAreaSquaredLowerBound':None,'reason':'literal finite apex/edge zero-area witness; original width retained'}
    if not kernel.frame['frameCompatible']:domain['formalStripRegularity']={'status':'unknown','minimumAreaSquaredLowerBound':None,'reason':'raw initial orthonormal frame compatibility not verified at roundoff scale'}
    evidence={'status':'analytic' if kernel.analytic else 'incompatible' if compatibility>DEVELOPABILITY_TOLERANCE else 'numerical' if domain['certified'] else 'unknown',
              'analyticIdentity':kernel.analytic,'method':'bounded-safe-symbolic-unit/constant-base' if kernel.cone and kernel.analytic else 'bounded-safe-symbolic-unit/parallel-base-tangent' if kernel.analytic else 'finite-source-Taylor',
              'maximumRelativeResidual':compatibility,'tolerance':DEVELOPABILITY_TOLERANCE}
    cert={'finiteMetricVerified':metric<=METRIC_TOLERANCE,'finiteTargetDevelopabilityVerified':develop<=DEVELOPABILITY_TOLERANCE,
          'finiteSourceCompatibilityVerified':compatibility<=DEVELOPABILITY_TOLERANCE,'sourceDefinitionCertified':domain['certified'],'sourceCompatibilityAnalytic':kernel.analytic,
          'initialFrameCompatible':kernel.frame['frameCompatible'],'formalIsometryCertified':bool(domain['certified'] and kernel.analytic and kernel.frame['frameCompatible']),
          'sourceStripRegularityCertified':domain['sourceStripRegularity']['status']=='verified','formalStripRegularityCertified':domain['formalStripRegularity']['status']=='verified',
          **{key:False for key in ('integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern')}}
    return {'family':'origamica-generic-cone-reshape' if kernel.cone else 'origamica-generic-tandev-reshape','query':q,
        'source':{'functions':['ReshapeCone3D','NReshapeCone3D'] if kernel.cone else ['ReshapeTandev3D','NReshapeTandev3D'],
            'definitionCells':['In[3901]','In[3906]'] if kernel.cone else ['In[3912]','In[3917]'],
            'method':'whitelist-AST/literal-special-source-frame/bilateral-DOP853','initialArgumentOrder':['ui','bbi','ddi','uui'],
            'normalConvention':'cone diagnostic U=psi*Normalize(dprime) cross sigma*d' if kernel.cone else 'U=sigma*psi*(Normalize(dprime) cross raw d), no cross normalization',
            'directorConvention':'targetD=sigma*L' if kernel.cone else 'zeta=Tsource(ui).dot(rawD(ui));targetD=zeta*T',
            'discardedRecoveredCrossCurve':kernel.cone,'interpolationReproduced':False,'symbolicSolverReproduced':False,'wolframOptionsReproduced':False,'metricConvention':'normalized-s/world-w'},
        'normalization':{'sourceOrigin':kernel.source_origin.tolist(),'targetOrigin':kernel.target_origin.tolist(),'scale':kernel.scale},
        'initial':{'parameter':kernel.ui,'point':q['initialPoint'],'director':q['initialDirector'],'normal':q['initialNormal'],
            'tangent':kernel.initial_tangent.tolist(),'leftNormal':kernel.initial_left.tolist(),'zeta':kernel.zeta,**kernel.frame},
        'diagnostics':{'validationNodes':129,'maximumFrameResidual':frame,'maximumRelativeMetricDifference':metric,'maximumRelativeTargetDevelopabilityResidual':develop,
            'sourceCompatibility':evidence,'metricTolerance':METRIC_TOLERANCE,'compatibilityTolerance':DEVELOPABILITY_TOLERANCE,
            'integration':{'method':'DOP853','relativeTolerance':2e-12,'absoluteTolerance':2e-14,'initialParameter':kernel.ui,
                'backwardEvaluations':0 if kernel.backward is None else int(kernel.backward.nfev),'forwardEvaluations':0 if kernel.forward is None else int(kernel.forward.nfev),'integrationErrorIntervalCertified':False}},
        'certification':cert,'domain':domain,'sample':{'rows':rows},'grid':grid}

def query_special_reshape(data,cone):
    q=validate_special_reshape_query(data,cone)
    try:
        kernel=SpecialReshapeKernel(q,cone);domain=kernel.domain();kernel.integrate()
        with np.errstate(over='ignore',invalid='ignore',divide='ignore'):result=special_result(kernel,domain)
        def finite_result(value):
            if isinstance(value,dict):return all(finite_result(x) for x in value.values())
            if isinstance(value,list):return all(finite_result(x) for x in value)
            return math.isfinite(value) if isinstance(value,(int,float,np.floating)) else True
        if not finite_result(result):raise SpecialReshapeError('arithmetic-budget','原专用重塑结果超出有限binary64几何/EFG预算。')
        return result
    except GenericDarbouxError:raise
    except (ValueError,ZeroDivisionError,OverflowError) as exc:raise SpecialReshapeError('source-domain','原专用源表达式/归一化分母不能在完整有限域求值；不替换原b/d或初值。') from exc
def query_reshape_cone_generic(data):return query_special_reshape(data,True)
def query_reshape_tandev_generic(data):return query_special_reshape(data,False)
