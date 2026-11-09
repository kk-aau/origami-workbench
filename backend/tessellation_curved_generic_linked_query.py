"""Generic native-curve linked folds, on one common parameter.

Only certified simple implicit-root charts are accepted.  The planar sheet
is a continuous union of all ruled bands; a strong-monotonicity certificate
is a sufficient (deliberately conservative) global injectivity test. Failure
of that sufficient test leaves injectivity unproved and does not suppress
the locally isometric read-only numerical construction. No
sampled chords are exported as an exact straight-crease FOLD.
"""
import math
from functools import lru_cache

import numpy as np
from scipy.integrate import solve_ivp
from tessellation_curved_linked_ndsolve_options import solve_linked_first3d_steps,validate_ndsolve_options
from tessellation_curved_curve2d_systems import validate_curve2d_systems, validate_curve2d_system, validate_independent_curve2d_systems, validate_independent_curve2d_system

from tessellation_curved_generic_linked_expression import Expression, GenericLinkedError, Taylor
from tessellation_curved_linked_common_interval import Interval

FAMILY='linked-concentric-first-band'
VARIANT='generic-common-parameter'
PRESET={'family':FAMILY,'variant':VARIANT,
        'curves':[{'x':'u','y':f'0.3*u**2+{i*0.2:.1f}','parameterMin':-1.,'parameterMax':2.} for i in range(3)],
        'q0Expression':'s+0.03*sin(s)','q1Expression':'s+0.02*sin(2*s)',
        'gamma0Expression':'1.8+0.1*sin(s)','rootSeeds':[0.],
        'parameterStart':0.,'parameterEnd':0.35,'segments':32}


def validate_generic_linked_query(data):
    if not isinstance(data,dict) or data.get('family')!=FAMILY or data.get('variant')!=VARIANT or set(data)-set(PRESET)-{'curve2DSystems','curve2DSystemsMode','ndsolveOptions'}:
        raise GenericLinkedError('input-contract','通用关联曲线的类型或字段无效。')
    out={**PRESET,**data}
    number=lambda x:type(x) in (int,float) and math.isfinite(x)
    curves=out['curves']
    if not isinstance(curves,list) or not 3<=len(curves)<=6:
        raise GenericLinkedError('input-contract','原生曲线须为 3–6 条，保留全部 2–5 带。')
    clean=[]
    for c in curves:
        if not isinstance(c,dict) or set(c)!={'x','y','parameterMin','parameterMax'}:
            raise GenericLinkedError('input-contract','每条曲线须完整包含 x/y 表达式及 parameterMin/Max 原生域。')
        a,b=c['parameterMin'],c['parameterMax']
        if not number(a) or not number(b) or not -20<=a<b<=20 or b-a<.02:
            raise GenericLinkedError('input-contract','原生参数域须在 −20…20 内且长度至少 0.02。')
        Expression(c['x'],'u');Expression(c['y'],'u')
        clean.append({**c,'parameterMin':float(a),'parameterMax':float(b)})
    mode=out.get('curve2DSystemsMode','verified-same-source')
    if mode not in ('verified-same-source','independent-external'):raise GenericLinkedError('input-contract','外部系统模式无效。')
    if 'curve2DSystems' in out:
        validator=validate_independent_curve2d_systems if mode=='independent-external' else validate_curve2d_systems
        out['curve2DSystems']=validator(out['curve2DSystems'],clean)
    elif mode=='independent-external':raise GenericLinkedError('independent-rule-contract','独立规则模式须显式提供系统或Automatic。')
    for k in ('q0Expression','q1Expression','gamma0Expression'):Expression(out[k],'s')
    seeds=out['rootSeeds']
    if not isinstance(seeds,list) or len(seeds)!=len(curves)-2 or any(not number(v) or not curves[i+2]['parameterMin']<v<curves[i+2]['parameterMax'] for i,v in enumerate(seeds)):
        raise GenericLinkedError('input-contract','每条后续曲线需一个位于其原生域内部的起点根种子。')
    a,b=out['parameterStart'],out['parameterEnd']
    if not number(a) or not number(b) or not -10<=a<b<=10 or not .01<=b-a<=6:
        raise GenericLinkedError('input-contract','共同 s 域须在 −10…10 内，长度 0.01–6。')
    if type(out['segments']) is not int or not 8<=out['segments']<=128:
        raise GenericLinkedError('input-contract','显示段数须为 8–128 的整数。')
    if 'ndsolveOptions' in out:out['ndsolveOptions']=validate_ndsolve_options(out['ndsolveOptions'],b-a)
    return {**out,'curves':clean,'rootSeeds':[float(x) for x in seeds],
            'parameterStart':float(a),'parameterEnd':float(b)}


def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross2(a,b):return a[0]*b[1]-a[1]*b[0]
def sub(a,b):return [x-y for x,y in zip(a,b)]
def value(a):return np.array([x.value for x in a],dtype=float)
def prime(a):return np.array([x.c[1] for x in a],dtype=float)
def interval(x):return x if isinstance(x,Interval) else Interval(x)


class Kernel:
    def __init__(self,query):
        self.query=query;self.bands=len(query['curves'])-1;self.order=2*self.bands+2
        self.curves=[(Expression(c['x'],'u'),Expression(c['y'],'u')) for c in query['curves']]
        self.native_first=[[f.derivative() for f in c] for c in self.curves]
        self.native_second=[[f.derivative() for f in c] for c in self.native_first]
        self.independent=query.get('curve2DSystemsMode')=='independent-external'
        supplied=query.get('curve2DSystems',[])
        self.external_systems=[] if supplied=='Automatic' else [(validate_independent_curve2d_system(system) if self.independent else validate_curve2d_system(system,query['curves'][i]))[1] for i,system in enumerate(supplied)]
        self.external_system_evaluations=[0]*len(self.external_systems)
        self.parameters=[Expression(query[k],'s') for k in ('q0Expression','q1Expression','gamma0Expression')]
        self.charts=[];self.evaluations=0;self.root_iterations=0;self.integration_calls=0
        u=Taylor.variable(query['parameterStart'],2)
        start=[self.parameters[i](u) for i in range(2)]
        self.origin_parts=[fn.affine_parts(start[0]) for fn in self.curves[0]]
        first=[math.fsum(offsets)+dynamic.value for offsets,dynamic in self.origin_parts]
        self.world_origin=np.array((*first,0.))
        self.origin_dynamic=[d.value for _,d in self.origin_parts]
        second_parts=[fn.affine_parts(start[1]) for fn in self.curves[1]]
        difference=[math.fsum(offsets+[-x for x in self.origin_parts[k][0]])+dynamic.value-self.origin_dynamic[k]
                    for k,(offsets,dynamic) in enumerate(second_parts)]
        self.world_scale=math.hypot(*difference)
        if not math.isfinite(self.world_scale) or self.world_scale==0:
            raise GenericLinkedError('paper-singularity','首带起点两条曲线重合，无法建立纸域。')

    def coordinates(self,i,q):
        out=[]
        for k,fn in enumerate(self.curves[i]):
            offsets,dynamic=fn.affine_parts(q)
            shift=math.fsum(offsets+[-x for x in self.origin_parts[k][0]])
            out.append((dynamic-self.origin_dynamic[k]+shift)/self.world_scale)
        return out

    def geometry(self,i,q):
        p=self.coordinates(i,q);du=[fn(q)/self.world_scale for fn in self.native_first[i]]
        duu=[fn(q)/self.world_scale for fn in self.native_second[i]]
        native_speed=dot(du,du).sqrt();qp=q.derivative()
        d=[x*qp for x in du];speed=native_speed*qp;t=[x/native_speed for x in du];l=[-t[1],t[0]]
        g=cross2(du,duu)/dot(du,du)*qp
        if i<len(self.external_systems):
            system=self.external_systems[i];self.external_system_evaluations[i]+=1
            if self.independent:
                domain=self.query['curve2DSystems'][i]['parameterDomain'];parameter=interval(q.value)
                if parameter.lo<domain[0] or parameter.hi>domain[1]:raise GenericLinkedError('independent-rule-domain','实际参数超出独立规则原声明域；不自动外推。')
            native_speed=system[0][0](q)/self.world_scale
            speed=native_speed*qp
            t=[f(q) for f in system[2]];l=[f(q) for f in system[3]]
            g=system[0][0](q)*system[1][0](q)*qp
        return {'p':p,'d':d,'speed':speed,'t':t,'l':l,'g':g}

    def residual(self,i,z,previous,target):
        h=sub(self.coordinates(i,z),previous['p'])
        return dot(h,previous['t'])-target*dot(h,previous['l'])

    def root_derivative(self,i,z,previous,target):
        # Native-u derivative, separately from derivatives w.r.t common s.
        native=self.coordinates(i,Taylor.variable(z,1))
        return sum(p.c[1]*(t.value-target.value*l.value) for p,t,l in zip(native,previous['t'],previous['l']))

    def root(self,i,previous,target,seed,bounds=None):
        domain=self.query['curves'][i]
        lo,hi=(domain['parameterMin'],domain['parameterMax']) if bounds is None else bounds
        z=min(max(seed,lo+1e-12),hi-1e-12)
        for _ in range(40):
            self.root_iterations+=1
            f=self.residual(i,Taylor.constant(z,0),previous,target).value
            derivative=self.root_derivative(i,z,previous,target)
            if abs(derivative)<1e-9:
                raise GenericLinkedError('root-singularity',f'第 {i+1} 曲线的隐函数根不为简单根。')
            if abs(f)<2e-12:
                if not lo<z<hi:
                    raise GenericLinkedError('native-domain','后续原生根触及或越过显式原生域。')
                return z
            step=f/derivative;candidate=z-step
            damping=0
            while not lo<candidate<hi or abs(self.residual(i,Taylor.constant(candidate,0),previous,target).value)>abs(f)*1.1:
                step*=.5;candidate=z-step;damping+=1
                if damping>24:
                    raise GenericLinkedError('root-no-solution',f'第 {i+1} 曲线在指定种子的连续根支没有可收敛的域内简单根。')
            z=candidate
        raise GenericLinkedError('root-budget','隐函数数值根迭代预算耗尽。')

    def implicit_jet(self,i,previous,target,z):
        n=min(target.order,*(x.order for x in previous['t']),*(x.order for x in previous['p']))
        derivative=self.root_derivative(i,z,previous,target)
        c=[z]+[Interval(0.) if isinstance(z,Interval) else 0.] * n
        for k in range(1,n+1):
            residual=self.residual(i,Taylor(c[:k+1]),previous,target)
            c[k]=-residual.c[k]/derivative
        return Taylor(c)

    def interval_root(self,i,previous,target,centre,width):
        domain=self.query['curves'][i];dlo,dhi=domain['parameterMin'],domain['parameterMax']
        at_centre=interval(self.residual(i,Taylor.constant(centre,0),previous,target).value)
        derivative_centre=interval(self.root_derivative(i,centre,previous,target))
        if derivative_centre.lo<=0<=derivative_centre.hi:raise ValueError('root derivative sign unresolved')
        estimated=max(abs(at_centre.lo),abs(at_centre.hi))/min(abs(derivative_centre.lo),abs(derivative_centre.hi))
        for factor in (1.5,3.,6.,12.):
            radius=max(1e-10,width,estimated)*factor
            box=Interval(max(dlo,centre-radius),min(dhi,centre+radius))
            if not dlo<box.lo<box.hi<dhi:continue
            derivative=interval(self.root_derivative(i,box,previous,target))
            if derivative.lo<=0<=derivative.hi:continue
            mid=(box.lo+box.hi)/2;c=1/((derivative.lo+derivative.hi)/2)
            f=interval(self.residual(i,Taylor.constant(mid,0),previous,target).value)
            # Parameterized Krawczyk inclusion establishes a unique root for
            # every s in the entire cell, without interpolating root samples.
            k=mid-c*f+(1-c*derivative)*(box-mid)
            if box.lo<k.lo<=k.hi<box.hi:
                # K itself encloses the actual roots. A contracted root-value
                # enclosure is essential before differentiating later bands;
                # retaining the trial box would inflate high derivatives.
                return k,min(abs(derivative.lo),abs(derivative.hi))
        raise ValueError('root chart inclusion unresolved')

    def linked(self,s,seeds,boxes=None):
        u=Taylor.variable(s,self.order)
        q=[self.parameters[0](u),self.parameters[1](u)]
        gamma=[self.parameters[2](u)];geometries=[self.geometry(i,x) for i,x in enumerate(q)]
        root_bounds=[];margins=[]
        for i in range(self.bands-1):
            gi,gj=geometries[i:i+2];h=sub(gj['p'],gi['p'])
            angle=-2*((gi['g']/gj['g'])*(dot(h,gj['l'])/dot(h,gi['l']))*(gamma[i]/2).tan()).atan()
            gamma.append(angle)
            target=angle.derivative()/(gj['g']*(angle/2).tan())-dot(h,gj['t'])/dot(h,gj['l'])
            if isinstance(s,Interval):
                box,margin=self.interval_root(i+2,gj,target,seeds[i],max(1e-6,(s.hi-s.lo)*2))
                z=box;root_bounds.append([box.lo,box.hi]);margins.append(margin)
            else:
                z=self.root(i+2,gj,target,seeds[i],None if boxes is None else boxes[i])
            q.append(self.implicit_jet(i+2,gj,target,z));geometries.append(self.geometry(i+2,q[-1]))
        return q,gamma,geometries,root_bounds,margins

    @lru_cache(maxsize=1024)
    def point(self,s):
        chart=next((c for c in self.charts if c['start']-1e-13<=s<=c['end']+1e-13),None)
        seeds=chart['seeds'] if chart else self.query['rootSeeds']
        boxes=chart['rootBounds'] if chart else None
        return self.linked(float(s),seeds,boxes)[:3]

    def certify(self):
        a,b=self.query['parameterStart'],self.query['parameterEnd']
        q0,gamma0,g0,_,_=self.linked(a,self.query['rootSeeds'])
        tangent=value(g0[0]['d']) if self.independent else value(g0[0]['t'])
        if self.independent:tangent=tangent/np.linalg.norm(tangent) # paper coordinate audit only; imported frames remain raw
        h=value(sub(g0[1]['p'],g0[0]['p']))
        orientation=1 if cross2(tangent,h)>0 else -1
        axis0=tangent;axis1=np.array((-tangent[1],tangent[0]))*orientation
        # Rectangular paper coordinates (s,w); each band's w width is fixed
        # at its starting ruling length.  Strong monotonicity on this convex
        # domain proves global planar injectivity, including shared seams.
        widths=[float(np.linalg.norm(value(sub(g0[i+1]['p'],g0[i]['p'])))) for i in range(self.bands)]
        minimum_speed=math.inf;minimum_transverse=math.inf;minimum_root=math.inf;minimum_monotone=math.inf
        paper_certified=True
        def visit(left,right,seeds,depth):
            nonlocal minimum_speed,minimum_transverse,minimum_root,minimum_monotone,paper_certified
            self.evaluations+=1
            if self.evaluations>1024:
                raise GenericLinkedError('interval-budget','全区间根图与纸域验证预算耗尽；没有删带或更改输入。')
            mid=(left+right)/2
            mq,_,_,_,_=self.linked(mid,seeds)
            centres=[x.value for x in mq[2:]]
            try:
                q,angles,geom,boxes,margins=self.linked(Interval(left,right),centres)
                speeds=[interval(x.c[1]).lo for x in q]
                if min(speeds)<=1e-5:raise ValueError('parameter speed unresolved')
                for i,x in enumerate(q):
                    d=self.query['curves'][i];v=interval(x.value)
                    if not d['parameterMin']<v.lo<=v.hi<d['parameterMax']:raise ValueError('native domain unresolved')
                for angle in angles:
                    v=interval(angle.value)
                    if v.lo<=0<=v.hi or max(abs(v.lo),abs(v.hi))>=math.pi-.02:raise ValueError('fold angle singularity unresolved')
                transverse=[];monotone=[];cell_paper_certified=True
                for i in range(self.bands):
                    p0,p1=geom[i:i+2];h=sub(p1['p'],p0['p'])
                    for end in (p0,p1):
                        jac=interval(cross2(end['d'],h).value)*orientation
                        transverse.append(jac.lo)
                        if jac.lo<=1e-7:raise ValueError('paper Jacobian unresolved')
                        ds=[interval(v.value) for v in end['d']]
                        dv=[interval(v.value)/widths[i] for v in h]
                        x=dot(ds,axis0);y=dot(dv,axis1);off=(dot(dv,axis0)+dot(ds,axis1))/2
                        pd=x*y-off*off
                        monotone.append(pd.lo)
                        if x.lo<=1e-6 or y.lo<=1e-6 or pd.lo<=1e-7:cell_paper_certified=False
                if not cell_paper_certified and depth<10:
                    # Refine only when actual midpoint Jacobians satisfy this
                    # sufficient global criterion; an actual failure of it
                    # is an unproved paper, not a nonexistent construction.
                    _,_,mg,_,_=self.linked(mid,centres)
                    midpoint_positive=True
                    for i in range(self.bands):
                        hh=value(sub(mg[i+1]['p'],mg[i]['p']))/widths[i]
                        for end in mg[i:i+2]:
                            ds=value(end['d']);x=float(ds@axis0);y=float(hh@axis1);off=float(hh@axis0+ds@axis1)/2
                            if x<=0 or y<=0 or x*y-off*off<=1e-7:midpoint_positive=False
                    if midpoint_positive:raise ValueError('sufficient paper certificate needs refinement')
                # Both endpoint symmetric Jacobians are positive definite;
                # their convex combinations cover every v in the band.
                minimum_speed=min(minimum_speed,*speeds);minimum_transverse=min(minimum_transverse,*transverse)
                minimum_root=min(minimum_root,*margins);minimum_monotone=min(minimum_monotone,*monotone)
                paper_certified=paper_certified and cell_paper_certified
                start_roots=self.linked(left,centres,boxes)[0]
                if any(abs(x.value-y)>2e-9 for x,y in zip(start_roots[2:],seeds)):
                    raise GenericLinkedError('root-branch-unresolved','相邻根图未续接同一个端点根；禁止自动换支。')
                self.charts.append({'start':left,'end':right,'seeds':centres,'rootBounds':boxes})
                endpoint=self.linked(right,centres,boxes)[0]
                return [x.value for x in endpoint[2:]]
            except (ValueError,OverflowError) as exc:
                if depth>=20 or right-left<1e-9:
                    # Distinguish actual sampled failure from a conservative
                    # interval/injectivity proof that remains unresolved.
                    pq,pa,pg,_,_=self.linked(mid,centres)
                    if min(x.c[1] for x in pq)<=0:
                        raise GenericLinkedError('parameter-reversal','连续根支在共同参数下倒向或停滞。') from exc
                    for i in range(self.bands):
                        hh=value(sub(pg[i+1]['p'],pg[i]['p']))
                        if min(cross2(value(x['d']),hh)*orientation for x in pg[i:i+2])<=0:
                            raise GenericLinkedError('paper-self-overlap','输入二维纸域出现雅可比倒向或折回，不能构成所声明的单纸域。') from exc
                    raise GenericLinkedError('interval-regularity-unresolved','该输入的全区间简单根／局部正则包围尚未闭合；不能由采样替代根支验证。') from exc
                middle_seeds=visit(left,mid,seeds,depth+1)
                return visit(mid,right,middle_seeds,depth+1)
        visit(a,b,[x.value for x in q0[2:]],0)
        minimum_seam_root=math.inf
        for left,right in zip(self.charts,self.charts[1:]):
            seam=left['end']
            lq,_,_,_,_=self.linked(Interval(seam),left['seeds'])
            rq,_,_,_,_=self.linked(Interval(seam),right['seeds'])
            u=Taylor.variable(Interval(seam),self.order)
            merged=[]
            for x,y in zip(lq,rq):
                merged.append(Taylor([Interval(min(interval(v).lo,interval(w).lo),max(interval(v).hi,interval(w).hi)) for v,w in zip(x.c,y.c)]))
            geom=[self.geometry(i,x) for i,x in enumerate(merged)]
            angles=[self.parameters[2](u)]
            for i in range(self.bands-1):
                gl,gr=geom[i:i+2];h=sub(gr['p'],gl['p'])
                angle=-2*((gl['g']/gr['g'])*(dot(h,gr['l'])/dot(h,gl['l']))*(angles[i]/2).tan()).atan()
                angles.append(angle)
                target=angle.derivative()/(gr['g']*(angle/2).tan())-dot(h,gr['t'])/dot(h,gr['l'])
                x,y=interval(lq[i+2].value),interval(rq[i+2].value)
                if max(x.lo,y.lo)>min(x.hi,y.hi):
                    raise GenericLinkedError('root-branch-unresolved','相邻根图在接缝点的外包围不相交；禁止自动换支。')
                # Bind each freshly proved point root to its original cell
                # root as well: exclusion on the combined native-u hull
                # proves cell-left = point-left = point-right = cell-right.
                # Earlier bands have already established the same identity,
                # so their common-s coefficients enclose the same branch.
                hull=Interval(min(x.lo,y.lo,left['rootBounds'][i][0],right['rootBounds'][i][0]),
                              max(x.hi,y.hi,left['rootBounds'][i][1],right['rootBounds'][i][1]))
                derivative=interval(self.root_derivative(i+2,hull,gr,target))
                if derivative.lo<=0<=derivative.hi:
                    raise GenericLinkedError('root-branch-unresolved','接缝点联合根包围不能证明原生导数非零与根支唯一。')
                minimum_seam_root=min(minimum_seam_root,abs(derivative.lo),abs(derivative.hi))
        return {'certified':True,'evaluations':self.evaluations,'verifiedCells':len(self.charts),
                'minimumSpeedLowerBound':minimum_speed,'minimumTransverseLowerBound':minimum_transverse,
                'minimumRootDerivativeLowerBound':minimum_root,'minimumMonotonicityDeterminantLowerBound':minimum_monotone,
                'planarPaperInjective':paper_certified and not self.independent,'roundingModel':'binary64-outward-2ulp/libm-endpoints-2ulp-assumed',
                'rootMethod':'parameterized-krawczyk/simple-root-overlapping-charts',
                'seamMethod':'point-krawczyk/cell-root-hull-identity/shared-simple-root',
                'seamChecks':len(self.charts)-1,'minimumSeamRootDerivativeLowerBound':minimum_root if not math.isfinite(minimum_seam_root) else minimum_seam_root,
                'paperMethod':'positive-symmetric-Jacobian-on-common-rectangular-sheet',
                'paperAxes':[axis0.tolist(),axis1.tolist()],'bandWidths':widths,
                'rootCharts':self.charts,'coordinateNormalization':{'origin':self.world_origin.tolist(),'scale':self.world_scale}}

    def first_derivative(self,s,state):
        self.integration_calls+=1
        if self.independent and self.integration_calls>24000:raise GenericLinkedError('independent-integration-budget','独立原规则完整域的实际恢复超出有限积分预算；不降低曲率或改变规则。')
        _,gamma,geom=self.point(s);first,second=geom[:2]
        g=first['g'].value;n=g*math.tan(gamma[0].value/2)
        h=value(sub(second['p'],first['p']));a=float(h@value(first['t']));b=float(h@value(first['l']))
        tau=-n*a/b;t,l,u=(state[i:i+3] for i in (3,6,9))
        return np.concatenate((first['speed'].value*t,g*l+n*u,-g*t+tau*u,-n*t-tau*l))

    def row(self,s,state):
        q,angles,geom=self.point(s)
        flat=[value(g['p']) for g in geom];flatp=[value(g['d']) for g in geom]
        f,t,l,n=(state[i:i+3].copy() for i in (0,3,6,9))
        derivative=self.first_derivative(s,state);fp,tp,lp,np_=(derivative[i:i+3] for i in (0,3,6,9))
        spatial=[f.copy()];spatialp=[fp.copy()];frame=[];develop=[];geodesic=[]
        for i in range(self.bands):
            gi,gj=geom[i:i+2];h=sub(gj['p'],gi['p']);a=dot(h,gi['t']);b=dot(h,gi['l'])
            frame.append(float(np.max(np.abs(np.column_stack((t,l,n)).T@np.column_stack((t,l,n))-np.eye(3)))))
            develop.append(abs(a.value*float(tp@n)+b.value*float(lp@n)))
            geodesic.append(abs(float(tp@l)-gi['g'].value))
            f=f+a.value*t+b.value*l;fp=fp+a.c[1]*t+a.value*tp+b.c[1]*l+b.value*lp
            spatial.append(f.copy());spatialp.append(fp.copy())
            cs=dot(gi['t'],gj['t']);sn=cross2(gi['t'],gj['t'])
            nt=cs.value*t+sn.value*l;ntp=cs.c[1]*t+cs.value*tp+sn.c[1]*l+sn.value*lp
            left=-sn.value*t+cs.value*l;leftp=-sn.c[1]*t-sn.value*tp+cs.c[1]*l+cs.value*lp
            normal=np.cross(nt,left);normalp=np.cross(ntp,left)+np.cross(nt,leftp)
            if i+1<self.bands:
                angle=angles[i+1].value;ap=angles[i+1].c[1];c,g=math.cos(angle),math.sin(angle)
                nl=c*left-g*normal;nlp=c*leftp-g*normalp-ap*(g*left+c*normal)
                nn=np.cross(nt,nl);nnp=np.cross(ntp,nl)+np.cross(nt,nlp)
                t,tp,l,lp,n,np_=nt,ntp,nl,nlp,nn,nnp
        metrics=[]
        for i in range(self.bands):
            for v in (0.,.25,.5,.75,1.):
                ds=(1-v)*spatialp[i]+v*spatialp[i+1];dv=spatial[i+1]-spatial[i]
                ps=(1-v)*flatp[i]+v*flatp[i+1];pv=flat[i+1]-flat[i]
                metrics.extend((abs(float(ds@ds-ps@ps)),abs(float(ds@dv-ps@pv)),abs(float(dv@dv-pv@pv))))
        flat_world=[self.world_origin[:2]+self.world_scale*x for x in flat]
        spatial_world=[self.world_origin+self.world_scale*x for x in spatial]
        return {'s':s,'qValues':[x.value for x in q],'qDerivatives':[x.c[1] for x in q],
                'foldAnglesDeg':[math.degrees(x.value) for x in angles],
                'flatCurves':[x.tolist() for x in flat_world],'flatDerivatives':[(self.world_scale*x).tolist() for x in flatp],
                'foldedCurves':[x.tolist() for x in spatial_world],'foldedDerivatives':[(self.world_scale*x).tolist() for x in spatialp],
                'normalizedFlatCurves':[x.tolist() for x in flat],'normalizedFlatDerivatives':[x.tolist() for x in flatp],
                'normalizedFoldedCurves':[x.tolist() for x in spatial],'normalizedFoldedDerivatives':[x.tolist() for x in spatialp]}, {
                'frame':max(frame),'metric':max(metrics),'developability':max(develop),'geodesic':max(geodesic)}


def query_generic_linked(data):
    query=validate_generic_linked_query(data)
    if query.get('curve2DSystemsMode')=='independent-external':
        try:return _query_generic_linked(query)
        except GenericLinkedError:raise
        except (ZeroDivisionError,OverflowError,ValueError) as exc:
            raise GenericLinkedError('independent-rule-singularity','独立规则实际求值出现分母退化、未定义或数值越界；原值不替换。') from exc
    return _query_generic_linked(query)


def _query_generic_linked(query):
    kernel=Kernel(query);domain=kernel.certify()
    a,b=query['parameterStart'],query['parameterEnd'];_,_,geom=kernel.point(a)
    p=value(geom[0]['p']);t=value(geom[0]['t']);l=value(geom[0]['l'])
    initial=np.array((*p,0.,*t,0.,*l,0.,0.,0.,1.))
    integration=None
    if 'ndsolveOptions' in query:solution,integration=solve_linked_first3d_steps(kernel.first_derivative,a,b,initial,query['ndsolveOptions'])
    else:solution=solve_ivp(kernel.first_derivative,(a,b),initial,method='DOP853',rtol=2e-12,atol=2e-14,dense_output=True)
    if not solution.success or solution.sol is None:
        raise GenericLinkedError('integration-failure','首带 Darboux 三维积分失败。')
    rows=[];diags=[]
    for s in np.linspace(a,b,query['segments']+1):
        row,d=kernel.row(float(s),solution.sol(s));rows.append(row);diags.append(d)
    for s in np.linspace(a,b,129):
        _,d=kernel.row(float(s),solution.sol(s));diags.append(d)
    scale=max(1.,max(np.linalg.norm(p) for r in rows for p in r['normalizedFlatCurves']))
    maxima={key:max(d[key] for d in diags) for key in ('frame','metric','developability','geodesic')}
    compatible=maxima['frame']<=2e-7 and maxima['metric']<=scale*scale*2e-7 and maxima['developability']<=scale*2e-7 and maxima['geodesic']<=2e-7
    if not kernel.independent and not compatible:
        raise GenericLinkedError('metric-validation','独立导数、标架或连续 EFG 数值核验未通过。')
    result = {'family':'linked-generic-common-parameter','query':query,
            'source':{'notebookRows':[338484,340340],'savedNumericalOut':False,'savedPhysicalInputsPreserved':False,
                      'parameterContract':'native-curves-composed-once/common-s','formulaCorrections':['geodesic-curvature-ratio','common-parameter-angle-derivative','composed-tangent-frame'],
                      'method':'whitelist-AST/Taylor-implicit-root/Darboux-integration'},
            'diagnostics':{'validationNodes':129,'maxFrameGramError':maxima['frame'],'maxMetricError':maxima['metric'],
                           'maxDevelopabilityError':maxima['developability'],'maxGeodesicError':maxima['geodesic'],
                           'parameterDomain':domain},
            'certification':{'bandCount':kernel.bands,'singleCommonParameter':True,'isometryIdentitiesApplied':not kernel.independent,
                             'finiteNumericalMetricVerified':compatible,'fullIntervalRegularityCertified':not kernel.independent,'planarPaperInjectivityCertified':domain['planarPaperInjective'],
                             'allBandsAnalyticLocalIsometry':not kernel.independent,'globalBoundaryInjectivityChecked':domain['planarPaperInjective'],
                             'originalSavedFormulaReplayed':False,'exactStraightCreaseFOLD':False,'adoptableCreasePattern':False,
                             'selfCollisionChecked':False,'continuousFoldPathChecked':False,'integrationErrorIntervalCertified':False},
            'sample':{'rows':rows}}
    if 'curve2DSystems' in query:
        count=len(kernel.external_systems)
        result['curve2DSystems']={'option':'Curve2DSystems','definitionCell':'In[4076]',
            'systems':query['curve2DSystems'],'replacementIndices':list(range(count)),
            'next2DConsumedIndices':list(range(min(count,2))), 'next2DThirdSystemUsed':False,
            'usageScope':'same-source/native-frame-coefficients/linked-chain-and-three-dimensional-frames',
            'identityProof':'bounded-symbolic-formula-identity/native-domain-interval',
            'originalArbitrarySystemContractReproduced':False,'numericalInterpolationReproduced':False,
            'evaluations':kernel.external_system_evaluations}
    if kernel.independent:
        result['curve2DSystems'].update(mode='independent-external',
            identityProof='bounded-native-domain-finite-rules/no-source-identity-assertion',
            usageScope='independent-external/native-rule-values/linked-chain-and-three-dimensional-frames',
            rulesUnnormalized=True,originalSameSourceRequired=False)
        result['independentRules']={'mode':'independent-external','sourceIdentityAsserted':False,
            'ruleDomains':[system['parameterDomain'] for system in (query['curve2DSystems'] if isinstance(query['curve2DSystems'],list) else [])],
            'initialState':initial.tolist(),'metricCompatibilityVerified':compatible,
            'trajectoryMethod':'raw-imported-frame/Darboux-and-original-frame-algebra',
            'rawImportedValuesPreserved':True}
    if integration is not None:result['first3DIntegration']=integration
    return result
