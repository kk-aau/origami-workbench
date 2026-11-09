"""Literal six-source FoldCurvedFold3D / NFoldCurvedFold3D recovery.

Interval certificates enclose the input formulas and the half-angle scalar
identity. They do not enclose the error of the numerical Frenet trajectory.
Original nonunit directors, initial parameter and signed binormal are kept.
"""
import math
from functools import lru_cache

import numpy as np
from scipy.integrate import solve_ivp

from tessellation_curved_generic_darboux import (
    GenericDarbouxError, IntervalTaylor, dot, values, ROUNDING, RTOL, ATOL,
    METRIC_TOLERANCE, DEVELOPABILITY_TOLERANCE, INTEGRATION_BUDGET,
)
from tessellation_curved_generic_linked_expression import Expression, Taylor
from tessellation_curved_linked_common_interval import Interval, down, up

FAMILY = 'fold-3d-generic-native'
RESULT_FAMILY = 'origamica-generic-fold-3d'
CERTIFICATION_BUDGET = 1023
FRAME_COMPATIBILITY_TOLERANCE = 64*np.finfo(float).eps
PRESET = {
    'family': FAMILY, 'foldCurve': ['s', 's**2/4'], 'leftDirector': ['0', '2+.1*s'],
    'rightDirector': ['4*s*(1+.1*s)*sqrt(1+s**2/4)/(5+s**2)',
                      '(s**2-5)*(1+.1*s)*sqrt(1+s**2/4)/(5+s**2)'],
    'parameterStart': 0., 'parameterEnd': 1., 'transverseStart': 0., 'transverseEnd': .15,
    'segments': 32, 'rulingSegments': 16, 'initialParameter': 0.,
    'initialFoldAngleRad': -2*math.atan2(2, 1), 'initialPoint': [0., 0., 0.],
    'initialTangent': [1., 0., 0.], 'initialTopBinormal': [0., -2/math.sqrt(5), 1/math.sqrt(5)]}


class Fold3DError(GenericDarbouxError):
    pass


def det(a, b): return a[0]*b[1]-a[1]*b[0]
def norm(a): return dot(a, a).sqrt()
def vscale(a, k): return [x*k for x in a]
def lower_abs(x):
    x = Interval.cast(x)
    return min(abs(x.lo), abs(x.hi)) if not x.lo <= 0 <= x.hi else 0.
def interval_exp(x):
    return Interval(down(math.exp(x.lo)), up(math.exp(x.hi)))
def hull(a, b): return Interval(min(a.lo, b.lo), max(a.hi, b.hi))


def validate_fold_3d_generic_query(data):
    if not isinstance(data, dict) or set(data)-set(PRESET):
        raise Fold3DError('input-contract', '六源反折输入须为只含原合同字段的对象。')
    q = {**PRESET, **data}
    if q['family'] != FAMILY: raise Fold3DError('input-contract', '六源反折类型无效。')
    for key in ('foldCurve', 'leftDirector', 'rightDirector'):
        if not isinstance(q[key], list) or len(q[key]) != 2:
            raise Fold3DError('input-contract', 'f、rL、rR须各有两个安全标量表达式。')
        for source in q[key]: Expression(source, 's')
        q[key] = list(q[key])
    for key in ('parameterStart', 'parameterEnd', 'transverseStart', 'transverseEnd',
                'initialParameter', 'initialFoldAngleRad'):
        x = q[key]
        if type(x) not in (int, float) or not math.isfinite(x):
            raise Fold3DError('input-contract', '原域、ui和初始γ须为有限实数。')
        q[key] = float(x)
    a, b = q['parameterStart'], q['parameterEnd']
    if not -10 <= a < b <= 10 or not .01 <= b-a <= 12:
        raise Fold3DError('input-contract', 's域须在−10…10内且长度0.01–12。')
    if not a <= q['initialParameter'] <= b:
        raise Fold3DError('input-contract', '原ui须位于完整s域内；不改为端点。')
    if not -1e6 <= q['transverseStart'] < q['transverseEnd'] <= 1e6:
        raise Fold3DError('input-contract', '横向域须递增并位于−10⁶…10⁶内。')
    if not -100 <= q['initialFoldAngleRad'] <= 100:
        raise Fold3DError('input-contract', '初始γ以rad输入，有限算法范围为−100…100。')
    for key, lo, hi in [('segments', 8, 128), ('rulingSegments', 2, 64)]:
        if type(q[key]) is not int or not lo <= q[key] <= hi:
            raise Fold3DError('input-contract', '显示密度超出有限预算。')
    for key in ('initialPoint', 'initialTangent', 'initialTopBinormal'):
        row = q[key]
        if not isinstance(row, list) or len(row) != 3 or any(type(x) not in (int, float) or not math.isfinite(x) or abs(x) > 1e12 for x in row):
            raise Fold3DError('input-contract', '原三维初值须有三个有限分量且绝对值≤10¹²。')
        q[key] = [float(x) for x in row]
    t, top = np.asarray(q['initialTangent']), np.asarray(q['initialTopBinormal'])
    if max(abs(np.linalg.norm(t)-1), abs(np.linalg.norm(top)-1), abs(float(t@top))) > 1e-10:
        raise Fold3DError('initial-frame', '原tti与bbti须为互相垂直的单位向量；不自动修改初值。')
    angle = q['initialFoldAngleRad']/2
    gamma = q['initialFoldAngleRad']
    if gamma == math.pi*round(gamma/math.pi) or math.sin(angle) == 0 or math.cos(angle) == 0:
        raise Fold3DError('initial-angle', '原Cot/Sec半角在初值未定义；不代入展平极限。')
    return q


class Fold3DKernel:
    def __init__(self, q):
        self.query, self.ui = q, q['initialParameter']
        self.curves = [[Expression(x, 's') for x in q[key]] for key in ('foldCurve', 'leftDirector', 'rightDirector')]
        self.parts = [f.affine_parts(Taylor.variable(self.ui, 3)) for f in self.curves[0]]
        self.source_origin = np.asarray([math.fsum(offset)+dynamic.value for offset, dynamic in self.parts])
        self.target_origin = np.asarray(q['initialPoint'])
        speeds = []
        for s in np.linspace(q['parameterStart'], q['parameterEnd'], 9):
            jets = [f.affine_parts(Taylor.variable(float(s), 1))[1] for f in self.curves[0]]
            speeds.append(math.hypot(*(x.c[1] for x in jets)))
        self.scale = max(speeds)*(q['parameterEnd']-q['parameterStart'])
        if not math.isfinite(self.scale) or self.scale <= 0:
            raise Fold3DError('source-speed', '源速度为零或无法数值归一化。')
        self.orientation = None
        p = self.finite(self.ui)
        self.orientation = 1 if p['kl'].value > 0 else -1
        t = np.asarray(q['initialTangent']); b = self.orientation*np.asarray(q['initialTopBinormal']); n = np.cross(b, t)
        self.initial_state = np.concatenate(([q['initialFoldAngleRad']], np.zeros(3), t, n, b))
        frame = np.column_stack((t, n, b))
        self.frame_gram_residual = float(np.max(np.abs(frame.T@frame-np.eye(3))))
        self.frame_compatible = self.frame_gram_residual <= FRAME_COMPATIBILITY_TOLERANCE
        self.forward = self.backward = None
        self.integration_calls = 0

    def point(self, argument):
        s = (IntervalTaylor if isinstance(argument, Interval) else Taylor).variable(argument, 3)
        b = []
        for f, (origin_offset, origin_dynamic) in zip(self.curves[0], self.parts):
            offset, dynamic = f.affine_parts(s)
            delta = math.fsum(offset+[-x for x in origin_offset])
            b.append((dynamic-origin_dynamic.value+delta)/self.scale)
        bp = [x.derivative() for x in b]; bpp = [x.derivative() for x in bp]
        v = norm(bp); t = vscale(bp, 1/v); l = [-t[1], t[0]]
        kl = det(bp, bpp)/(v*v*v)
        sides = {}
        for label, functions, sign in [('left', self.curves[1], 1), ('right', self.curves[2], -1)]:
            d = [f(s)/self.scale for f in functions]; dp = [x.derivative() for x in d]
            p, q = dot(t, d), sign*dot(l, d)
            sides[label] = {'d': d, 'dp': dp, 'p': p, 'q': q, 'cot': p/q}
        coefficient = v*kl*(sides['left']['cot']-sides['right']['cot'])
        return {'b': b, 'bp': bp, 'v': v, 'T': t, 'L': l, 'kl': kl, 'A': coefficient, **sides}

    @lru_cache(maxsize=8192)
    def finite(self, s):
        try:
            p = self.point(float(s))
            if p['v'].value <= 0 or not math.isfinite(p['kl'].value):
                raise ValueError('zero speed/nonfinite curvature')
            if p['kl'].value == 0:
                raise Fold3DError('curvature-zero', '原Sign(κl)=0会压掉横向母线；当前正则Frenet反折入口不接受该退化，未改为圆族或非零曲率。')
            if self.orientation is not None and p['kl'].value*self.orientation < 0:
                raise Fold3DError('curvature-sign-change', '源κl变号，连续原Sign标架必经过κl=0；不替换曲线。')
            return p
        except Fold3DError: raise
        except (ValueError, ZeroDivisionError, OverflowError) as exc:
            raise Fold3DError('source-singularity', '原六源速度、κl、横向母线投影或表达式在真实求值点未定义。') from exc

    def coefficients(self, p, gamma):
        half = gamma/2; sn, cs = math.sin(half), math.cos(half)
        if sn == 0 or cs == 0:
            raise Fold3DError('angle-singularity', '原角度Cot/Sec奇点已达到；保留原域而明确拒绝。')
        k = abs(p['kl'].value)/cs
        tau = .5*(sn/cs)*p['kl'].value*(p['left']['cot'].value+p['right']['cot'].value)
        gp = p['A'].value*sn/cs
        if not all(math.isfinite(x) for x in (k, tau, gp)):
            raise Fold3DError('angle-domain', '原角度/曲率/挠率超出数值范围。')
        return sn, cs, k, tau, gp

    def rhs(self, s, y):
        self.integration_calls += 1
        if self.integration_calls > INTEGRATION_BUDGET:
            raise Fold3DError('integration-budget', '完整原s域的γ/Frenet恢复超过积分预算；不缩窄原域。')
        p = self.finite(float(s)); _, _, k, tau, gp = self.coefficients(p, y[0])
        v = p['v'].value; t, n, b = y[4:7], y[7:10], y[10:13]
        out = np.concatenate(([gp], v*t, v*k*n, v*(-k*t+tau*b), -v*tau*n))
        if not np.all(np.isfinite(out)): raise Fold3DError('integration-domain', '原Frenet导数不再为有限数值。')
        return out

    def integrate(self):
        for key, end in [('backward', self.query['parameterStart']), ('forward', self.query['parameterEnd'])]:
            if end == self.ui: continue
            sol = solve_ivp(self.rhs, (self.ui, end), self.initial_state, method='DOP853', rtol=RTOL, atol=ATOL,
                            dense_output=True, max_step=(self.query['parameterEnd']-self.query['parameterStart'])/32)
            if not sol.success or not np.all(np.isfinite(sol.y)):
                raise Fold3DError('integration-failed', '原完整s域的γ/Frenet数值恢复失败。')
            setattr(self, key, sol)

    def target(self, s, p):
        y = self.initial_state if s == self.ui else (self.backward if s < self.ui else self.forward).sol(s)
        gamma = float(y[0]); t, n, b = [np.asarray(y[i:i+3]) for i in (4, 7, 10)]
        sn, cs, k, tau, gp = self.coefficients(p, gamma)
        v = p['v'].value; tp = v*k*n; np_ = v*(-k*t+tau*b); bprime = -v*tau*n
        ll, lr = self.orientation*(cs*n+sn*b), self.orientation*(cs*n-sn*b)
        llp = self.orientation*(cs*np_+sn*bprime+.5*gp*(-sn*n+cs*b))
        lrp = self.orientation*(cs*np_-sn*bprime+.5*gp*(-sn*n-cs*b))
        out = {'b': np.asarray(y[1:4]), 'bp': v*t, 'T': t, 'N': n, 'B': b, 'LL': ll, 'LR': lr,
               'gamma': gamma, 'gammaPrime': gp, 'k': k, 'tau': tau}
        for label, l, lp, sign in [('left', ll, llp, 1), ('right', lr, lrp, -1)]:
            f = p[label]; p0, q0, pp, qp = f['p'].value, f['q'].value, f['p'].c[1], f['q'].c[1]
            out[label] = {'d': p0*t+sign*q0*l, 'dp': pp*t+p0*tp+sign*(qp*l+q0*lp)}
        return out

    def jacobians(self, p, w):
        return {label: Interval.cast(det([a+b*w for a, b in zip(p['bp'], p[label]['dp'])], p[label]['d']).value)
                for label in ('left', 'right')}

    def cell(self, a, b):
        p = self.point(Interval(a, b)); v, kl = Interval.cast(p['v'].value), Interval.cast(p['kl'].value)
        bounds = [v.lo, lower_abs(kl), lower_abs(p['left']['q'].value), lower_abs(p['right']['q'].value)]
        if min(bounds) <= 0: raise ValueError('source frame unresolved')
        orientation = 1 if kl.lo > 0 else -1
        if orientation != self.orientation: raise ValueError('source orientation unresolved')
        A = Interval.cast(p['A'].value); js = self.jacobians(p, Interval(self.query['transverseStart'], self.query['transverseEnd']))
        if not all(math.isfinite(x.lo+x.hi) for x in [A, *js.values()]): raise ValueError('nonfinite interval')
        return {'start': a, 'end': b, 'speedLowerBound': bounds[0], 'absoluteCurvatureLowerBound': bounds[1],
                'leftTransverseLowerBound': bounds[2], 'rightTransverseLowerBound': bounds[3], 'sourceOrientation': orientation,
                'angleCoefficientBounds': [A.lo, A.hi], 'sourceLeftNormalizedJacobianBounds': [js['left'].lo, js['left'].hi],
                'sourceRightNormalizedJacobianBounds': [js['right'].lo, js['right'].hi]}

    def angle_domain(self, cells, certified):
        angle = Interval(self.query['initialFoldAngleRad'])/2; z0, c0 = angle.sin(), angle.cos()
        result = {'certified': False, 'method': 'interval-integral-of-source-A/sine-half-angle-exponential',
                  'sineHalfAngleBounds': None, 'minimumAbsoluteSineHalfAngleLowerBound': None,
                  'minimumAbsoluteCosineHalfAngleLowerBound': None, 'cosineHalfAngleSign': 1 if c0.lo > 0 else -1 if c0.hi < 0 else None,
                  'reason': 'complete source integral enclosure unavailable'}
        if not certified or lower_abs(z0) <= 0 or lower_abs(c0) <= 0: return result
        z = z0
        try:
            forward = [c for c in cells if c['start'] >= self.ui]
            backward = list(reversed([c for c in cells if c['end'] <= self.ui]))
            for group, sign in [(forward, 1), (backward, -1)]:
                integral = Interval(0)
                for cell in group:
                    width = Interval(cell['end'])-Interval(cell['start'])
                    A = Interval(*cell['angleCoefficientBounds'])
                    partial = A*Interval(0, width.hi) if sign == 1 else A*Interval(-width.hi, 0)
                    z = hull(z, z0*interval_exp((integral+partial)/2))
                    integral = integral+A*width*sign
            maximum = max(abs(z.lo), abs(z.hi))
            result['sineHalfAngleBounds'] = [z.lo, z.hi]
            if maximum >= 1 or lower_abs(z) <= 0:
                result['reason'] = 'enclosure does not exclude a literal half-angle pole; no domain narrowing'
                return result
            cosine = (1-Interval(maximum)*Interval(maximum)).sqrt().lo
            result.update(certified=True, minimumAbsoluteSineHalfAngleLowerBound=lower_abs(z),
                          minimumAbsoluteCosineHalfAngleLowerBound=cosine, reason=None)
        except (ValueError, OverflowError, ZeroDivisionError):
            result['reason'] = 'half-angle integral finite interval budget unresolved'
        return result

    def domain(self):
        q = self.query; a, b = q['parameterStart'], q['parameterEnd']
        stack = [(x, y, 0) for x, y in [(self.ui, b), (a, self.ui)] if x < y]
        cells, unresolved, count = [], [], 0
        while stack:
            x, y, depth = stack.pop(); count += 1
            if count > CERTIFICATION_BUDGET:
                unresolved.extend([[x, y]]+[[c, d] for c, d, _ in stack]); break
            try:
                cell = self.cell(x, y)
                # Tighter affine-J intervals can prove full finite widths.
                uncertain = any(cell['source'+side+'NormalizedJacobianBounds'][0] <= 0 <= cell['source'+side+'NormalizedJacobianBounds'][1] for side in ('Left', 'Right'))
                if uncertain and depth < 9 and count+len(stack)+2 < CERTIFICATION_BUDGET:
                    p = self.finite((x+y)/2); ends = [self.jacobians(p, w) for w in (q['transverseStart'], q['transverseEnd'])]
                    if any(not min(j[side].lo for j in ends) <= 0 <= max(j[side].hi for j in ends) for side in ('left', 'right')):
                        middle = (x+y)/2; stack.extend([(middle, y, depth+1), (x, middle, depth+1)]); continue
                cells.append(cell)
            except (ValueError, ZeroDivisionError, OverflowError):
                self.finite((x+y)/2)
                if depth >= 18 or y-x <= 1e-9: unresolved.append([x, y])
                else:
                    middle = (x+y)/2; stack.extend([(middle, y, depth+1), (x, middle, depth+1)])
        cells.sort(key=lambda c: c['start']); unresolved.sort(); certified = not unresolved
        def strip(side):
            intervals = [Interval(*c['source'+side+'NormalizedJacobianBounds']) for c in cells]
            signs = {1 if x.lo > 0 else -1 if x.hi < 0 else 0 for x in intervals}
            valid = certified and len(signs) == 1 and 0 not in signs
            return {'status': 'verified' if valid else 'unknown', 'orientation': next(iter(signs)) if valid else None,
                    'minimumAbsoluteJacobianLowerBound': min(lower_abs(x) for x in intervals) if valid else None,
                    'reason': None if valid else 'finite original strip domain unresolved; no width narrowing'}
        angle = self.angle_domain(cells, certified)
        # The integral enclosure may require finer cells than source frames.
        # Refine the actual source-A bounds, never a numerical gamma sample.
        while certified and not angle['certified'] and count+2*len(cells) <= CERTIFICATION_BUDGET:
            children = []
            try:
                for cell in cells:
                    x, y = cell['start'], cell['end']; middle = (x+y)/2
                    count += 2; children.extend([self.cell(x, middle), self.cell(middle, y)])
            except (ValueError, OverflowError, ZeroDivisionError): break
            cells = children
            angle = self.angle_domain(cells, certified)
        src = {side: strip(side.title()) for side in ('left', 'right')}
        formal = {side: dict(src[side]) if certified and angle['certified'] and self.frame_compatible else {
            'status': 'unknown', 'orientation': None, 'minimumAbsoluteJacobianLowerBound': None,
            'reason': 'original numerical initial frame orthogonal compatibility not verified' if not self.frame_compatible else
                      'formal angle/source contract unresolved'} for side in ('left', 'right')}
        return {'certified': certified, 'evaluations': count, 'verifiedCells': len(cells), 'cells': cells, 'unresolved': unresolved,
                **{key: min(c[field] for c in cells) if certified else None for key, field in [
                    ('minimumSpeedLowerBound', 'speedLowerBound'), ('minimumAbsoluteCurvatureLowerBound', 'absoluteCurvatureLowerBound'),
                    ('minimumLeftTransverseLowerBound', 'leftTransverseLowerBound'), ('minimumRightTransverseLowerBound', 'rightTransverseLowerBound')]},
                'roundingModel': ROUNDING, 'reason': None if certified else 'interval subdivision budget exhausted; original domain retained',
                'angleBranch': angle, 'sourceStripRegularity': src, 'formalStripRegularity': formal}

    def row(self, s, p, target):
        row = {'s': s, 'foldAngleRad': target['gamma'], 'foldAngleDerivative': target['gammaPrime']}
        for label, origin, base, bp, ds in [('Source', self.source_origin, values(p['b']), values(p['bp']), p),
                                            ('Target', self.target_origin, target['b'], target['bp'], target)]:
            quantities = [('Base', base), ('BaseDerivative', bp)]
            for side in ('left', 'right'):
                f = ds[side]
                quantities.extend([(side.title()+'Director', values(f['d']) if label == 'Source' else f['d']),
                                   (side.title()+'DirectorDerivative', values(f['dp']) if label == 'Source' else f['dp'])])
            for name, vector in quantities:
                row[label.lower()+name] = (vector*self.scale+(origin if name == 'Base' else 0)).tolist()
                row['normalized'+label+name] = vector.tolist()
        row.update({key: target[field].tolist() for key, field in [('targetTangent', 'T'), ('targetNormal', 'N'),
                    ('targetBinormal', 'B'), ('targetLeftNormal', 'LL'), ('targetRightNormal', 'LR')]})
        v, kl = p['v'].value, p['kl'].value
        coefficients = {'speed': v*self.scale, 'normalizedSpeed': v, 'leftCurvature': kl/self.scale,
                        'normalizedLeftCurvature': kl, 'curvature': target['k']/self.scale, 'normalizedCurvature': target['k'],
                        'torsion': target['tau']/self.scale, 'normalizedTorsion': target['tau'],
                        'angleCoefficient': p['A'].value, 'sourceOrientation': self.orientation}
        for side in ('left', 'right'):
            f = p[side]; c = {'cotRho': f['cot'].value}
            for key, x in [('p', f['p'].value), ('q', f['q'].value), ('pPrime', f['p'].c[1]), ('qPrime', f['q'].c[1])]:
                c[key] = x*self.scale; c['normalized'+key[0].upper()+key[1:]] = x
            coefficients[side] = c
        row['coefficients'] = coefficients
        return row


def query_fold_3d_generic(data):
    q = validate_fold_3d_generic_query(data)
    try:
        kernel = Fold3DKernel(q); domain = kernel.domain(); kernel.integrate()
        return _result(kernel, domain)
    except Fold3DError: raise
    except (ValueError, ZeroDivisionError, OverflowError) as exc:
        raise Fold3DError('source-domain', '原六源无法在完整有限实数域恢复γ及Frenet曲折。') from exc


def _result(kernel, domain):
    q = kernel.query; sample, grid = [], []
    wlist = np.linspace(q['transverseStart'], q['transverseEnd'], q['rulingSegments']+1)
    audit_w = list(wlist); midpoint = (q['transverseStart']+q['transverseEnd'])/2
    if midpoint not in audit_w: audit_w.append(midpoint)
    maxima = dict.fromkeys(['leftMetric', 'rightMetric', 'leftDevelop', 'rightDevelop', 'frame', 'angle'], 0.)
    degenerate = {'left': False, 'right': False}
    def inspect(s, p, target):
        frame = np.column_stack((target['T'], target['N'], target['B']))
        maxima['frame'] = max(maxima['frame'], float(np.max(np.abs(frame.T@frame-np.eye(3)))))
        residual = target['gammaPrime']*math.cos(target['gamma']/2)/math.sin(target['gamma']/2)-p['A'].value
        maxima['angle'] = max(maxima['angle'], abs(residual)/max(abs(p['A'].value), 1/(q['parameterEnd']-q['parameterStart'])))
        metrics = {}
        for side in ('left', 'right'):
            f, t = p[side], target[side]; bp, d, dp = values(p['bp']), values(f['d']), values(f['dp'])
            den = np.linalg.norm(target['bp'])*np.linalg.norm(t['d'])*max(np.linalg.norm(t['dp']), np.linalg.norm(t['d']))
            develop = abs(float(np.cross(target['bp'], t['d'])@t['dp']))/max(den, np.finfo(float).tiny)
            maxima[side+'Develop'] = max(maxima[side+'Develop'], develop)
            sm, tm = [], []
            for i, w in enumerate(audit_w):
                ds, dt = bp+w*dp, target['bp']+w*t['dp']
                source = np.asarray([ds@ds, ds@d, d@d]); recovered = np.asarray([dt@dt, dt@t['d'], t['d']@t['d']])
                e = max(abs(source[0]), abs(recovered[0]), np.finfo(float).tiny)
                g = max(abs(source[2]), abs(recovered[2]), np.finfo(float).tiny)
                natural = np.asarray([e, math.sqrt(e)*math.sqrt(g), g])
                mismatch = float(np.max(np.abs(source-recovered)/natural))
                maxima[side+'Metric'] = max(maxima[side+'Metric'], mismatch)
                if i < len(wlist): sm.append(source.tolist()); tm.append(recovered.tolist())
            metrics['source'+side.title()+'EFG'] = sm; metrics['target'+side.title()+'EFG'] = tm
        endpoints = [kernel.jacobians(kernel.point(Interval(s)), Interval(float(w))) for w in (q['transverseStart'], q['transverseEnd'])]
        for side in ('left', 'right'):
            a, b = endpoints[0][side], endpoints[1][side]
            if a.hi < 0 < b.lo or b.hi < 0 < a.lo or a.lo == a.hi == 0 or b.lo == b.hi == 0:
                degenerate[side] = True
        return metrics
    for s in np.linspace(q['parameterStart'], q['parameterEnd'], 129):
        p = kernel.finite(float(s)); inspect(float(s), p, kernel.target(float(s), p))
    for s in np.linspace(q['parameterStart'], q['parameterEnd'], q['segments']+1):
        s = float(s); p = kernel.finite(s); t = kernel.target(s, p)
        sample.append(kernel.row(s, p, t)); row = {'s': s, **inspect(s, p, t)}
        for side in ('left', 'right'):
            for label, base, director, origin in [('Source', values(p['b']), values(p[side]['d']), kernel.source_origin),
                                                  ('Target', t['b'], t[side]['d'], kernel.target_origin)]:
                points = [base+w*director for w in wlist]
                row['normalized'+label+side.title()] = [x.tolist() for x in points]
                row[label.lower()+side.title()] = [(x*kernel.scale+origin).tolist() for x in points]
        grid.append(row)
    for side in ('left', 'right'):
        if degenerate[side]:
            info = {'status': 'degenerate', 'orientation': None, 'minimumAbsoluteJacobianLowerBound': None,
                    'reason': 'literal affine strip Jacobian has a finite focus witness; original width domain retained'}
            domain['sourceStripRegularity'][side] = dict(info)
            if domain['certified'] and domain['angleBranch']['certified'] and kernel.frame_compatible:
                domain['formalStripRegularity'][side] = dict(info)
    integration = {'method': 'DOP853', 'relativeTolerance': RTOL, 'absoluteTolerance': ATOL, 'initialParameter': kernel.ui,
                   'backwardEvaluations': 0 if kernel.backward is None else int(kernel.backward.nfev),
                   'forwardEvaluations': 0 if kernel.forward is None else int(kernel.forward.nfev), 'integrationErrorIntervalCertified': False}
    cert = {'finiteLeftMetricVerified': maxima['leftMetric'] <= METRIC_TOLERANCE,
            'finiteRightMetricVerified': maxima['rightMetric'] <= METRIC_TOLERANCE,
            'finiteDevelopabilityVerified': max(maxima['leftDevelop'], maxima['rightDevelop']) <= DEVELOPABILITY_TOLERANCE,
            'finiteAngleEquationVerified': maxima['angle'] <= DEVELOPABILITY_TOLERANCE,
            'sourceRegularityCertified': domain['certified'], 'angleBranchCertified': domain['angleBranch']['certified'],
            'initialFrameCompatible': kernel.frame_compatible,
            'formalIsometryCertified': domain['certified'] and domain['angleBranch']['certified'] and kernel.frame_compatible,
            **{k: False for k in ['integrationErrorIntervalCertified', 'globalInjectivityChecked', 'selfCollisionChecked',
                                  'exactStraightCreaseFOLD', 'adoptableCreasePattern']}}
    for stage in ('source', 'formal'):
        for side in ('Left', 'Right'): cert[stage+side+'StripRegularityCertified'] = domain[stage+'StripRegularity'][side.lower()]['status'] == 'verified'
    cert = {key: bool(value) for key, value in cert.items()}
    return {'family': RESULT_FAMILY, 'query': q,
            'source': {'functions': ['FoldCurvedFold3D', 'NFoldCurvedFold3D'], 'definitionCells': ['In[3972]', 'In[3977]'],
                       'method': 'whitelist-AST/Taylor/original-angle-Frenet-DOP853', 'initialArgumentOrder': ['ui', 'gammai', 'ffi', 'tti', 'bbti'],
                       'binormalConvention': 'B(ui)=Sign(kappaL(ui))*bbti;N(ui)=B(ui).cross(tti)', 'directorNormalized': False,
                       'interpolationReproduced': False, 'symbolicSolverReproduced': False, 'wolframOptionsReproduced': False,
                       'metricConvention': 'normalized-s/world-w'},
            'normalization': {'sourceOrigin': kernel.source_origin.tolist(), 'targetOrigin': kernel.target_origin.tolist(), 'scale': kernel.scale},
            'initial': {'parameter': kernel.ui, 'foldAngleRad': q['initialFoldAngleRad'], 'point': q['initialPoint'], 'tangent': q['initialTangent'],
                        'topBinormal': q['initialTopBinormal'], 'binormal': kernel.initial_state[10:13].tolist(),
                        'normal': kernel.initial_state[7:10].tolist(), 'sourceOrientation': kernel.orientation,
                        'frameGramResidual': kernel.frame_gram_residual, 'frameCompatibilityTolerance': FRAME_COMPATIBILITY_TOLERANCE,
                        'frameCompatible': bool(kernel.frame_compatible)},
            'diagnostics': {'validationNodes': 129, 'maximumFrameResidual': maxima['frame'],
                            'maximumLeftRelativeMetricDifference': maxima['leftMetric'], 'maximumRightRelativeMetricDifference': maxima['rightMetric'],
                            'maximumLeftRelativeDevelopabilityResidual': maxima['leftDevelop'], 'maximumRightRelativeDevelopabilityResidual': maxima['rightDevelop'],
                            'maximumAngleEquationResidual': maxima['angle'], 'metricTolerance': METRIC_TOLERANCE,
                            'developabilityTolerance': DEVELOPABILITY_TOLERANCE, 'integration': integration},
            'certification': cert, 'domain': domain, 'sample': {'rows': sample}, 'grid': grid}
