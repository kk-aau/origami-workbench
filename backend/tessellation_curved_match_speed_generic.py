"""In[3729]/In[3734]: literal square-speed transport, not same-speed repair.

The original equation is f' |c2'(f)|² = |c1'|². The returned function
is c2(f(s)); its speed is usually different from |c1'(s)|. Keep both facts.
"""
import math
import numpy as np
from scipy.integrate import solve_ivp
from tessellation_curved_generic_darboux import Expression,Taylor,GenericDarbouxError
from tessellation_curved_generic_linked_expression import GenericLinkedError

PRESET={'family':'match-curve-speed-native','sourceCurve':['s','s**2/4'],
        'targetCurve':['2*s','0'],'initialParameter':0.,'parameterStart':-.5,
        'parameterEnd':1.,'segments':32}
class GenericCurveSpeedError(GenericDarbouxError):pass

def validate_match_curve_speed_query(data):
    if not isinstance(data,dict) or set(data)!=set(PRESET) or data.get('family')!=PRESET['family']:
        raise GenericCurveSpeedError('input-contract','原平方速度匹配须给两完整向量源、ui与s域。')
    q=dict(data)
    for key in ('sourceCurve','targetCurve'):
        if not isinstance(q[key],list) or not 1<=len(q[key])<=8:
            raise GenericCurveSpeedError('input-contract','两条原曲线各须1–8维；维数不必相等。')
        try:
            for source in q[key]:Expression(source,'s')
        except GenericLinkedError as e:raise GenericCurveSpeedError('expression-contract','曲线只接受完整安全标量表达式。') from e
        q[key]=q[key].copy()
    for key in ('initialParameter','parameterStart','parameterEnd'):
        if type(q[key]) not in (int,float) or not math.isfinite(q[key]):
            raise GenericCurveSpeedError('input-contract','原ui与s域端点须为有限数。')
        q[key]=float(q[key])
    if not -10<=q['parameterStart']<q['parameterEnd']<=10 or not .01<=q['parameterEnd']-q['parameterStart']<=12 or not q['parameterStart']<=q['initialParameter']<=q['parameterEnd']:
        raise GenericCurveSpeedError('input-contract','s域须在−10…10，跨度0.01–12，ui须在原闭域内。')
    if type(q['segments']) is not int or not 8<=q['segments']<=128:
        raise GenericCurveSpeedError('input-contract','显示段数须为8–128。')
    return q

def query_match_curve_speed_generic(data):
    q=validate_match_curve_speed_query(data)
    source=[Expression(s,'s') for s in q['sourceCurve']];target=[Expression(s,'s') for s in q['targetCurve']]
    ui=q['initialParameter'];calls=0
    def evaluate(functions,s):
        if not math.isfinite(s) or abs(s)>1e6:raise GenericCurveSpeedError('numerical-budget','原重参数超出有限求值预算，不截断重参数。')
        jets=[f(Taylor.variable(float(s),1)) for f in functions]
        if any(not math.isfinite(x) for jet in jets for x in jet.c):raise GenericCurveSpeedError('source-singularity','原曲线或导数在实际求值点不有限。')
        return jets
    def rhs(s,state):
        nonlocal calls
        calls+=1
        if calls>24000:raise GenericCurveSpeedError('numerical-budget','原平方速度ODE超出有限计算预算。')
        v1=math.hypot(*(x.c[1] for x in evaluate(source,s)));v2=math.hypot(*(x.c[1] for x in evaluate(target,float(state[0]))))
        if v2==0:raise GenericCurveSpeedError('source-singularity','原c2′(f)为零，平方速度ODE不确定；不修补原曲线。')
        ratio=(v1/v2)**2
        if not math.isfinite(ratio):raise GenericCurveSpeedError('source-numerics','原平方速度ODE超出有限数值范围。')
        return [ratio]
    try:
        rhs(ui,[ui]);solutions={}
        for key,end in [('left',q['parameterStart']),('right',q['parameterEnd'])]:
            if end==ui:continue
            sol=solve_ivp(rhs,(ui,end),[ui],method='DOP853',rtol=3e-12,atol=2e-13,dense_output=True)
            if not sol.success:raise GenericCurveSpeedError('integration-failed','原平方速度ODE未完成，不返回伪匹配曲线。')
            solutions[key]=sol
        def mapped(s):return ui if s==ui else float(solutions['left' if s<ui else 'right'].sol(s)[0])
        source_initial=[f.affine_parts(Taylor.variable(ui,1)) for f in source];target_initial=[f.affine_parts(Taylor.variable(ui,1)) for f in target]
        def row(s):
            f=mapped(s);a,b=evaluate(source,s),evaluate(target,f)
            try:unmapped=evaluate(target,s)
            except (ValueError,ZeroDivisionError,OverflowError,GenericCurveSpeedError):unmapped=None
            v1=math.hypot(*(x.c[1] for x in a));v2=math.hypot(*(x.c[1] for x in b));fp=rhs(s,[f])[0]
            return {'s':float(s),'mappedParameter':f,'mappedParameterDerivative':fp,
                'sourcePoint':[x.value for x in a],'sourceDerivative':[x.c[1] for x in a],
                'originalTargetPoint':None if unmapped is None else [x.value for x in unmapped],
                'matchedTargetPoint':[x.value for x in b],'matchedTargetDerivative':[x.c[1]*fp for x in b],
                'sourceSpeed':v1,'targetSpeedAtMappedParameter':v2,'matchedTargetSpeed':v2*fp}
        display=np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1)
        rows=[row(float(s)) for s in display]
        audits=[row(float(s)) for s in sorted(set(display)|set(np.linspace(q['parameterStart'],q['parameterEnd'],129))|{ui})]
        span=q['parameterEnd']-q['parameterStart'];scale=max([x['sourceSpeed']*span for x in audits]+[x['matchedTargetSpeed']*span for x in audits]) or 1.
        source_origin=[math.fsum(offset)+dynamic.value for offset,dynamic in source_initial];target_origin=[math.fsum(offset)+dynamic.value for offset,dynamic in target_initial]
        def normalized(functions,initial,s):
            answer=[]
            for function,(offset0,dynamic0) in zip(functions,initial):
                offset,dynamic=function.affine_parts(Taylor.variable(s,1))
                answer.append((math.fsum(offset+[-x for x in offset0])+dynamic.value-dynamic0.value)/scale)
            return answer
        for r in rows:
            r['normalizedSourcePoint']=normalized(source,source_initial,r['s'])
            r['normalizedOriginalTargetPoint']=None if r['originalTargetPoint'] is None else normalized(target,target_initial,r['s'])
            r['normalizedMatchedTargetPoint']=normalized(target,target_initial,r['mappedParameter'])
        transport=0.;speed_difference=0.
        for r in audits:
            v1,v2,fp=r['sourceSpeed'],r['targetSpeedAtMappedParameter'],r['mappedParameterDerivative']
            ratio=v1/v2;transport=max(transport,abs(fp-ratio*ratio)/max(abs(fp),ratio*ratio,1e-300))
            speed_difference=max(speed_difference,abs(r['matchedTargetSpeed']-v1)/max(v1,r['matchedTargetSpeed'],1e-300))
        return {'family':'origamica-native-match-curve-speed','query':q,
            'source':{'functions':['MatchCurveSpeed','NMatchCurveSpeed'],'definitionCells':['In[3729]','In[3734]'],
                'equation':'fPrime*dot(c2Prime(f),c2Prime(f))=dot(c1Prime,c1Prime)','returnedFunction':'c2(f(s))',
                'speedEquationRepaired':False,'interpolationReproduced':False,'symbolicOptionsReproduced':False},
            'initial':{'parameter':ui,'mappedParameter':ui},
            'normalization':{'sourceOrigin':source_origin,'targetOrigin':target_origin,'scale':scale},
            'diagnostics':{'validationNodes':129,'integrationEvaluations':calls,'maximumRelativeSquaredTransportResidual':transport,
                'maximumRelativeActualSpeedDifference':speed_difference},
            'certification':{'originalSquaredSpeedEquationEvaluated':True,'finiteSquaredTransportVerified':transport<=2e-8,
                'finiteActualSpeedMatchVerified':speed_difference<=2e-8,'integrationErrorIntervalCertified':False,
                'sourceWholeDomainCertified':False,'globalInjectivityChecked':False,'selfCollisionChecked':False,
                'adoptableCreasePattern':False,'exactStraightCreaseFOLD':False},'sample':{'rows':rows}}
    except GenericCurveSpeedError:raise
    except (ValueError,ZeroDivisionError,OverflowError) as e:raise GenericCurveSpeedError('source-numerics','原平方速度匹配无法有限求值。') from e
