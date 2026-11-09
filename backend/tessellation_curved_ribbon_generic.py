"""Literal RibbonPair / NRibbonPair with four safe scalar sources.

The original spatial curve and eta are supplied; only the original planar
initial-value problem is recovered. No Wolfram source is executed, and no
extra director or initial-frame normalization is performed.
"""
import ast
import math
import numpy as np
import sympy as sp
from tessellation_curved_generic_darboux import (
    DarbouxKernel, GenericDarbouxError, Expression, Taylor, IntervalTaylor, dot, cross,
    values, magnitude, times, ROUNDING, DEVELOPABILITY_TOLERANCE, METRIC_TOLERANCE,
    initial_frame_compatibility,
)
from tessellation_curved_linked_common_interval import Interval
from tessellation_curved_matched_pair_query import algebraic_budget, simplified, symbolic_node

FAMILY = 'ribbon-generic-native'
RESULT_FAMILY = 'origamica-generic-ribbon-pair'
CERTIFICATION_BUDGET = 1023
PRESET = {'family': FAMILY, 'spaceCurve': ['sin(s)', 's**2/4', '1-cos(s)'],
          'normalAngle': 'atan(sqrt(4+s**2))', 'sigma': 1,
          'parameterStart': 0., 'parameterEnd': 1., 'transverseStart': -.15, 'transverseEnd': .15,
          'segments': 32, 'rulingSegments': 16, 'initialParameter': 0.,
          'initialPoint': [0., 0.], 'initialTangent': [1., 0.]}

class GenericRibbonError(GenericDarbouxError):
    pass

def validate_ribbon_generic_query(data):
    if not isinstance(data, dict) or set(data)-set(PRESET):
        raise GenericRibbonError('input-contract', '通用Ribbon输入须仅含原合同字段。')
    q = {**PRESET, **data}
    if q['family'] != FAMILY: raise GenericRibbonError('input-contract', 'Ribbon类型无效。')
    if not isinstance(q['spaceCurve'], list) or len(q['spaceCurve']) != 3:
        raise GenericRibbonError('input-contract', 'cc须为三个安全标量源。')
    for text in q['spaceCurve']: Expression(text, 's')
    Expression(q['normalAngle'], 's'); q['spaceCurve'] = list(q['spaceCurve'])
    if type(q['sigma']) is not int or q['sigma'] not in (-1, 1):
        raise GenericRibbonError('input-contract', '原σ须为固定整数−1或+1。')
    for key in ('parameterStart', 'parameterEnd', 'transverseStart', 'transverseEnd', 'initialParameter'):
        x = q[key]
        if type(x) not in (int, float) or not math.isfinite(x):
            raise GenericRibbonError('input-contract', '原域和ui须为有限实数。')
        q[key] = float(x)
    a, b = q['parameterStart'], q['parameterEnd']
    if not -10 <= a < b <= 10 or not .01 <= b-a <= 12 or not a <= q['initialParameter'] <= b:
        raise GenericRibbonError('input-contract', 's域须在−10…10内、长度0.01–12，ui须在原域内。')
    if not -1e6 <= q['transverseStart'] < q['transverseEnd'] <= 1e6:
        raise GenericRibbonError('input-contract', 'w域须递增并位于−10⁶…10⁶内。')
    for key, lo, hi in [('segments', 8, 128), ('rulingSegments', 2, 64)]:
        if type(q[key]) is not int or not lo <= q[key] <= hi:
            raise GenericRibbonError('input-contract', '显示密度超出有限预算。')
    for key in ('initialPoint', 'initialTangent'):
        v = q[key]
        if not isinstance(v, list) or len(v) != 2 or any(type(x) not in (int, float) or not math.isfinite(x) or abs(x) > 1e12 for x in v):
            raise GenericRibbonError('input-contract', 'ci/ti须为两个有限原始坐标，绝对值不超过10¹²。')
        q[key] = [float(x) for x in v]
    return q

def lower_abs(value):
    x = Interval.cast(value)
    return min(abs(x.lo), abs(x.hi)) if not x.lo <= 0 <= x.hi else 0.
def original_sign(value):
    x = Interval.cast(value)
    if x.lo > 0: return 1
    if x.hi < 0: return -1
    raise ValueError('original Uprime dot T sign branch crosses zero')

def constant_zero_angle_branch(expression, jet):
    if jet.value != math.pi*round(jet.value/math.pi): return False
    if not any(isinstance(node,ast.Name) and node.id=='s' for node in ast.walk(expression.tree)): return True
    try:
        if algebraic_budget(expression.tree) > 24: return False
        variable = sp.Symbol('s',real=True)
        # Construct only previously whitelist-validated nodes. Original RHS
        # evaluation is retained, so this never erases a source pole or log.
        return not simplified(symbolic_node(expression.tree,variable)).has(variable)
    except (ValueError,TypeError,RecursionError,NotImplementedError,sp.PolynomialError): return False

class RibbonKernel(DarbouxKernel):
    def __init__(self, q):
        self.query = q; self.ui = q['initialParameter']; self.flatten = True; self.dimension = 2; self.analytic = True
        self.curve = [Expression(x, 's') for x in q['spaceCurve']]; self.eta = Expression(q['normalAngle'], 's')
        angle_jet = self.eta(Taylor.variable(self.ui,4))
        self.zero_angle_candidate = constant_zero_angle_branch(self.eta,angle_jet)
        self.parts = [f.affine_parts(Taylor.variable(self.ui, 4)) for f in self.curve]
        self.source_origin = np.asarray([math.fsum(offset)+dynamic.value for offset, dynamic in self.parts])
        speeds = [math.hypot(*(f.affine_parts(Taylor.variable(float(s), 1))[1].c[1] for f in self.curve))
                  for s in np.linspace(q['parameterStart'], q['parameterEnd'], 9)]
        self.scale = max(speeds)*(q['parameterEnd']-q['parameterStart'])
        if not math.isfinite(self.scale) or self.scale <= 0:
            raise GenericRibbonError('source-speed', '原cc速度为零或无法归一化。')
        self.target_origin = np.asarray(q['initialPoint']); self.initial_tangent = np.asarray(q['initialTangent'])
        self.initial_left = np.asarray([-self.initial_tangent[1], self.initial_tangent[0]])
        self.initial_normal = None; self.initial_state = np.concatenate(([0., 0.], self.initial_tangent, self.initial_left))
        self.frame = initial_frame_compatibility([self.initial_tangent, self.initial_left])
        self.forward = self.backward = None; self.integration_calls = 0
        self.finite_point(self.ui)

    def point(self, argument):
        s = (IntervalTaylor if isinstance(argument, Interval) else Taylor).variable(argument, 4)
        b = []
        for f, (origin_offset, origin_dynamic) in zip(self.curve, self.parts):
            offset, dynamic = f.affine_parts(s); delta = math.fsum(offset+[-x for x in origin_offset])
            b.append((dynamic-origin_dynamic.value+delta)/self.scale)
        bp = [x.derivative() for x in b]; v = magnitude(bp); t = times(bp, 1/v); tp = [x.derivative() for x in t]
        turning = magnitude(tp); n = times(tp, 1/turning); bb = cross(t, n)
        curvature = turning/v; torsion = -dot(n, [x.derivative() for x in bb])/v
        eta = self.eta(s)
        zero_sine = self.zero_angle_candidate or not isinstance(argument, Interval) and eta.value == math.pi*round(eta.value/math.pi)
        if self.zero_angle_candidate:
            sn = s.constant(0.,s.order);cs = s.constant((-1)**round(self.eta(Taylor.variable(self.ui,0)).value/math.pi),s.order)
        else: sn, cs = eta.sincos()
        l = [cs*x-sn*y for x, y in zip(n, bb)]; u = [sn*x+cs*y for x, y in zip(n, bb)]
        up = [x.derivative() for x in u]; h = magnitude(up); a, beta = dot(up, t), dot(up, l)
        if zero_sine:
            if not self.zero_angle_candidate:
                raise GenericRibbonError('ruling-nondifferentiable', 'A=0,H>0时原DD字面为零，但此变η点的Sign/Abs母线一阶导数不定义；不假装原零值是除零。')
            # Constant eta=n*pi has literal Sign(0)=0 and Abs(0)=0.
            # H is still evaluated above; H=0 remains actual division by zero.
            if not isinstance(argument,Interval) and h.value <= 0: raise ValueError('literal original ruling divides by zero H')
            a = h*0
            p = q = s.constant(0., min(t[0].order,l[0].order,h.order))
        else:
            sign = original_sign(a.value); p, q = -sign*beta/h/self.scale, sign*a/h/self.scale
        d = times([p*x+q*y for x, y in zip(t, l)], self.query['sigma']); dp = [x.derivative() for x in d]
        g = dot(l, tp)
        return {'b': b, 'bp': bp, 'v': v, 'T': t, 'N': n, 'B': bb, 'L': l, 'U': u, 'd': d, 'dp': dp,
                'p': p, 'q': q, 'g': g, 'h': g*0, 'z': g*0, 'curvature': curvature, 'torsion': torsion,
                'eta': eta, 'normalDerivativeLength': h, 'normalTangentProjection': a, 'normalLeftProjection': beta}

    def jacobians(self, point, w):
        w = Interval.cast(w); bp, d, dp, u = [point[k] for k in ('bp', 'd', 'dp', 'U')]
        source = dot(cross([x+y*w for x, y in zip(bp, dp)], d), u).value
        p, q, g, v = [point[k].value for k in ('p', 'q', 'g', 'v')]
        pp, qp = point['p'].c[1], point['q'].c[1]; sigma = self.query['sigma']
        formal = sigma*v*q+w*(pp*q-qp*p-g*(p*p+q*q))
        return {'source': Interval.cast(source), 'formal': Interval.cast(formal)}

    def cell(self, a, b):
        p = self.point(Interval(a, b))
        minima = {'speedLowerBound': p['v'].value.lo, 'curvatureLowerBound': p['curvature'].value.lo,
                  'normalDerivativeLowerBound': p['normalDerivativeLength'].value.lo,
                  'signProjectionLowerBound': lower_abs(p['normalTangentProjection'].value)}
        if min(minima.values()) <= 0: raise ValueError('source frame/sign not enclosed')
        j = self.jacobians(p, Interval(self.query['transverseStart'], self.query['transverseEnd']))
        if not all(math.isfinite(x.lo+x.hi) for x in j.values()): raise ValueError('nonfinite Jacobian')
        return {'start': a, 'end': b, **minima, 'sign': original_sign(p['normalTangentProjection'].value),
                **{key+'NormalizedJacobianBounds': [x.lo, x.hi] for key, x in j.items()}}

    def domain(self):
        q = self.query; stack = [(q['parameterStart'], q['parameterEnd'], 0)]; cells = []; unresolved = []; evaluations = 0
        if self.zero_angle_candidate:
            # A constant zero-angle source has computable but zero directors.
            # Retain the full strip as a degenerate numerical output, without
            # reporting the nonzero-sign/unit-ruling regularity certificate.
            unresolved = [[q['parameterStart'],q['parameterEnd']]];stack=[];evaluations=1
        while stack:
            a, b, depth = stack.pop(); evaluations += 1
            if evaluations > CERTIFICATION_BUDGET:
                unresolved.extend([[a,b]]+[[x,y] for x,y,_ in stack]); break
            try:
                cell = self.cell(a,b); uncertain = [key for key in ('source','formal') if cell[key+'NormalizedJacobianBounds'][0] <= 0 <= cell[key+'NormalizedJacobianBounds'][1]]
                if uncertain and depth < 10 and evaluations+len(stack)+2 < CERTIFICATION_BUDGET:
                    point = self.finite_point((a+b)/2); ends = [self.jacobians(point,w) for w in (q['transverseStart'],q['transverseEnd'])]
                    if any(not min(j[key].lo for j in ends) <= 0 <= max(j[key].hi for j in ends) for key in uncertain):
                        middle = (a+b)/2; stack.extend([(middle,b,depth+1),(a,middle,depth+1)]); continue
                cells.append(cell)
            except (ValueError, ZeroDivisionError, OverflowError):
                self.finite_point((a+b)/2)
                if depth >= 18 or b-a <= 1e-9: unresolved.append([a,b])
                else:
                    middle = (a+b)/2; stack.extend([(middle,b,depth+1),(a,middle,depth+1)])
        cells.sort(key=lambda c:c['start']); unresolved.sort(); certified = not unresolved
        def strip(key):
            bounds = [Interval(*c[key+'NormalizedJacobianBounds']) for c in cells]
            signs = {1 if j.lo > 0 else -1 if j.hi < 0 else 0 for j in bounds}
            valid = certified and len(signs) == 1 and 0 not in signs
            return {'status': 'verified' if valid else 'unknown', 'orientation': next(iter(signs)) if valid else None,
                    'minimumAbsoluteJacobianLowerBound': min(lower_abs(j) for j in bounds) if valid else None,
                    'reason': None if valid else 'complete original strip Jacobian unresolved; width retained'}
        keys = ['Speed','Curvature','NormalDerivative','SignProjection']
        return {'certified': certified, 'evaluations': evaluations, 'verifiedCells': len(cells), 'cells': cells, 'unresolved': unresolved,
                **{'minimum'+key+'LowerBound': min(c[key[0].lower()+key[1:]+'LowerBound'] for c in cells) if certified else None for key in keys},
                'roundingModel': ROUNDING, 'reason': None if certified else 'literal constant sin(eta)=0 gives zero ruling; nonzero-sign regularity unavailable' if self.zero_angle_candidate else 'interval budget exhausted; original source and width retained',
                'sourceStripRegularity': strip('source'), 'formalStripRegularity': strip('formal')}

    def row(self, s, p, target):
        row = {'s': float(s), 'normalAngleRad': p['eta'].value, 'normalAngleDerivative': p['eta'].c[1]}
        for prefix, origin, base, director, basep, directorp in [
            ('Source', self.source_origin, values(p['b']), values(p['d']), values(p['bp']), values(p['dp'])),
            ('Target', self.target_origin, target['b'], target['d'], target['bp'], target['dp'])]:
            for suffix, x in [('Base',base),('Director',director),('BaseDerivative',basep),('DirectorDerivative',directorp)]:
                row[prefix.lower()+suffix] = (x*self.scale+(origin if suffix=='Base' else 0)).tolist()
                row['normalized'+prefix+suffix] = x.tolist()
        for key, frame in [('sourceTangent','T'),('sourceNormal','N'),('sourceBinormal','B'),('sourceLeftNormal','L'),('sourceSurfaceNormal','U')]:
            row[key] = values(p[frame]).tolist()
        row['targetTangent'], row['targetLeftNormal'] = target['T'].tolist(), target['L'].tolist()
        coeff = {'speed':p['v'].value*self.scale,'normalizedSpeed':p['v'].value,
                 'curvature':p['curvature'].value/self.scale,'normalizedCurvature':p['curvature'].value,
                 'torsion':p['torsion'].value/self.scale,'normalizedTorsion':p['torsion'].value,'g':p['g'].value}
        for key,value in [('p',p['p'].value),('q',p['q'].value),('pPrime',p['p'].c[1]),('qPrime',p['q'].c[1])]:
            coeff[key] = value*self.scale; coeff['normalized'+key[0].upper()+key[1:]] = value
        for key in ('normalDerivativeLength','normalTangentProjection','normalLeftProjection'): coeff[key] = p[key].value
        row['coefficients'] = coeff; return row

def ribbon_result(kernel, domain):
    q = kernel.query; widths = np.linspace(q['transverseStart'],q['transverseEnd'],q['rulingSegments']+1)
    audit_widths = sorted(set(widths)|{(q['transverseStart']+q['transverseEnd'])/2})
    rows = []; grid = []; metric = develop = unit = frame = 0.; focus = {'source':False,'formal':False}
    for s in sorted(set(np.linspace(q['parameterStart'],q['parameterEnd'],129)) | set(np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1))):
        p = kernel.finite_point(float(s)); t = kernel.target(float(s),p)
        for basis in (np.column_stack([values(p[k]) for k in ('T','N','B')]), np.column_stack((t['T'],t['L']))):
            frame = max(frame,float(np.max(np.abs(basis.T@basis-np.eye(basis.shape[1])))))
        bp,d,dp,u = [values(p[k]) for k in ('bp','d','dp','U')]
        develop = max(develop,abs(float(u@dp))/max(float(np.linalg.norm(d)),float(np.linalg.norm(dp)),np.finfo(float).tiny))
        unit = max(unit,abs(float(np.linalg.norm(d))*kernel.scale-1),abs(float(np.linalg.norm(t['d']))*kernel.scale-1))
        for w in audit_widths:
            ds,dt = bp+w*dp,t['bp']+w*t['dp'];sm = np.asarray([ds@ds,ds@d,d@d]);tm = np.asarray([dt@dt,dt@t['d'],t['d']@t['d']])
            e,g = max(sm[0],tm[0]),max(sm[2],tm[2]);den = np.maximum([e,math.sqrt(e)*math.sqrt(g),g],np.finfo(float).tiny)
            metric = max(metric,float(np.max(np.abs(sm-tm)/den)))
        ends = [kernel.jacobians(p,w) for w in (q['transverseStart'],q['transverseEnd'])]
        candidates = [key for key in focus if min(j[key].lo for j in ends) <= 0 <= max(j[key].hi for j in ends)]
        if candidates:
            narrow = kernel.point(Interval(float(s)));ends = [kernel.jacobians(narrow,Interval(w)) for w in (q['transverseStart'],q['transverseEnd'])]
            for key in candidates:
                a,b = ends[0][key],ends[1][key]
                if a.hi < 0 < b.lo or b.hi < 0 < a.lo or a.lo==a.hi==0 or b.lo==b.hi==0: focus[key]=True
    for s in np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1):
        p = kernel.finite_point(float(s));t = kernel.target(float(s),p);rows.append(kernel.row(s,p,t))
        ns = [values(p['b'])+w*values(p['d']) for w in widths];nt = [t['b']+w*t['d'] for w in widths]
        item = {'s':float(s),'normalizedSource':[x.tolist() for x in ns],'normalizedTarget':[x.tolist() for x in nt],
                'source':[(x*kernel.scale+kernel.source_origin).tolist() for x in ns],
                'target':[(x*kernel.scale+kernel.target_origin).tolist() for x in nt]}
        for label,bp,d,dp in [('source',values(p['bp']),values(p['d']),values(p['dp'])),('target',t['bp'],t['d'],t['dp'])]:
            item[label+'EFG'] = [[float((bp+w*dp)@(bp+w*dp)),float((bp+w*dp)@d),float(d@d)] for w in widths]
        grid.append(item)
    for stage in ('source','formal'):
        if focus[stage]:domain[stage+'StripRegularity'] = {'status':'degenerate','orientation':None,'minimumAbsoluteJacobianLowerBound':None,
            'reason':'literal affine Jacobian has a finite focus witness; full width retained'}
    if not kernel.frame['frameCompatible']:
        domain['formalStripRegularity'] = {'status':'unknown','orientation':None,'minimumAbsoluteJacobianLowerBound':None,
            'reason':'raw initial orthonormal frame compatibility not verified at roundoff scale'}
    cert = {'finiteMetricVerified':metric <= METRIC_TOLERANCE,'finiteDevelopabilityVerified':develop <= DEVELOPABILITY_TOLERANCE,
            'finiteUnitRulingsVerified':unit <= DEVELOPABILITY_TOLERANCE,'sourceRegularityCertified':domain['certified'],
            'sourceUnitRulingsAnalytic':domain['certified'],'sourceDevelopabilityAnalytic':domain['certified'],
            'initialFrameCompatible':kernel.frame['frameCompatible'],
            'formalIsometryCertified':bool(domain['certified'] and kernel.frame['frameCompatible']),
            'sourceStripRegularityCertified':domain['sourceStripRegularity']['status']=='verified',
            'formalStripRegularityCertified':domain['formalStripRegularity']['status']=='verified',
            **{key:False for key in ('integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern')}}
    return {'family':RESULT_FAMILY,'query':q,
            'source':{'functions':['RibbonPair','NRibbonPair'],'definitionCells':['In[3854]','In[3858]'],
                'method':'whitelist-AST/fourth-order-Frenet/original-eta-sign-abs-ruling/bilateral-DOP853',
                'initialArgumentOrder':['ui','ci','ti'],
                'rulingConstruction':'L=cos(eta)N-sin(eta)B;U=sin(eta)N+cos(eta)B;cRho=-Sign(Uprime dot T)*(Uprime dot L)/norm(Uprime);sRho=Abs(Uprime dot T)/norm(Uprime);D=sigma*(cRho*T+sRho*L), no extra Normalize',
                'interpolationReproduced':False,'symbolicSolverReproduced':False,'wolframOptionsReproduced':False,'metricConvention':'normalized-s/world-w'},
            'normalization':{'sourceOrigin':kernel.source_origin.tolist(),'targetOrigin':kernel.target_origin.tolist(),'scale':kernel.scale},
            'initial':{'parameter':kernel.ui,'point':q['initialPoint'],'tangent':q['initialTangent'],'leftNormal':kernel.initial_left.tolist(),**kernel.frame},
            'diagnostics':{'validationNodes':129,'maximumFrameResidual':frame,'maximumUnitRulingResidual':unit,'maximumRelativeMetricDifference':metric,
                'maximumRelativeDevelopabilityResidual':develop,'metricTolerance':METRIC_TOLERANCE,'developabilityTolerance':DEVELOPABILITY_TOLERANCE,
                'integration':{'method':'DOP853','relativeTolerance':2e-12,'absoluteTolerance':2e-14,'initialParameter':kernel.ui,
                    'backwardEvaluations':0 if kernel.backward is None else int(kernel.backward.nfev),
                    'forwardEvaluations':0 if kernel.forward is None else int(kernel.forward.nfev),'integrationErrorIntervalCertified':False}},
            'certification':cert,'domain':domain,'sample':{'rows':rows},'grid':grid}

def query_ribbon_generic(data):
    q = validate_ribbon_generic_query(data)
    try:
        kernel = RibbonKernel(q);domain = kernel.domain();kernel.integrate()
        with np.errstate(over='ignore',invalid='ignore',divide='ignore'):
            result = ribbon_result(kernel,domain)
        def finite_result(value):
            if isinstance(value,dict):return all(finite_result(x) for x in value.values())
            if isinstance(value,list):return all(finite_result(x) for x in value)
            return math.isfinite(value) if isinstance(value,(int,float,np.floating)) else True
        if not finite_result(result):
            raise GenericRibbonError('arithmetic-budget','原世界坐标或归一化EFG超出有限binary64结果预算；不回传Infinity或伪通过证书。')
        return result
    except GenericDarbouxError: raise
    except (ValueError,ZeroDivisionError,OverflowError) as exc:
        raise GenericRibbonError('source-domain','原四源Ribbon无法在完整有限实数域完成；不替换源/η或二维初值。') from exc
