"""Literal bounded FlattenGeneric2D / ReshapeGeneric3D numerical contracts.

Source interval certificates describe the original coefficients and the
formal exact recovery ODE. DOP853 positions have no interval error enclosure.
Nondevelopable source ribbons retain their real algebraic output; independent
finite metrics and analytic compatibility are deliberately separate claims.
"""
import ast
import math
from functools import lru_cache

import numpy as np
import sympy as sp
from scipy.integrate import solve_ivp
from tessellation_curved_uniform_resample import uniform_interpolator
from tessellation_curved_ndsolve_options import validate_ndsolve_options, solve_with_steps

from tessellation_curved_generic_linked_expression import Expression, GenericLinkedError, Taylor
from tessellation_curved_linked_common_interval import Interval
from tessellation_curved_matched_pair_query import symbolic_node, simplified, algebraic_budget

RESULT_FAMILY = 'origamica-generic-darboux'
FLATTEN_FAMILY = 'flatten-generic-native'
RESHAPE_FAMILY = 'reshape-generic-native'
ROUNDING = 'binary64-outward-2ulp/libm-endpoints-2ulp-assumed'
CERTIFICATION_BUDGET = 1023
INTEGRATION_BUDGET = 24000
METRIC_TOLERANCE = 2e-8
DEVELOPABILITY_TOLERANCE = 2e-9
RTOL, ATOL = 2e-12, 2e-14
FLATTEN_PRESET = {
    'family': FLATTEN_FAMILY, 'baseCurve': ['s', '.1*s**2', '.2*s**3'],
    'director': ['0', '0', '1'], 'sigma': 1,
    'parameterStart': 0., 'parameterEnd': 1., 'transverseStart': -.2, 'transverseEnd': .2,
    'segments': 32, 'rulingSegments': 16, 'initialParameter': 0.,
    'initialPoint': [0., 0.], 'initialTangent': [1., 0.]}
RESHAPE_PRESET = {**FLATTEN_PRESET, 'family': RESHAPE_FAMILY,
    'baseCurve': ['s+.4', '.2*s**2+.16*s', '.1*s**3+.12*s**2'],
    'director': ['(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)',
                 '.4*s*(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)',
                 '.3*s**2*(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)'],
    'normalCurvature': '.05+.02*sin(s)', 'transverseStart': -.1, 'transverseEnd': .1,
    'initialPoint': [0., 0., 0.], 'initialTangent': [1., 0., 0.],
    'initialDirector': [1/math.sqrt(1+.16**2), .16/math.sqrt(1+.16**2), 0.]}


class GenericDarbouxError(GenericLinkedError):
    pass


def dot(a, b): return sum(x*y for x, y in zip(a, b))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def times(a, k): return [x*k for x in a]
def values(a): return np.asarray([x.value for x in a], dtype=float)
def magnitude(a): return dot(a, a).sqrt()
def finite_vector(a): return bool(np.all(np.isfinite(a)))


class IntervalTaylor(Taylor):
    """Constant-only scalar expressions also retain outward interval math.

    Expression calls argument.constant at every literal leaf. The base
    Taylor class leaves constant-only subtrees as floats; those rounding
    errors must be enclosed before reporting a mathematical lower bound.
    """
    @classmethod
    def constant(cls, value, order):
        return super().constant(Interval.cast(value), order)


def validate_generic_darboux_query(data, expected_family=None):
    if not isinstance(data, dict):
        raise GenericDarbouxError('input-contract', '通用展开／重塑输入须为对象。')
    family = data.get('family', expected_family)
    if family not in (FLATTEN_FAMILY, RESHAPE_FAMILY) or (expected_family and family != expected_family):
        raise GenericDarbouxError('input-contract', '通用展开／重塑函数类型无效。')
    preset = FLATTEN_PRESET if family == FLATTEN_FAMILY else RESHAPE_PRESET
    if set(data)-set(preset)-{'resample', 'interpolationPoints', 'interpolationOrder', 'ndsolveOptions'}:
        raise GenericDarbouxError('input-contract', '通用展开／重塑含未支持字段。')
    result = {**preset, **data, 'family': family}
    if 'resample' in result:
        if type(result['resample']) is not bool or family != FLATTEN_FAMILY:
            raise GenericDarbouxError('input-contract', 'Resample仅用于当前二维展开数值入口，须为布尔值。')
        if result['resample']:
            if type(result.get('interpolationPoints')) is not int or not 4 <= result['interpolationPoints'] <= 256 or type(result.get('interpolationOrder')) is not int or result['interpolationOrder'] not in (1,2,3,4):
                raise GenericDarbouxError('input-contract', '均匀重采样须显式指定InterpolationPoints为4–256，InterpolationOrder为1–4；原Automatic默认点数未确认。')
        elif 'interpolationPoints' in result or 'interpolationOrder' in result:
            raise GenericDarbouxError('input-contract', '未启用Resample时不能声明未实现的自适应插值选项。')
    elif 'interpolationPoints' in result or 'interpolationOrder' in result:
        raise GenericDarbouxError('input-contract', '插值选项须同时显式启用Resample。')
    for key in ('baseCurve', 'director'):
        if not isinstance(result[key], list) or len(result[key]) != 3:
            raise GenericDarbouxError('input-contract', '源基线及母线须各有三个安全标量表达式。')
        for source in result[key]: Expression(source, 's')
        result[key] = list(result[key])
    if family == RESHAPE_FAMILY: Expression(result['normalCurvature'], 's')
    if type(result['sigma']) is not int or result['sigma'] not in (-1, 1):
        raise GenericDarbouxError('input-contract', 'σ须为整数−1或+1。')
    for key in ('parameterStart', 'parameterEnd', 'transverseStart', 'transverseEnd', 'initialParameter'):
        x = result[key]
        if type(x) not in (int, float) or not math.isfinite(x):
            raise GenericDarbouxError('input-contract', '参数域和原初值参数须为有限实数。')
        result[key] = float(x)
    a, b = result['parameterStart'], result['parameterEnd']
    if not -10 <= a < b <= 10 or not .01 <= b-a <= 12:
        raise GenericDarbouxError('input-contract', 's域须在−10…10内且长度0.01–12。')
    if 'ndsolveOptions' in result:result['ndsolveOptions']=validate_ndsolve_options(result['ndsolveOptions'],b-a)
    if not a <= result['initialParameter'] <= b:
        raise GenericDarbouxError('input-contract', '原初值ui须在完整s域内；不改为左端点。')
    if not -1e6 <= result['transverseStart'] < result['transverseEnd'] <= 1e6:
        raise GenericDarbouxError('input-contract', '横向域须递增并位于−10⁶…10⁶内。')
    for key, lo, hi in [('segments', 8, 128), ('rulingSegments', 2, 64)]:
        if type(result[key]) is not int or not lo <= result[key] <= hi:
            raise GenericDarbouxError('input-contract', '显示密度超出有限预算。')
    dimension = 2 if family == FLATTEN_FAMILY else 3
    for key in ('initialPoint', 'initialTangent') + (() if dimension == 2 else ('initialDirector',)):
        row = result[key]
        if not isinstance(row, list) or len(row) != dimension or any(type(x) not in (int, float) or not math.isfinite(x) or abs(x) > 1e12 for x in row):
            raise GenericDarbouxError('input-contract', '原初值须为正确维数且分量绝对值≤10¹²的有限向量。')
        result[key] = [float(x) for x in row]
    tangent = np.asarray(result['initialTangent'])
    if abs(float(np.linalg.norm(tangent))-1) > 1e-10:
        raise GenericDarbouxError('initial-frame', '原初始切向须为单位向量，不自动修改初值。')
    if dimension == 3:
        d = np.asarray(result['initialDirector'])
        if np.linalg.norm(d) == 0 or np.linalg.norm(np.cross(tangent, d)) == 0:
            raise GenericDarbouxError('initial-frame', '原ddi须非零且不平行于tti；其长度不作单位化。')
    return result


def analytic_developability(curves):
    """Prove det(b',d,d')=0 from checked AST nodes, never point samples."""
    try:
        nodes = [f.derivative().tree for f in curves[0]] + [f.tree for f in curves[1]] + [f.derivative().tree for f in curves[1]]
        if sum(len(list(ast.walk(n))) for n in nodes) > 1400 or any(algebraic_budget(n) > 24 for n in nodes):
            return False
        s = sp.Symbol('s', real=True)
        b, d = [[symbolic_node(f.tree, s) for f in group] for group in curves]
        bp, dp = [[sp.diff(x, s) for x in group] for group in (b, d)]
        # Simplify each term before the triple product, preserving the source
        # domain audit separately. Avoid open-ended symbolic solve/simplify.
        terms = [simplified(x*y) for x, y in zip(cross(bp, d), dp)]
        return simplified(sum(terms)) == 0
    except (ValueError, TypeError, ZeroDivisionError, RecursionError, OverflowError, sp.PolynomialError, NotImplementedError):
        return False


class DarbouxKernel:
    def __init__(self, query):
        self.query = query
        self.flatten = query['family'] == FLATTEN_FAMILY
        self.dimension = 2 if self.flatten else 3
        self.curves = [[Expression(source, 's') for source in query[key]] for key in ('baseCurve', 'director')]
        self.kn = None if self.flatten else Expression(query['normalCurvature'], 's')
        self.ui = query['initialParameter']
        self.parts = [f.affine_parts(Taylor.variable(self.ui, 3)) for f in self.curves[0]]
        self.source_origin = np.asarray([math.fsum(offset)+dynamic.value for offset, dynamic in self.parts])
        self.target_origin = np.asarray(query['initialPoint'])
        speeds = []
        for s in np.linspace(query['parameterStart'], query['parameterEnd'], 9):
            jets = [f.affine_parts(Taylor.variable(float(s), 1))[1] for f in self.curves[0]]
            speeds.append(math.hypot(*(x.c[1] for x in jets)))
        self.scale = max(speeds)*(query['parameterEnd']-query['parameterStart'])
        if not math.isfinite(self.scale) or self.scale <= 0:
            raise GenericDarbouxError('speed-singularity', '源速度为零或超出数值范围，无法恢复Darboux带。')
        self.analytic = bool(analytic_developability(self.curves))
        self.initial_tangent = np.asarray(query['initialTangent'])
        if self.flatten:
            self.initial_normal = None
            self.initial_left = np.asarray([-self.initial_tangent[1], self.initial_tangent[0]])
        else:
            u = query['sigma']*np.cross(self.initial_tangent, query['initialDirector'])
            self.initial_normal = u/np.linalg.norm(u)
            self.initial_left = np.cross(self.initial_normal, self.initial_tangent)
        self.initial_state = np.concatenate((np.zeros(self.dimension), self.initial_tangent, self.initial_left,
                                              [] if self.flatten else self.initial_normal))
        self.forward = self.backward = None
        self.resampling = None
        self.integration_calls = 0
        self.finite_point(self.ui)

    def coordinates(self, argument):
        result = []
        for f, (origin_offset, origin_dynamic) in zip(self.curves[0], self.parts):
            offset, dynamic = f.affine_parts(argument)
            delta = math.fsum(offset+[-x for x in origin_offset])
            result.append((dynamic-origin_dynamic.value+delta)/self.scale)
        return result

    def point(self, argument):
        s = (IntervalTaylor if isinstance(argument, Interval) else Taylor).variable(argument, 3)
        b = self.coordinates(s)
        d = [f(s)/self.scale for f in self.curves[1]]
        bp = [x.derivative() for x in b]
        dp = [x.derivative() for x in d]
        v = magnitude(bp)
        t = times(bp, 1/v)
        area = cross(t, d)
        transverse = magnitude(area)
        u = times(area, self.query['sigma']/transverse)
        l = cross(u, t)
        p, q = self.query['sigma']*dot(t, d), self.query['sigma']*dot(l, d)
        g = dot(l, [x.derivative() for x in t])
        h = Taylor.constant(0. if not isinstance(argument, Interval) else Interval(0), g.order) if self.flatten else v*(self.kn(s)*self.scale)
        z = h*0 if self.flatten else -h*p/q
        return {'b': b, 'd': d, 'bp': bp, 'dp': dp, 'v': v, 'T': t, 'L': l, 'U': u,
                'transverse': transverse, 'directorLength': magnitude(d), 'p': p, 'q': q, 'g': g, 'h': h, 'z': z}

    @lru_cache(maxsize=8192)
    def finite_point(self, s):
        try:
            point = self.point(float(s))
        except (ValueError, ZeroDivisionError, OverflowError) as exc:
            raise GenericDarbouxError('source-singularity', '源表达式、速度或T×d在实际求值点退化；不替换源曲线或初值。') from exc
        return point

    def rhs(self, s, state):
        self.integration_calls += 1
        if self.integration_calls > INTEGRATION_BUDGET:
            raise GenericDarbouxError('integration-budget', '原完整s域的数值恢复超出积分预算；不缩窄输入域。')
        point = self.finite_point(float(s))
        v, g, h, z = [point[k].value for k in ('v', 'g', 'h', 'z')]
        t, l = state[self.dimension:2*self.dimension], state[2*self.dimension:3*self.dimension]
        if self.flatten: result = np.concatenate((v*t, g*l, -g*t))
        else:
            u = state[9:12]
            result = np.concatenate((v*t, g*l+h*u, -g*t+z*u, -h*t-z*l))
        if not finite_vector(result): raise GenericDarbouxError('integration-domain', 'Darboux恢复导数超出有限数值范围。')
        return result

    def integrate(self):
        options=self.query.get('ndsolveOptions')
        self.accepted_steps=0
        def before_step():
            if options and 'MaxSteps' in options and self.accepted_steps>=options['MaxSteps']:
                raise GenericDarbouxError('max-steps-exceeded','原MaxSteps成功步数已耗尽，完整s域未完成；不返回截短曲面。')
            self.accepted_steps+=1
        for key, end in [('backward', self.query['parameterStart']), ('forward', self.query['parameterEnd'])]:
            if end == self.ui: continue
            if options:
                solution=solve_with_steps(self.rhs,self.ui,end,self.initial_state,RTOL,ATOL,
                    options.get('MaxStepSize',(self.query['parameterEnd']-self.query['parameterStart'])/32),before_step)
            else:solution = solve_ivp(self.rhs, (self.ui, end), self.initial_state,
                                 method='DOP853', rtol=RTOL, atol=ATOL, dense_output=True,
                                 max_step=(self.query['parameterEnd']-self.query['parameterStart'])/32)
            if not solution.success or not finite_vector(solution.y):
                raise GenericDarbouxError('integration-failed', '完整原s域的Darboux数值恢复失败；保留原合同并明确拒绝。')
            setattr(self, key, solution)

    def continuous_target(self, s, point):
        state = self.initial_state if s == self.ui else (self.backward if s < self.ui else self.forward).sol(s)
        b = np.asarray(state[:self.dimension])
        t, l = np.asarray(state[self.dimension:2*self.dimension]), np.asarray(state[2*self.dimension:3*self.dimension])
        u = None if self.flatten else np.asarray(state[9:12])
        v, p, q, g, h, z = [point[k].value for k in ('v', 'p', 'q', 'g', 'h', 'z')]
        pp, qp = point['p'].c[1], point['q'].c[1]
        d = self.query['sigma']*(p*t+q*l)
        dp = self.query['sigma']*((pp-q*g)*t+(qp+p*g)*l)
        if not self.flatten: dp = dp+self.query['sigma']*(p*h+q*z)*u
        return {'b': b, 'd': d, 'bp': v*t, 'dp': dp, 'T': t, 'L': l, 'U': u}

    def prepare_resampling(self):
        if not self.query.get('resample'): return
        q = self.query
        nodes = [q['parameterStart']+(q['parameterEnd']-q['parameterStart'])*i/q['interpolationPoints'] for i in range(q['interpolationPoints']+1)]
        order=q['interpolationOrder']
        interpolate=lambda rows:uniform_interpolator(nodes[0],nodes[-1],rows,order)
        targets = [self.continuous_target(s, self.finite_point(s)) for s in nodes]
        self.resampled_base = interpolate([t['b'].tolist() for t in targets])
        self.resampled_tangent = interpolate([t['T'].tolist() for t in targets])
        self.resampled_left = interpolate([t['L'].tolist() for t in targets])
        # The final d is sampled after NRecoverCurve2DSystem's t/l interpolation.
        # At these same nodes its values agree with the continuous frame values.
        directors = []
        for s in nodes:
            f = self.finite_point(s)
            t, _ = self.resampled_tangent.evaluate(s); l, _ = self.resampled_left.evaluate(s)
            directors.append((q['sigma']*(f['p'].value*np.asarray(t)+f['q'].value*np.asarray(l))).tolist())
        self.resampled_director = interpolate(directors)
        self.resampling = {'function': 'FunctionInterpolationAlt', 'definitionCell': 'In[124]',
            'options': {'Resample': True, 'InterpolationPoints': q['interpolationPoints'], 'InterpolationOrder': order},
            'method': 'inclusive-uniform/componentwise-piecewise-linear' if order==1 else 'inclusive-uniform/componentwise-local-polynomial',
            'derivativeConvention': 'right-at-interior-knots/left-at-end',
            'explicitUniformLinearSubsetReproduced': order==1,
            'underlyingAdaptiveInterpolationReproduced': False, 'defaultInterpolationReproduced': False,
            'stages': ['recovered-base', 'recovered-tangent', 'recovered-left-normal', 'final-director'],
            'parameters': nodes, 'normalizedBase': self.resampled_base.values,
            'tangent': self.resampled_tangent.values, 'leftNormal': self.resampled_left.values,
            'normalizedDirector': self.resampled_director.values}
        if order>1:
            jumps=[]
            for interpolator in (self.resampled_base,self.resampled_director,self.resampled_tangent,self.resampled_left):
                jumps.append(max((max(abs(a-b) for a,b in zip(interpolator.evaluate(s,'left')[1],interpolator.evaluate(s,'right')[1]))
                                  for s in nodes[1:-1]),default=0.))
            self.resampling['polynomial']={'degree':order,'stencil':'cell-floor(order/2)/clamped/order+1-consecutive-nodes',
                'continuity':'C0/first-derivative-continuity-not-guaranteed',
                'normalizedBaseDerivativeJump':jumps[0],'normalizedDirectorDerivativeJump':jumps[1],
                'frameDerivativeJump':max(jumps[2:]),'auditedKnotSides':2*(len(nodes)-2),
                'wolframDefaultAlgorithmReproduced':False,'originalAutomaticPointsReproduced':False}
        actual = self.target(self.ui, self.finite_point(self.ui))
        self.resampling['initialNormalizedPointResidual'] = float(np.max(np.abs(actual['b'])))
        self.resampling['initialTangentResidual'] = float(np.max(np.abs(actual['T']-self.initial_tangent)))

    def target(self, s, point, side='right'):
        if getattr(self, 'resampling', None) is None: return self.continuous_target(s, point)
        evaluate=lambda interpolator:interpolator.evaluate(s,side) if self.query['interpolationOrder']>1 else interpolator.evaluate(s)
        b, bp = evaluate(self.resampled_base)
        d, dp = evaluate(self.resampled_director)
        t, _ = evaluate(self.resampled_tangent); l, _ = evaluate(self.resampled_left)
        return {'b': np.asarray(b), 'd': np.asarray(d), 'bp': np.asarray(bp), 'dp': np.asarray(dp),
                'T': np.asarray(t), 'L': np.asarray(l), 'U': None}

    def domain(self):
        stack = [(self.query['parameterStart'], self.query['parameterEnd'], 0)]
        cells, unresolved = [], []
        evaluations = 0
        w = Interval(self.query['transverseStart'], self.query['transverseEnd'])
        while stack:
            left, right, depth = stack.pop()
            evaluations += 1
            if evaluations > CERTIFICATION_BUDGET:
                unresolved.extend([[left, right]]+[[a, b] for a, b, _ in stack])
                break
            try:
                f = self.point(Interval(left, right))
                bounds = [Interval.cast(f[k].value).lo for k in ('v', 'transverse', 'directorLength')]
                if min(bounds) <= 0: raise ValueError('source frame interval unresolved')
                # Evaluate ALL original scalar RHSs even after an algebraic
                # zero proof, so identities never cancel a source pole.
                if self.kn: self.kn(Taylor.variable(Interval(left, right), 1))
                # This source-frame projection equals the literal p/q/g
                # affine Jacobian, including for nondevelopable sources.
                # Keep direct source cancellation (e.g. a constant ruling)
                # rather than subtracting dependent broad p'/q' hulls.
                ds = [a+b*w for a, b in zip(f['bp'], f['dp'])]
                jac = Interval.cast(dot(cross(ds, f['d']), f['U']).value)
                if not all(math.isfinite(x) for x in (jac.lo, jac.hi)):
                    raise ValueError('nonfinite strip hull')
                cells.append({'start': left, 'end': right, 'speedLowerBound': bounds[0],
                              'transverseLowerBound': bounds[1], 'directorLengthLowerBound': bounds[2],
                              'normalizedJacobianBounds': [jac.lo, jac.hi]})
            except (ValueError, ZeroDivisionError, OverflowError):
                self.finite_point((left+right)/2)
                if depth >= 18 or right-left <= 1e-9:
                    unresolved.append([left, right])
                else:
                    middle = (left+right)/2
                    stack.extend([(middle, right, depth+1), (left, middle, depth+1)])
        # Source regularity and sufficient strip regularity have independent
        # outcomes. Refine an already verified source cell only to tighten
        # its projected Jacobian. If this budget fails, keep that valid parent
        # source certificate, rather than inventing an uncovered source gap.
        def tighten(cell, depth):
            nonlocal evaluations
            lo, hi = cell['normalizedJacobianBounds']
            if lo > 0 or hi < 0 or depth >= 12 or evaluations+2 > CERTIFICATION_BUDGET:
                return [cell]
            left, right = cell['start'], cell['end']
            middle = (left+right)/2
            f = self.finite_point(middle)
            bp, d, dp, u = [values(f[k]) for k in ('bp', 'd', 'dp', 'U')]
            ends = [float(np.cross(bp+x*dp, d)@u) for x in (w.lo, w.hi)]
            if min(ends) <= 0 <= max(ends): return [cell]
            children = []
            try:
                for a, b in [(left, middle), (middle, right)]:
                    evaluations += 1
                    f = self.point(Interval(a, b))
                    bounds = [Interval.cast(f[k].value).lo for k in ('v', 'transverse', 'directorLength')]
                    ds = [x+y*w for x, y in zip(f['bp'], f['dp'])]
                    jac = Interval.cast(dot(cross(ds, f['d']), f['U']).value)
                    if min(bounds) <= 0 or not math.isfinite(jac.lo+jac.hi):
                        return [cell]
                    children.append({'start': a, 'end': b, 'speedLowerBound': bounds[0],
                                     'transverseLowerBound': bounds[1], 'directorLengthLowerBound': bounds[2],
                                     'normalizedJacobianBounds': [jac.lo, jac.hi]})
            except (ValueError, ZeroDivisionError, OverflowError): return [cell]
            return [c for child in children for c in tighten(child, depth+1)]
        cells = [child for cell in cells for child in tighten(cell, 0)]
        cells.sort(key=lambda c: c['start']); unresolved.sort()
        certified = not unresolved
        def lower(key): return min(c[key] for c in cells) if certified and cells else None
        orientation = 1 if certified and all(c['normalizedJacobianBounds'][0] > 0 for c in cells) else -1 if certified and all(c['normalizedJacobianBounds'][1] < 0 for c in cells) else None
        strip_good = orientation is not None
        strip = {'status': 'verified' if strip_good else 'unknown', 'orientation': orientation if strip_good else None,
                 'minimumAbsoluteJacobianLowerBound': min((c['normalizedJacobianBounds'][0] if orientation == 1 else -c['normalizedJacobianBounds'][1]) for c in cells) if strip_good else None,
                 'reason': None if strip_good else 'source interval hull does not certify the complete transverse strip; original domain retained'}
        return {'certified': certified, 'evaluations': min(evaluations, CERTIFICATION_BUDGET+1),
                'verifiedCells': len(cells), 'cells': cells, 'unresolved': unresolved,
                'minimumSpeedLowerBound': lower('speedLowerBound'), 'minimumTransverseLowerBound': lower('transverseLowerBound'),
                'minimumDirectorLengthLowerBound': lower('directorLengthLowerBound'), 'roundingModel': ROUNDING,
                'reason': None if certified else 'source interval subdivision budget unresolved; original domain retained',
                'formalStripRegularity': strip}

    def row(self, s, point=None, target=None):
        f = self.finite_point(float(s)) if point is None else point
        target = self.target(float(s), f) if target is None else target
        result = {'s': float(s)}
        for side, data, origin in [('Source', {k: values(f[k]) for k in ('b', 'd', 'bp', 'dp')}, self.source_origin),
                                   ('Target', target, self.target_origin)]:
            for suffix, key in [('Base', 'b'), ('Director', 'd'), ('BaseDerivative', 'bp'), ('DirectorDerivative', 'dp')]:
                norm = np.asarray(data[key])
                world = norm*self.scale+(origin if key == 'b' else 0)
                result[side.lower()+suffix] = world.tolist()
                result['normalized'+side+suffix] = norm.tolist()
        result.update(targetTangent=target['T'].tolist(), targetLeftNormal=target['L'].tolist(),
                      targetNormal=None if self.flatten else target['U'].tolist())
        coefficient = {}
        for key, value in [('speed', f['v'].value), ('p', f['p'].value), ('q', f['q'].value),
                           ('pPrime', f['p'].c[1]), ('qPrime', f['q'].c[1])]:
            coefficient[key] = float(value*self.scale)
            coefficient['normalized'+key[0].upper()+key[1:]] = float(value)
        coefficient.update({key: float(f[key].value) for key in ('g', 'h', 'z')})
        result['coefficients'] = coefficient
        return result


def query_generic_darboux(data, expected_family=None):
    query = validate_generic_darboux_query(data, expected_family)
    try:
        kernel = DarbouxKernel(query)
        domain = kernel.domain()
        kernel.integrate()
        kernel.prepare_resampling()
        return _result(kernel, domain)
    except GenericDarbouxError: raise
    except (ValueError, ZeroDivisionError, OverflowError) as exc:
        raise GenericDarbouxError('source-domain', '原输入无法在有限实数域完成通用Darboux恢复。') from exc


def initial_frame_compatibility(basis):
    """Numerical Gram compatibility of raw initial values; never normalize them.

    This is a roundoff-level premise of the formal orthonormal-frame identity,
    separate from the wider user-input tolerance and finite metric residuals.
    """
    frame = np.column_stack(basis)
    residual = float(np.max(np.abs(frame.T@frame-np.eye(frame.shape[1]))))
    tolerance = 64*np.finfo(float).eps
    return {'frameGramResidual': residual, 'frameCompatibilityTolerance': float(tolerance),
            'frameCompatible': bool(residual <= tolerance)}


def _result(kernel, domain):
    query = kernel.query
    transverse = np.linspace(query['transverseStart'], query['transverseEnd'], query['rulingSegments']+1)
    audit_transverse = list(transverse)
    midpoint = (query['transverseStart']+query['transverseEnd'])/2
    if midpoint not in audit_transverse: audit_transverse.append(midpoint)
    sample, grid = [], []
    maximum_metric = maximum_frame = maximum_develop = maximum_target_develop = 0.
    strip_degenerate = False

    def inspect(s, point, target):
        nonlocal maximum_metric, maximum_frame, maximum_develop, maximum_target_develop, strip_degenerate
        bp, d, dp = [values(point[key]) for key in ('bp', 'd', 'dp')]
        bpt, dt, dpt = [target[key] for key in ('bp', 'd', 'dp')]
        u = values(point['U'])
        develop = abs(float(u@dp))/max(float(np.linalg.norm(d)), float(np.linalg.norm(dp)), np.finfo(float).tiny)
        maximum_develop = max(maximum_develop, develop)
        frame = np.column_stack((target['T'], target['L'])) if kernel.flatten else np.column_stack((target['T'], target['L'], target['U']))
        maximum_frame = max(maximum_frame, float(np.max(np.abs(frame.T@frame-np.eye(kernel.dimension)))))
        if not kernel.flatten:
            td = abs(float(np.cross(bpt, dt)@dpt))/max(float(np.linalg.norm(bpt)*np.linalg.norm(dt)*max(np.linalg.norm(dpt), np.linalg.norm(dt))), np.finfo(float).tiny)
            maximum_target_develop = max(maximum_target_develop, td)
        coefficients = [point[k].value for k in ('v', 'p', 'q', 'g')]
        v, p, q, g = coefficients
        pp, qp = point['p'].c[1], point['q'].c[1]
        j0 = query['sigma']*v*q
        j1 = q*pp-p*qp-g*(p*p+q*q)
        js = [j0+w*j1 for w in (query['transverseStart'], query['transverseEnd'])]
        if min(js) <= 0 <= max(js): strip_degenerate = True
        source_metrics, target_metrics = [], []
        for index, w in enumerate(audit_transverse):
            a, b = bp+w*dp, bpt+w*dpt
            mf, mt = np.asarray([a@a, a@d, d@d]), np.asarray([b@b, b@dt, dt@dt])
            maximum_metric = max(maximum_metric, float(np.max(np.abs(mf-mt))/max(np.max(np.abs(mf)), np.max(np.abs(mt)), np.finfo(float).tiny)))
            if index < len(transverse):
                source_metrics.append(mf.tolist()); target_metrics.append(mt.tolist())
        return source_metrics, target_metrics

    if kernel.resampling is not None and query['interpolationOrder']>1:
        for s in kernel.resampling['parameters'][1:-1]:
            f=kernel.finite_point(s)
            for side in ('left','right'):inspect(s,f,kernel.target(s,f,side))
    for s in np.linspace(query['parameterStart'], query['parameterEnd'], 129):
        f = kernel.finite_point(float(s)); t = kernel.target(float(s), f)
        inspect(float(s), f, t)
    for s in np.linspace(query['parameterStart'], query['parameterEnd'], query['segments']+1):
        f = kernel.finite_point(float(s)); t = kernel.target(float(s), f)
        sample.append(kernel.row(float(s), f, t))
        mf, mt = inspect(float(s), f, t)
        bs, ds = values(f['b']), values(f['d'])
        ns = [(bs+w*ds).tolist() for w in transverse]
        nt = [(t['b']+w*t['d']).tolist() for w in transverse]
        grid.append({'s': float(s), 'source': [(np.asarray(x)*kernel.scale+kernel.source_origin).tolist() for x in ns],
                     'target': [(np.asarray(x)*kernel.scale+kernel.target_origin).tolist() for x in nt],
                     'normalizedSource': ns, 'normalizedTarget': nt, 'sourceEFG': mf, 'targetEFG': mt})
    if strip_degenerate:
        domain['formalStripRegularity'] = {'status': 'degenerate', 'orientation': None, 'minimumAbsoluteJacobianLowerBound': None,
                                          'reason': 'literal affine strip Jacobian reaches zero at a finite source parameter; full transverse domain retained'}
    finite_develop = maximum_develop <= DEVELOPABILITY_TOLERANCE
    status = 'analytic' if kernel.analytic else 'incompatible' if not finite_develop else 'numerical' if domain['certified'] else 'unknown'
    source_develop = {'status': status, 'method': 'bounded-safe-symbolic-triple-product' if kernel.analytic else 'finite-Taylor-normal-component',
                      'analyticIdentity': kernel.analytic, 'tolerance': DEVELOPABILITY_TOLERANCE, 'maximumRelativeResidual': maximum_develop}
    f = kernel.finite_point(kernel.ui); target = kernel.target(kernel.ui, f)
    computed = target['d']*kernel.scale
    requested = None if kernel.flatten else np.asarray(query['initialDirector'])
    residual = None if requested is None else float(np.max(np.abs(computed-requested)))
    normalized_residual = None if residual is None else residual/kernel.scale
    director_compatible = None if requested is None else bool(normalized_residual <= 2e-9*max(np.linalg.norm(target['d']), np.linalg.norm(requested/kernel.scale)))
    frame = initial_frame_compatibility([kernel.initial_tangent, kernel.initial_left] +
                                        ([] if kernel.flatten else [kernel.initial_normal]))
    if not frame['frameCompatible']:
        domain['formalStripRegularity'] = {'status': 'unknown', 'orientation': None,
            'minimumAbsoluteJacobianLowerBound': None,
            'reason': 'raw initial orthonormal-frame compatibility not verified at roundoff scale'}
    initial = {'parameter': kernel.ui, 'point': list(query['initialPoint']), 'tangent': list(query['initialTangent']),
               'requestedDirector': None if requested is None else requested.tolist(), 'computedDirector': computed.tolist(),
               'computedNormal': None if kernel.flatten else target['U'].tolist(), 'normalizedComputedDirector': target['d'].tolist(),
               'directorResidual': residual, 'normalizedDirectorResidual': normalized_residual, 'directorCompatible': director_compatible,
               **frame}
    integration = {'method': 'DOP853', 'relativeTolerance': RTOL, 'absoluteTolerance': ATOL, 'initialParameter': kernel.ui,
                   'backwardEvaluations': 0 if kernel.backward is None else int(kernel.backward.nfev),
                   'forwardEvaluations': 0 if kernel.forward is None else int(kernel.forward.nfev),
                   'integrationErrorIntervalCertified': False}
    if 'ndsolveOptions' in query:
        integration['stepOptions']={'optionSource':'Options[NDSolve]/FilterRules/recovery',
            'definitionCell':'In[3640]' if kernel.flatten else 'In[3815]',
            'options':query['ndsolveOptions'],'effectiveMaxStepSize':query['ndsolveOptions'].get('MaxStepSize',(query['parameterEnd']-query['parameterStart'])/32),
            'backwardSteps':0 if kernel.backward is None else len(kernel.backward.t)-1,
            'forwardSteps':0 if kernel.forward is None else len(kernel.forward.t)-1,
            'backwardParameters':[kernel.ui] if kernel.backward is None else kernel.backward.t.tolist(),
            'forwardParameters':[kernel.ui] if kernel.forward is None else kernel.forward.t.tolist(),
            'counting':'accepted-DOP853-steps/shared-backward-forward',
            'rhsEvaluationBudget':INTEGRATION_BUDGET,'sourceInputsPreserved':True,
            'originalAutomaticDefaultsReproduced':False,'wolframStepControllerReproduced':False,
            'workingPrecisionReproduced':False,'errorGoalNormReproduced':False}
    if kernel.resampling is not None:
        domain['formalStripRegularity'] = {'status': 'unknown', 'orientation': None,
            'minimumAbsoluteJacobianLowerBound': None,
            'reason': 'uniformly resampled output has no interval strip-regularity certificate'}
    formal_strip = domain['formalStripRegularity']['status'] == 'verified'
    source = {'functions': ['FlattenGeneric2D', 'NFlattenGeneric2D'] if kernel.flatten else ['ReshapeGeneric3D', 'NReshapeGeneric3D'],
              'definitionCells': ['In[3882]', 'In[3885]'] if kernel.flatten else ['In[3890]', 'In[3895]'],
              'method': 'whitelist-AST/Taylor/Darboux/DOP853',
              'initialArgumentOrder': ['ui', 'bi', 'ti'] if kernel.flatten else ['ui', 'bbi', 'ddi', 'tti'],
              'directorNormalized': False, 'interpolationReproduced': False, 'symbolicSolverReproduced': False,
              'wolframOptionsReproduced': False, 'metricConvention': 'normalized-s/world-w'}
    result = {'family': RESULT_FAMILY, 'query': query, 'source': source,
              'normalization': {'sourceOrigin': kernel.source_origin.tolist(), 'targetOrigin': kernel.target_origin.tolist(), 'scale': kernel.scale},
              'initial': initial, 'diagnostics': {'validationNodes': 129, 'maximumRelativeMetricDifference': maximum_metric,
              'maximumFrameResidual': maximum_frame, 'maximumRelativeSourceDevelopabilityResidual': maximum_develop,
              'maximumTargetDevelopabilityResidual': maximum_target_develop, 'metricTolerance': METRIC_TOLERANCE,
              'sourceDevelopability': source_develop, 'integration': integration},
              'certification': {'finiteMetricVerified': maximum_metric <= METRIC_TOLERANCE,
                  'finiteSourceDevelopabilityVerified': finite_develop, 'sourceDevelopabilityAnalytic': kernel.analytic,
                  'sourceRegularityCertified': domain['certified'], 'formalStripRegularityCertified': formal_strip,
                  'initialFrameCompatible': frame['frameCompatible'],
                  'formalIsometryCertified': kernel.resampling is None and kernel.analytic and domain['certified'] and frame['frameCompatible'], 'integrationErrorIntervalCertified': False,
                  'globalInjectivityChecked': False, 'selfCollisionChecked': False, 'exactStraightCreaseFOLD': False,
                  'adoptableCreasePattern': False}, 'domain': domain, 'sample': {'rows': sample}, 'grid': grid}
    if kernel.resampling is not None: result['resampling'] = kernel.resampling
    return result


def query_flatten_generic(data): return query_generic_darboux(data, FLATTEN_FAMILY)
def query_reshape_generic(data): return query_generic_darboux(data, RESHAPE_FAMILY)
