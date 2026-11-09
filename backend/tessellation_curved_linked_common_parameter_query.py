"""Common-parameter continuation of finite linked concentric ruled strips.

This is a corrected use of the geometric contract of Origamica's
NLinkedFoldsNext2D/First3D/Next3D, not a replay of the erroneous saved call.
All native circle systems are composed once with q_i(s). High derivatives
are evaluated by Taylor arithmetic, never by differentiating fitted nodes.
The continuous curved CP and its ruled 3D map are distinct from a straight
crease polyhedral FOLD. Whole-interval parameter regularity and planar
injectivity additionally require outward-rounded interval verification;
neither that verification nor numerical metrics prove collision-free 3D
deployment. The reported rounding assumption is part of the certificate.
"""
import math

import numpy as np
from scipy.integrate import solve_ivp
from tessellation_curved_linked_ndsolve_options import solve_linked_first3d_steps,validate_ndsolve_options

FAMILY='linked-concentric-first-band'
VARIANT='common-parameter'
PRESET={'family':FAMILY,'variant':VARIANT,'radii':[1.,1.1,1.2,1.3,1.4],
        'q1Harmonics':[.1],'firstFoldAngleDeg':120.,'parameterStart':0.,
        'parameterEnd':math.pi,'segments':32}


class Jet:
    """Finite Taylor coefficients x^(k)/k!, with exact chain-rule truncation."""
    def __init__(self,values):self.c=np.asarray(values,dtype=float)
    @property
    def order(self):return len(self.c)-1
    @property
    def value(self):return float(self.c[0])
    @classmethod
    def constant(cls,value,order):return cls([value]+[0.]*order)
    @classmethod
    def variable(cls,value,order):return cls([value,1.]+[0.]*(order-1))
    def _other(self,value):return value if isinstance(value,Jet) else type(self).constant(value,self.order)
    def __add__(self,other):
        other=self._other(other);n=min(len(self.c),len(other.c));return type(self)(self.c[:n]+other.c[:n])
    __radd__=__add__
    def __neg__(self):return type(self)(-self.c)
    def __sub__(self,other):return self+-self._other(other)
    def __rsub__(self,other):return self._other(other)+-self
    def __mul__(self,other):
        other=self._other(other);n=min(len(self.c),len(other.c));return type(self)(np.convolve(self.c[:n],other.c[:n])[:n])
    __rmul__=__mul__
    def inverse(self):
        if not math.isfinite(self.value) or abs(self.value)<1e-13:raise ValueError('共同参数续接遇到零分母。')
        out=[1/self.value]
        for n in range(1,len(self.c)):out.append(-sum(self.c[k]*out[n-k] for k in range(1,n+1))/self.value)
        return type(self)(out)
    def __truediv__(self,other):return self*self._other(other).inverse()
    def __rtruediv__(self,other):return self._other(other)*self.inverse()
    def derivative(self):
        if self.order<1:raise ValueError('共同参数导数阶数不足。')
        return type(self)([k*self.c[k] for k in range(1,len(self.c))])
    def sincos(self):
        sn,cs=[math.sin(self.value)],[math.cos(self.value)]
        for n in range(1,len(self.c)):
            sn.append(sum(k*self.c[k]*cs[n-k] for k in range(1,n+1))/n)
            cs.append(-sum(k*self.c[k]*sn[n-k] for k in range(1,n+1))/n)
        return Jet(sn),Jet(cs)
    def tan(self):
        sn,cs=self.sincos();return sn/cs
    def atan(self):
        if self.order==0:return Jet([math.atan(self.value)])
        d=self.derivative()/(1+self*self)
        return Jet([math.atan(self.value)]+[d.c[n-1]/n for n in range(1,len(self.c))])
    def sqrt(self):
        if self.value<=0:raise ValueError('共同参数续接的根式退化。')
        out=[math.sqrt(self.value)]
        for n in range(1,len(self.c)):out.append((self.c[n]-sum(out[k]*out[n-k] for k in range(1,n)))/(2*out[0]))
        return type(self)(out)


def validate_linked_common_parameter_query(data):
    if not isinstance(data,dict) or data.get('family')!=FAMILY or data.get('variant')!=VARIANT:
        raise ValueError('共同参数关联多带类型无效。')
    if set(data)-set(PRESET)-{'ndsolveOptions'}:raise ValueError('共同参数关联多带含不支持的字段。')
    out={**PRESET,**data};radii=out['radii'];harmonics=out['q1Harmonics']
    number=lambda value:type(value) in (int,float) and math.isfinite(value)
    if not isinstance(radii,list) or not 3<=len(radii)<=6 or any(not number(r) or not .2<=r<=10 for r in radii) or any(b-a<.02 for a,b in zip(radii,radii[1:])):
        raise ValueError('共同参数半径须为 3–6 个递增有限数，每个 0.2–10、相邻间隔至少 0.02。')
    if not isinstance(harmonics,list) or not 1<=len(harmonics)<=3 or any(not number(a) or abs(a)>.2 for a in harmonics) or sum(2*(i+1)*abs(a) for i,a in enumerate(harmonics))>.75:
        raise ValueError('q₁ 正弦系数须为 1–3 个有限数，绝对值不超过 0.2，导数扰动上界不超过 0.75。')
    angle=out['firstFoldAngleDeg'];a=out['parameterStart'];b=out['parameterEnd'];n=out['segments']
    if not number(angle) or not 5<=abs(angle)<=170:raise ValueError('初始折角绝对值须为 5°–170°。')
    if not number(a) or not number(b) or not 0<=a<b<=math.pi or b-a<.05:raise ValueError('共同参数区间须在 0–π 内，长度至少 0.05。')
    if type(n) is not int or not 8<=n<=128:raise ValueError('共同参数采样段数须为 8–128 的整数。')
    if sum(abs(x) for x in harmonics)>=math.acos(radii[0]/radii[1])-.01:
        raise ValueError('q₁ 扰动使首带母线失去横向正则性。')
    if 'ndsolveOptions' in out:out['ndsolveOptions']=validate_ndsolve_options(out['ndsolveOptions'],b-a)
    return {**out,'radii':[float(x) for x in radii],'q1Harmonics':[float(x) for x in harmonics]}


def parameter_jets(query,s,jet_type=Jet,order=None):
    """q_i and gamma_i are *all* functions of the one common argument s."""
    radii=query['radii'];bands=len(radii)-1;order=2*bands+2 if order is None else order
    u=jet_type.variable(s,order);perturb=jet_type.constant(0.,order)
    for k,amplitude in enumerate(query['q1Harmonics'],1):perturb=perturb+amplitude*(2*k*u).sincos()[0]
    deviations=[jet_type.constant(0.,order),perturb]
    q=[u,u+perturb];gamma=[jet_type.constant(math.radians(query['firstFoldAngleDeg']),order)]
    for i in range(bands-1):
        r0,r1,r2=radii[i:i+3];delta=deviations[i+1]-deviations[i];sn,cs=delta.sincos()
        # h.l_i=r0-r1 cos(delta), h.l_(i+1)=r0 cos(delta)-r1.
        # Preserve planar geodesic curvature across the crease: the first
        # atan component must be g_(i+1)/g_i, not the saved reciprocal.
        angle=-2*((q[i].derivative()/q[i+1].derivative())*
                   ((r1-r0*cs)/(r1*cs-r0))*(gamma[i]/2).tan()).atan()
        gamma.append(angle)
        previous_ratio=(-r0*sn)/(r1-r0*cs)
        target=angle.derivative()/(q[i+1].derivative()*(angle/2).tan())-previous_ratio
        # Central pole-free root of r2 sin(theta)/(r1-r2 cos(theta))=target.
        # The rationalized half-angle expression remains regular at target=0.
        half=target*(r1-r2)/(r2+(r2*r2+(r2*r2-r1*r1)*target*target).sqrt())
        deviations.append(deviations[i+1]+2*half.atan());q.append(u+deviations[-1])
    for value,deviation in zip(q,deviations):value.deviation=deviation
    return q,gamma


def _first_derivative(query,s,state):
    r0,r1=query['radii'][:2];delta=sum(a*math.sin(2*k*s) for k,a in enumerate(query['q1Harmonics'],1))
    transverse=r0-r1*math.cos(delta)
    n=math.tan(math.radians(query['firstFoldAngleDeg'])/2)
    tau=-n*r1*math.sin(delta)/transverse
    t,l,u=(state[i:i+3] for i in (3,6,9))
    return np.concatenate((r0*t,l+n*u,-t+tau*u,-n*t-tau*l))


def lift_row(query,s,state):
    q,gamma=parameter_jets(query,s);radii=query['radii'];bands=len(radii)-1
    values=[x.value for x in q];speeds=[x.derivative().value for x in q]
    flat=[np.array((r*math.cos(a),r*math.sin(a))) for r,a in zip(radii,values)]
    flat_prime=[r*p*np.array((-math.sin(a),math.cos(a))) for r,a,p in zip(radii,values,speeds)]
    f,t,l,n=(state[i:i+3].copy() for i in (0,3,6,9))
    derivative=_first_derivative(query,s,state);fp,tp,lp,np_=(derivative[i:i+3] for i in (0,3,6,9))
    folded=[f];folded_prime=[fp];frames=[];develop=[];geodesic=[];transverse=[]
    for i in range(bands):
        frame=np.column_stack((t,l,n));frames.append(float(np.max(np.abs(frame.T@frame-np.eye(3)))))
        delta=values[i+1]-values[i];delta_prime=speeds[i+1]-speeds[i];cs,sn=math.cos(delta),math.sin(delta)
        a=radii[i+1]*sn;b=radii[i]-radii[i+1]*cs
        ap=radii[i+1]*cs*delta_prime;bp=radii[i+1]*sn*delta_prime
        develop.append(abs(a*float(tp@n)+b*float(lp@n)))
        geodesic.append(abs(float(tp@l)-speeds[i]))
        transverse.append(min(-b,radii[i+1]-radii[i]*cs))
        f=f+a*t+b*l;fp=fp+ap*t+a*tp+bp*l+b*lp
        folded.append(f);folded_prime.append(fp)
        next_t=cs*t+sn*l;next_tp=cs*tp+sn*lp+delta_prime*(-sn*t+cs*l)
        left=-sn*t+cs*l;left_prime=-sn*tp+cs*lp-delta_prime*next_t
        normal=np.cross(next_t,left);normal_prime=np.cross(next_tp,left)+np.cross(next_t,left_prime)
        if i+1<bands:
            angle=gamma[i+1].value;angle_prime=gamma[i+1].derivative().value;c,g=math.cos(angle),math.sin(angle)
            next_l=c*left-g*normal
            next_lp=c*left_prime-g*normal_prime-angle_prime*(g*left+c*normal)
            next_n=np.cross(next_t,next_l);next_np=np.cross(next_tp,next_l)+np.cross(next_t,next_lp)
            t,tp,l,lp,n,np_=next_t,next_tp,next_l,next_lp,next_n,next_np
    metrics=[]
    for i in range(bands):
        for v in (0.,.25,.5,.75,1.):
            ds=(1-v)*folded_prime[i]+v*folded_prime[i+1];dv=folded[i+1]-folded[i]
            ps=(1-v)*flat_prime[i]+v*flat_prime[i+1];pv=flat[i+1]-flat[i]
            metrics.extend((abs(float(ds@ds-ps@ps)),abs(float(ds@dv-ps@pv)),abs(float(dv@dv-pv@pv))))
    return {'s':s,'qValues':values,'qDerivatives':speeds,
            'foldAnglesDeg':[math.degrees(x.value) for x in gamma],
            'flatCurves':[x.tolist() for x in flat],'flatDerivatives':[x.tolist() for x in flat_prime],
            'foldedCurves':[x.tolist() for x in folded],'foldedDerivatives':[x.tolist() for x in folded_prime]}, {
            'frame':max(frames),'metric':max(metrics),'developability':max(develop),'geodesic':max(geodesic),
            'speed':min(speeds),'transverse':min(transverse)}


def query_linked_common_parameter(data):
    query=validate_linked_common_parameter_query(data);a,b=query['parameterStart'],query['parameterEnd'];r=query['radii'][0]
    from tessellation_curved_linked_common_interval import certify_parameter_domain
    domain=certify_parameter_domain(tuple(query['radii']),tuple(query['q1Harmonics']),query['firstFoldAngleDeg'],a,b)
    if not domain['certified'] or not domain['planarPaperInjective']:
        raise ValueError('当前多带输入未通过全区间正则／二维纸面无重叠门禁；请缩小区间、扰动或带数。')
    initial=np.array((r*math.cos(a),r*math.sin(a),0.,-math.sin(a),math.cos(a),0.,-math.cos(a),-math.sin(a),0.,0.,0.,1.))
    integration=None
    if 'ndsolveOptions' in query:solution,integration=solve_linked_first3d_steps(lambda s,y:_first_derivative(query,s,y),a,b,initial,query['ndsolveOptions'])
    else:solution=solve_ivp(lambda s,y:_first_derivative(query,s,y),(a,b),initial,method='DOP853',rtol=2e-12,atol=2e-14,dense_output=True)
    if not solution.success or solution.sol is None:raise ValueError('共同参数首带 Darboux 标架积分失败。')
    rows=[];diagnostics=[]
    for s in np.linspace(a,b,query['segments']+1):
        row,diagnostic=lift_row(query,float(s),solution.sol(s));rows.append(row);diagnostics.append(diagnostic)
    # A separate dense validation grid is not determined by drawing segments.
    for s in np.linspace(a,b,257):
        _,diagnostic=lift_row(query,float(s),solution.sol(s));diagnostics.append(diagnostic)
    scale=max(query['radii']);max_metric=max(x['metric'] for x in diagnostics)
    max_frame=max(x['frame'] for x in diagnostics);max_develop=max(x['developability'] for x in diagnostics);max_geodesic=max(x['geodesic'] for x in diagnostics)
    min_speed=min(x['speed'] for x in diagnostics);min_transverse=min(x['transverse'] for x in diagnostics)
    if min_speed<=.02 or min_transverse<=1e-5:raise ValueError('共同参数多带在有限区间的验证节点失去单调或横向正则性。请缩小区间或扰动。')
    if max_frame>2e-7 or max_metric>scale*scale*2e-7 or max_develop>scale*2e-7 or max_geodesic>2e-7:
        raise ValueError('共同参数多带的独立导数或度量验证未通过。')
    same=query['radii']==PRESET['radii'] and query['q1Harmonics']==PRESET['q1Harmonics'] and query['firstFoldAngleDeg']==120 and a==0 and b==math.pi
    result = {'family':'linked-concentric-common-parameter','query':query,
            'source':{'notebookRows':[338484,340340],'savedNumericalOut':False,
                      'savedPhysicalInputsPreserved':same,'parameterContract':'native-curves-composed-once/common-s',
                      'formulaCorrections':['geodesic-curvature-ratio','common-parameter-angle-derivative','composed-tangent-frame'],
                      'method':'automatic-taylor-jet/central-analytic-root/Darboux-integration'},
            'diagnostics':{'validationNodes':257,'maxFrameGramError':max_frame,'maxMetricError':max_metric,
                           'maxDevelopabilityError':max_develop,'maxGeodesicError':max_geodesic,
                           'minimumSampledParameterSpeed':min_speed,'minimumSampledTransverseMargin':min_transverse,
                           'endpointSpatialSeparation':max(math.dist(x,y) for x,y in zip(rows[0]['foldedCurves'],rows[-1]['foldedCurves'])),
                           'parameterDomain':domain},
            'certification':{'bandCount':len(query['radii'])-1,'singleCommonParameter':True,
                             'isometryIdentitiesApplied':True,'finiteNumericalMetricVerified':True,
                             'fullIntervalRegularityCertified':True,'planarPaperInjectivityCertified':True,
                             'allBandsAnalyticLocalIsometry':True,'globalBoundaryInjectivityChecked':False,
                             'originalSavedFormulaReplayed':False,'exactStraightCreaseFOLD':False,
                             'adoptableCreasePattern':False,'selfCollisionChecked':False,'continuousFoldPathChecked':False},
            'sample':{'rows':rows}}
    if integration is not None:result['first3DIntegration']=integration
    return result
