"""Literal bounded NConstantWidthScale2D, Origamica In[3878].

The two original starting pairs select the point root of the vector equation.
Scalar elimination is used only to prove simple parameterized root charts.
Neither the unused tangent extrapolation nor a nearest-foot replacement is
introduced. Unknown interval evidence preserves the complete sampled source.
"""
import math

import numpy as np

from tessellation_curved_generic_linked_expression import Expression, GenericLinkedError, Taylor
from tessellation_curved_linked_common_interval import Interval

FAMILY='constant-width-generic-native'
RESULT_FAMILY='origamica-generic-constant-width'
ROUNDING='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'
CERTIFICATION_BUDGET=1023
PRESET={'family':FAMILY,'baseCurve':['cos(s)','sin(s)'],'director':['-1','0'],
        'signedOffset':.1,'parameterStart':0.,'parameterEnd':.35*math.pi,
        'footEvaluationStart':-.5,'footEvaluationEnd':2.,'segments':64}
NONCIRCULAR_PRESET={**PRESET,'baseCurve':['s','.1*s**2'],'director':['0','1'],
    'signedOffset':.05,'parameterEnd':.8,'footEvaluationStart':-.1,'footEvaluationEnd':1.}


class ConstantWidthError(GenericLinkedError):pass


def validate_constant_width_generic_query(data):
    if not isinstance(data,dict) or data.get('family')!=FAMILY or set(data)-set(PRESET):
        raise ConstantWidthError('input-contract','通用恒宽查询类型或字段无效。')
    q={**PRESET,**data}
    for key in ('baseCurve','director'):
        if not isinstance(q[key],list) or len(q[key])!=2:
            raise ConstantWidthError('input-contract','恒宽基线与母线各须两个安全标量源函数。')
        for source in q[key]:Expression(source,'s')
        q[key]=list(q[key])
    for key in ('signedOffset','parameterStart','parameterEnd','footEvaluationStart','footEvaluationEnd'):
        value=q[key]
        if type(value) not in (int,float) or not math.isfinite(value):
            raise ConstantWidthError('input-contract','有向垂距和参数域须为有限数。')
        q[key]=float(value)
    a,b=q['parameterStart'],q['parameterEnd'];c,d=q['footEvaluationStart'],q['footEvaluationEnd']
    if not -20<=a<b<=20 or not .001<=b-a<=12:
        raise ConstantWidthError('input-contract','源s域须在−20…20，长度0.001–12。')
    if not -40<=c<d<=40 or d-c>40:
        raise ConstantWidthError('input-contract','额外有限垂足求值域须在−40…40，跨度不超过40。')
    if abs(q['signedOffset'])>1000 or type(q['segments']) is not int or not 8<=q['segments']<=128:
        raise ConstantWidthError('input-contract','垂距须−1000…1000，显示段数须8–128整数。')
    return q


def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def multiply(a,k):return [x*k for x in a]
def magnitude(a):return dot(a,a).sqrt()
def values(a):return np.array([x.value for x in a],dtype=float)
def iv(x):return Interval.cast(x)
def sign(x):return 1 if x>0 else -1 if x<0 else 0
def absolute_lower(x):
    x=iv(x)
    if x.lo<=0<=x.hi:raise ValueError('interval derivative or sign straddles zero')
    return min(abs(x.lo),abs(x.hi))


class ConstantWidthKernel:
    def __init__(self,q):
        self.query=q;self.base=[Expression(x,'s') for x in q['baseCurve']]
        self.velocity=[f.derivative() for f in self.base]
        self.director=[Expression(x,'s') for x in q['director']]
        self.parts=[f.affine_parts(Taylor.variable(q['parameterStart'],2)) for f in self.base]
        self.origin=np.array([math.fsum(c)+d.value for c,d in self.parts])
        span=q['parameterEnd']-q['parameterStart']
        speeds=[math.hypot(*(f(Taylor.constant(q['parameterStart']+span*i/8,0)).value for f in self.velocity)) for i in range(9)]
        self.scale=max(abs(q['signedOffset']),max(speeds)*span)
        if not math.isfinite(self.scale) or self.scale<=0:
            raise ConstantWidthError('source-domain','源基线或垂距无法定义有限正归一化尺度。')
        self.offset=q['signedOffset']/self.scale;self.cache={}

    def coordinates(self,argument):
        result=[]
        for f,(origin_offsets,origin_dynamic) in zip(self.base,self.parts):
            offsets,dynamic=f.affine_parts(argument)
            shift=math.fsum(offsets+[-x for x in origin_offsets])
            result.append((dynamic-origin_dynamic.value+shift)/self.scale)
        return result

    def geometry(self,argument):
        b=self.coordinates(argument);bp=[f(argument)/self.scale for f in self.velocity]
        speed=magnitude(bp);t=multiply(bp,1/speed);normal=[-t[1],t[0]]
        d=[f(argument) for f in self.director]
        return {'b':b,'bp':bp,'speed':speed,'t':t,'normal':normal,'d':d}

    def offset_point(self,argument,epsilon):
        f=self.geometry(argument)
        return [b+self.offset*epsilon*l for b,l in zip(f['b'],f['normal'])]

    def point_sign(self,u):
        f=self.geometry(Taylor.constant(u,0))
        return sign(dot(f['normal'],f['d']).value)

    def vector_residual(self,s,width,u):
        source=self.geometry(Taylor.constant(s,0));foot=self.geometry(Taylor.constant(u,0))
        epsilon=sign(dot(foot['normal'],foot['d']).value)
        residual=values([b+width*d-f-self.offset*epsilon*l for b,d,f,l in zip(source['b'],source['d'],foot['b'],foot['normal'])])
        if not np.all(np.isfinite(residual)):raise ValueError('nonfinite source equation')
        return residual,epsilon

    def vector_jacobian(self,s,u,epsilon):
        source=self.geometry(Taylor.constant(s,0));foot=self.geometry(Taylor.variable(u,2))
        offset_prime=values([v+self.offset*epsilon*n.derivative() for v,n in zip(foot['bp'],foot['normal'])])
        return np.column_stack((values(source['d']),-offset_prime))

    def root(self,s):
        if s in self.cache:return self.cache[s]
        try:
            x=np.array([.5*self.offset,s]);step=.01*(self.query['parameterEnd']-self.query['parameterStart'])
            residual,epsilon=self.vector_residual(s,*x)
            if np.linalg.norm(residual,np.inf)>2e-13:
                second,_=self.vector_residual(s,x[0],s+step)
                # The first original starting pair gives exactly this column:
                # [F(w0,s)-F(.5w0,s)]/(.5w0)=d(s). Keeping its algebraic
                # value avoids cancellation for tiny nonzero offsets.
                d=values(self.geometry(Taylor.constant(s,0))['d'])
                jac=np.column_stack((d,(second-residual)/step))
                for _ in range(60):
                    x=x-np.linalg.solve(jac,residual)
                    if not np.all(np.isfinite(x)):raise ValueError('nonfinite Newton root')
                    residual,epsilon=self.vector_residual(s,*x)
                    if np.linalg.norm(residual,np.inf)<2e-13:break
                    jac=self.vector_jacobian(s,x[1],epsilon)
                else:raise ConstantWidthError('root-budget','原双种子数值求根预算耗尽；未换另一根。')
            u=float(x[1]);width=float(x[0])
            if not self.query['footEvaluationStart']<=u<=self.query['footEvaluationEnd']:
                raise ConstantWidthError('foot-evaluation-domain','原种子求得的垂足超出额外有限求值域；这不是原数学方程无解，请扩大垂足域。')
            if epsilon==0 and self.offset!=0:
                raise ConstantWidthError('sign-degeneracy','原足点l(u)·d(u)=0，Sign使非零垂距退化。')
            self.cache[s]=(width,u,epsilon)
            return self.cache[s]
        except ConstantWidthError:raise
        except (ValueError,OverflowError,ZeroDivisionError,np.linalg.LinAlgError) as error:
            raise ConstantWidthError('root-source-domain','原双种子宽度方程未能产生有限数值根；源式、足点速度或根Jacobian可能退化。') from error

    def scalar_residual(self,s,u,epsilon):
        source=self.geometry(s);offset=self.offset_point(u,epsilon)
        return cross([x-b for x,b in zip(offset,source['b'])],source['d'])

    def root_derivative(self,s,u,epsilon):
        source=self.geometry(Taylor.constant(s,0));foot=self.geometry(Taylor.variable(u,2))
        prime=[v+self.offset*epsilon*n.derivative() for v,n in zip(foot['bp'],foot['normal'])]
        return cross(prime,source['d']).value

    def implicit_point(self,s,u,epsilon):
        argument=Taylor.variable(s,1);native=Taylor([u,0. if not isinstance(u,Interval) else Interval(0.)])
        derivative=self.root_derivative(s,u,epsilon)
        if isinstance(derivative,Interval):absolute_lower(derivative)
        elif not math.isfinite(derivative) or derivative==0:
            if self.offset==0:
                # At zero distance the exact identity point is known even if
                # the auxiliary foot equation is not a simple implicit root.
                native=argument
            else:raise ValueError('non-simple native foot root')
        if self.offset!=0 or (isinstance(derivative,Interval) or derivative!=0):
            native.c[1]=-self.scalar_residual(argument,native,epsilon).c[1]/derivative
        source=self.geometry(argument);foot=self.geometry(native)
        offset=[b+self.offset*epsilon*l for b,l in zip(foot['b'],foot['normal'])]
        difference=[x-b for x,b in zip(offset,source['b'])]
        width=dot(difference,source['d'])/dot(source['d'],source['d'])
        outer=[b+width*d for b,d in zip(source['b'],source['d'])]
        return source,foot,width,outer,native

    def interval_root(self,left,right,centre,epsilon,width=0.):
        s=Interval(left,right);source=self.geometry(Taylor.constant(s,0))
        f=iv(self.scalar_residual(Taylor.constant(s,0),Taylor.constant(centre,0),epsilon).value)
        centre_derivative=iv(self.root_derivative(s,centre,epsilon));minimum=absolute_lower(centre_derivative)
        estimated=max(abs(f.lo),abs(f.hi))/minimum
        low,high=self.query['footEvaluationStart'],self.query['footEvaluationEnd']
        for factor in (1.5,3.,6.,12.):
            radius=max(1e-10,width,estimated)*factor
            box=Interval(max(low,centre-radius),min(high,centre+radius))
            if not low<box.lo<box.hi<high:continue
            foot=self.geometry(Taylor.variable(box,2));projection=iv(dot(foot['normal'],foot['d']).value)
            if epsilon==0 or projection.lo*epsilon<=0 or projection.hi*epsilon<=0:continue
            derivative=iv(self.root_derivative(s,box,epsilon));margin=absolute_lower(derivative)
            middle=(box.lo+box.hi)/2;c=1/((derivative.lo+derivative.hi)/2)
            f=iv(self.scalar_residual(Taylor.constant(s,0),Taylor.constant(middle,0),epsilon).value)
            k=middle-c*f+(1-c*derivative)*(box-middle)
            if box.lo<k.lo<=k.hi<box.hi:
                return k,margin,absolute_lower(projection),iv(foot['speed'].value).lo,iv(source['speed'].value).lo
        raise ValueError('parameterized root inclusion unresolved')

    def prove(self):
        a,b=self.query['parameterStart'],self.query['parameterEnd'];todo=[(a,b,0)];cells=[];unresolved=[];evaluations=0
        while todo:
            left,right,depth=todo.pop();evaluations+=1
            if evaluations>CERTIFICATION_BUDGET:
                unresolved.extend([(left,right)]+[(x,y) for x,y,_ in todo]);break
            middle=(left+right)/2;_,centre,epsilon=self.root(middle)
            try:
                box,margin,projection,foot_speed,source_speed=self.interval_root(left,right,centre,epsilon)
                source,foot,width,_,_=self.implicit_point(Interval(left,right),box,epsilon)
                dlength=iv(magnitude(source['d']).value).lo
                if min(foot_speed,source_speed,dlength)<=0:raise ValueError('source or foot speed unresolved')
                cells.append({'start':left,'end':right,'footBounds':[box.lo,box.hi],
                    'normalizedWidthBounds':[iv(width.value).lo,iv(width.value).hi],'branchSign':epsilon,
                    'rootDerivativeLowerBound':margin,'signProjectionLowerBound':projection,
                    'footSpeedLowerBound':foot_speed,'sourceSpeedLowerBound':source_speed,'directorLengthLowerBound':dlength,
                    '_centre':centre})
            except (ValueError,OverflowError,ZeroDivisionError):
                if depth>=18 or right-left<1e-8:unresolved.append((left,right))
                else:
                    half=(left+right)/2;todo.extend(((half,right,depth+1),(left,half,depth+1)))
        cells.sort(key=lambda c:c['start']);unresolved.sort();seams=0;minimum_seam=math.inf;reason=None
        try:
            for left,right in zip(cells,cells[1:]):
                if left['end']!=right['start']:continue
                seam=left['end'];epsilon=left['branchSign']
                if epsilon!=right['branchSign']:raise ValueError('root sign changed between charts')
                lbox,*_=self.interval_root(seam,seam,left['_centre'],epsilon)
                rbox,*_=self.interval_root(seam,seam,right['_centre'],epsilon)
                if max(lbox.lo,rbox.lo)>min(lbox.hi,rbox.hi):raise ValueError('seam root enclosures disjoint')
                hull=Interval(min(lbox.lo,rbox.lo,left['footBounds'][0],right['footBounds'][0]),
                              max(lbox.hi,rbox.hi,left['footBounds'][1],right['footBounds'][1]))
                margin=absolute_lower(self.root_derivative(Interval(seam),hull,epsilon))
                foot=self.geometry(Taylor.constant(hull,0));projection=iv(dot(foot['normal'],foot['d']).value)
                if min(projection.lo*epsilon,projection.hi*epsilon)<=0:raise ValueError('seam sign hull unresolved')
                minimum_seam=min(minimum_seam,margin);seams+=1
        except (ValueError,OverflowError,ZeroDivisionError):
            # Independent local charts cannot be promoted to one branch when
            # their true roots are not bound to a shared simple root.
            reason='seam root identity unresolved; original source-seeded samples retained'
            cells=[];unresolved=[(a,b)];seams=0;minimum_seam=math.inf
        certified=not unresolved
        if not certified and reason is None:reason='interval root-chart budget unresolved; original parameter domain retained'
        for cell in cells:cell.pop('_centre')
        return {'status':'verified' if certified else 'unknown','evaluations':min(evaluations,CERTIFICATION_BUDGET+1),
            'verifiedCells':len(cells),'cells':cells,'unresolved':[list(x) for x in unresolved],
            'seamChecks':seams,'seamMethod':'point-krawczyk/cell-root-hull-identity/shared-simple-root',
            'minimumSeamRootDerivativeLowerBound':minimum_seam if math.isfinite(minimum_seam) else None,
            'roundingModel':ROUNDING,'method':'parameterized-krawczyk/source-seeded-simple-root','reason':reason}

    def row(self,s):
        numeric_width,u,epsilon=self.root(s)
        source,foot,width,outer,native=self.implicit_point(s,u,epsilon)
        b,d,p,l,x=[values(items) for items in (source['b'],source['d'],foot['b'],foot['normal'],outer)]
        bp,dp,xp=[np.array([item.c[1] for item in items]) for items in (source['b'],source['d'],outer)]
        expected=p+self.offset*epsilon*l;residual=float(np.max(np.abs(x-expected)))
        distance=float(np.linalg.norm(x-p))*self.scale
        result={'s':s,'scale':width.value*self.scale,'scaleDerivative':width.c[1]*self.scale,
            'footParameter':u,'footParameterDerivative':native.c[1],'branchSign':epsilon,
            'base':(self.origin+self.scale*b).tolist(),'director':d.tolist(),'outer':(self.origin+self.scale*x).tolist(),
            'foot':(self.origin+self.scale*p).tolist(),'normal':l.tolist(),
            'baseDerivative':(self.scale*bp).tolist(),'directorDerivative':dp.tolist(),'outerDerivative':(self.scale*xp).tolist(),
            'normalizedBase':b.tolist(),'normalizedOuter':x.tolist(),'normalizedFoot':p.tolist(),'normalizedNormal':l.tolist(),
            'normalizedBaseDerivative':bp.tolist(),'normalizedOuterDerivative':xp.tolist(),
            'normalizedScale':width.value,'normalizedScaleDerivative':width.c[1],'rootResidual':residual,'perpendicularDistance':distance}
        numeric_difference=max(abs(numeric_width-width.value),abs(u-native.value))
        if not all(math.isfinite(x) for x in (residual,distance,numeric_difference,width.value,width.c[1],native.c[1])):
            raise ValueError('nonfinite width value or derivative')
        jac0=width.value*cross(bp,d);jac1=jac0+width.value**2*cross(dp,d)
        return result,numeric_difference,abs(distance/self.scale-abs(self.offset)),(jac0,jac1)

    def paper_proof(self,proof,point_jacobians):
        if self.offset==0:return {'status':'degenerate','orientation':None,'minimumAbsoluteJacobianLowerBound':None,'reason':'zero signed offset gives a zero-width strip'}
        first=point_jacobians[0][0];orientation=sign(first)
        if not orientation or any(min(orientation*x for x in pair)<=0 for pair in point_jacobians):
            return {'status':'degenerate','orientation':orientation or None,'minimumAbsoluteJacobianLowerBound':None,'reason':'sampled finite strip touches a focus or changes orientation'}
        minimum=math.inf
        if proof['status']=='verified':
            try:
                for cell in proof['cells']:
                    s=Interval(cell['start'],cell['end']);u=Interval(*cell['footBounds'])
                    source,_,width,_,_=self.implicit_point(s,u,cell['branchSign'])
                    bp=[item.value for item in source['bp']];d=[item.value for item in source['d']]
                    dp=[item.derivative().value for item in source['d']]
                    jac=iv(width.value)*cross(bp,d)+Interval(0,1)*iv(width.value)*iv(width.value)*cross(dp,d)
                    oriented=jac*orientation
                    if oriented.lo<=0:raise ValueError('paper Jacobian hull unresolved')
                    minimum=min(minimum,oriented.lo)
                return {'status':'verified','orientation':orientation,'minimumAbsoluteJacobianLowerBound':minimum,'reason':None}
            except (ValueError,OverflowError,ZeroDivisionError):pass
        return {'status':'unknown','orientation':orientation,'minimumAbsoluteJacobianLowerBound':None,'reason':'full finite-strip Jacobian was not bounded away from zero'}


def query_constant_width_generic(data):
    q=validate_constant_width_generic_query(data)
    try:
        kernel=ConstantWidthKernel(q);proof=kernel.prove();rows=[];jacobians=[]
        maximum_root=maximum_distance=maximum_seed=0.
        def inspect(s,save):
            nonlocal maximum_root,maximum_distance,maximum_seed
            row,difference,distance,jac=kernel.row(float(s))
            maximum_root=max(maximum_root,row['rootResidual']);maximum_distance=max(maximum_distance,distance);maximum_seed=max(maximum_seed,difference)
            jacobians.append(jac)
            if save:rows.append(row)
            if proof['status']=='verified':
                cells=[c for c in proof['cells'] if c['start']<=s<=c['end']]
                bound=False
                try:
                    point_box,*_=kernel.interval_root(s,s,row['footParameter'],row['branchSign'])
                    for cell in cells:
                        if cell['branchSign']!=row['branchSign']:continue
                        lower,upper=cell['footBounds']
                        if max(lower,point_box.lo)>min(upper,point_box.hi):continue
                        hull=Interval(min(lower,point_box.lo),max(upper,point_box.hi))
                        absolute_lower(kernel.root_derivative(Interval(s),hull,row['branchSign']))
                        foot=kernel.geometry(Taylor.constant(hull,0))
                        projection=iv(dot(foot['normal'],foot['d']).value)
                        if min(projection.lo*row['branchSign'],projection.hi*row['branchSign'])<=0:continue
                        # Both point and original cell roots exist in this
                        # union, where F_u has one strict sign. Thus they are
                        # the same true root, not just close numerical values.
                        bound=True;break
                except (ValueError,OverflowError,ZeroDivisionError):pass
                if not bound:
                    proof.update(status='unknown',reason='source-seeded point is not bound to the certified chart branch',cells=[],verifiedCells=0,
                        unresolved=[[q['parameterStart'],q['parameterEnd']]],seamChecks=0,minimumSeamRootDerivativeLowerBound=None)
        for s in np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1):inspect(s,True)
        for s in np.linspace(q['parameterStart'],q['parameterEnd'],129):inspect(s,False)
        finite_verified=max(maximum_root,maximum_distance,maximum_seed)<=2e-7
        if not finite_verified:raise ConstantWidthError('distance-validation','原宽度向量方程或垂距的独立数值回读未通过。')
        paper=kernel.paper_proof(proof,jacobians);whole=proof['status']=='verified'
        return {'family':RESULT_FAMILY,'query':q,
            'source':{'definitionCell':'In[3878]','savedCell':'In[3879]','function':'NConstantWidthScale2D',
                'method':'whitelist-AST/Taylor/source-seeded-Newton/interval-root-chart',
                'equation':'b(s)+w*d(s)=b(u)+signedOffset*l(u)*sign(l(u).d(u))',
                'actualEquationUsesUnextendedCurve':True,'declaredTangentExtensionUnused':True,'findRootOptionsForwarded':False,
                'findRootSeedRecipe':{'widthStartMultiplier':.5,'widthSecondMultiplier':1,'footSecondStepRatio':.01},
                'interpolationReproduced':False,'machineReadableWolframOut':False},
            'normalization':{'origin':kernel.origin.tolist(),'scale':kernel.scale},
            'diagnostics':{'validationNodes':129,'maximumNormalizedRootResidual':maximum_root,
                'maximumNormalizedPerpendicularResidual':maximum_distance,'maximumSourceSeedRootDifference':maximum_seed,'paperRegularity':paper},
            'certification':{'finiteNumericalDistanceVerified':finite_verified,'fullIntervalDistanceCertified':whole,
                'continuousRootBranchCertified':whole,'paperRegularityCertified':paper['status']=='verified',
                'nearestFootDistanceChecked':False,'globalInjectivityChecked':False,'spatialDevelopabilityChecked':False,
                'selfCollisionChecked':False,'exactStraightCreaseFOLD':False,'adoptableCreasePattern':False},
            'proof':proof,'sample':{'rows':rows}}
    except ConstantWidthError:raise
    except (ValueError,OverflowError,ZeroDivisionError,np.linalg.LinAlgError) as error:
        raise ConstantWidthError('source-domain','源宽度方程、导数或归一化超出有限数值域。') from error
