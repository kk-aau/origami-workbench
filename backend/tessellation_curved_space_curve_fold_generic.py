"""Original FoldSpaceCurve3D / NSpaceCurveFold3D, four scalar sources.

The supplied spatial curve is never recovered or replaced. Its literal
Frenet/sign/absolute-value construction produces the two rulings. The planar
view explicitly uses the In[3966] wrapper's NFlattenFold2D initial conditions.
"""
import math
from functools import lru_cache
import numpy as np

from tessellation_curved_generic_darboux import (
    DarbouxKernel, GenericDarbouxError, IntervalTaylor, Taylor, Expression, dot, cross,
    values, magnitude, times, ROUNDING, DEVELOPABILITY_TOLERANCE,
)
from tessellation_curved_fold_flatten_generic import FoldFlattenKernel, _result as flattened_result
from tessellation_curved_linked_common_interval import Interval

FAMILY = 'space-curve-fold-generic-native'
RESULT_FAMILY = 'origamica-generic-space-curve-fold'
CERTIFICATION_BUDGET = 1023
PRESET = {'family': FAMILY, 'foldCurve': ['sin(s)', 's**2/4', '1-cos(s)'],
          'foldAngle': '-2*atan(sqrt(4+s**2))', 'orientation': 1,
          'parameterStart': 0., 'parameterEnd': 1., 'transverseStart': 0., 'transverseEnd': .15,
          'segments': 32, 'rulingSegments': 16}


class SpaceCurveFoldError(GenericDarbouxError):
    pass


def validate_space_curve_fold_generic_query(data):
    if not isinstance(data, dict) or set(data)-set(PRESET):
        raise SpaceCurveFoldError('input-contract', '四源空间曲折须为仅含原合同字段的对象。')
    q = {**PRESET, **data}
    if q['family'] != FAMILY: raise SpaceCurveFoldError('input-contract', '四源空间曲折类型无效。')
    if not isinstance(q['foldCurve'], list) or len(q['foldCurve']) != 3:
        raise SpaceCurveFoldError('input-contract', 'ff须有三个安全标量表达式。')
    for source in q['foldCurve']: Expression(source, 's')
    q['foldCurve'] = list(q['foldCurve']); Expression(q['foldAngle'], 's')
    if type(q['orientation']) is not int or q['orientation'] not in (-1, 1):
        raise SpaceCurveFoldError('input-contract', '原ς须为固定整数−1或+1。')
    for key in ('parameterStart', 'parameterEnd', 'transverseStart', 'transverseEnd'):
        x = q[key]
        if type(x) not in (int, float) or not math.isfinite(x):
            raise SpaceCurveFoldError('input-contract', '原s/w端点须为有限实数。')
        q[key] = float(x)
    a, b = q['parameterStart'], q['parameterEnd']
    if not -10 <= a < b <= 10 or not .01 <= b-a <= 12:
        raise SpaceCurveFoldError('input-contract', 's域须在−10…10内且长度0.01–12。')
    if not -1e6 <= q['transverseStart'] < q['transverseEnd'] <= 1e6:
        raise SpaceCurveFoldError('input-contract', '横向域须递增且位于−10⁶…10⁶内。')
    for key, lo, hi in [('segments', 8, 128), ('rulingSegments', 2, 64)]:
        if type(q[key]) is not int or not lo <= q[key] <= hi:
            raise SpaceCurveFoldError('input-contract', '显示密度超出有限预算。')
    return q


def lower_abs(value):
    x = Interval.cast(value)
    return min(abs(x.lo), abs(x.hi)) if not x.lo <= 0 <= x.hi else 0.
def sign_of(value):
    x = Interval.cast(value)
    if x.lo > 0: return 1
    if x.hi < 0: return -1
    raise ValueError('original ruling sign projection crosses zero')


class PlanarRecovery(DarbouxKernel):
    """Reuse the checked 2D ODE, with literal four-source coefficient jets."""
    def __init__(self, owner, side):
        self.owner, self.side = owner, side
        self.query = {**owner.query, 'sigma': 1}
        self.ui, self.scale = owner.ui, owner.scale
        self.flatten, self.dimension, self.analytic = True, 2, True
        self.source_origin, self.target_origin = owner.source_origin, np.asarray([1., 0.])
        self.initial_tangent, self.initial_left, self.initial_normal = np.asarray([0., 1.]), np.asarray([-1., 0.]), None
        self.initial_state = np.asarray([0., 0., 0., 1., -1., 0.])
        self.forward = self.backward = None; self.integration_calls = 0

    def finite_point(self, s): return self.owner.finite(float(s))[0 if self.side == 'left' else 1]


class SpaceCurveFoldKernel:
    def __init__(self, q):
        self.original_query = q
        self.query = {**q, 'initialParameter': q['parameterStart'], 'initialPoint': [1., 0.], 'initialTangent': [0., 1.]}
        self.ui = q['parameterStart']
        self.curve = [Expression(source, 's') for source in q['foldCurve']]
        self.angle = Expression(q['foldAngle'], 's')
        self.parts = [f.affine_parts(Taylor.variable(self.ui, 4)) for f in self.curve]
        self.source_origin = np.asarray([math.fsum(offset)+dynamic.value for offset, dynamic in self.parts])
        speeds = []
        for s in np.linspace(q['parameterStart'], q['parameterEnd'], 9):
            jets = [f.affine_parts(Taylor.variable(float(s), 1))[1] for f in self.curve]
            speeds.append(math.hypot(*(x.c[1] for x in jets)))
        self.scale = max(speeds)*(q['parameterEnd']-q['parameterStart'])
        if not math.isfinite(self.scale) or self.scale <= 0:
            raise SpaceCurveFoldError('source-speed', '原ff速度为零或无法数值归一化。')
        self.left, self.right = PlanarRecovery(self, 'left'), PlanarRecovery(self, 'right')
        self.shared_analytic = True
        self.finite(self.ui)

    def points(self, argument):
        s = (IntervalTaylor if isinstance(argument, Interval) else Taylor).variable(argument, 4)
        b = []
        for f, (origin_offset, origin_dynamic) in zip(self.curve, self.parts):
            offset, dynamic = f.affine_parts(s); delta = math.fsum(offset+[-x for x in origin_offset])
            b.append((dynamic-origin_dynamic.value+delta)/self.scale)
        bp = [x.derivative() for x in b]; v = magnitude(bp); t = times(bp, 1/v); tp = [x.derivative() for x in t]
        turning = magnitude(tp); curvature = turning/v; n = times(tp, 1/turning); bb = cross(t, n)
        torsion = -dot(n, [x.derivative() for x in bb])/v
        gamma = self.angle(s)
        if not isinstance(argument, Interval) and gamma.value == math.tau*round(gamma.value/math.tau):
            raise SpaceCurveFoldError('ruling-sign-zero', '原sin(γ/2)=0使Sign/Abs母线退化；当前正则四源入口不代入该极限。')
        sn, cs = (gamma/2).sincos(); orientation = self.query['orientation']
        common = {'b': b, 'bp': bp, 'v': v, 'T': t, 'N': n, 'B': bb, 'curvature': curvature,
                  'torsion': torsion, 'gamma': gamma}
        result = []
        for side, sine, cos_sign, qsign in [('left', sn, -1, 1), ('right', -sn, 1, -1)]:
            l = times([cs*x+sine*y for x, y in zip(n, bb)], orientation)
            u = times([-sine*x+cs*y for x, y in zip(n, bb)], orientation)
            up = [x.derivative() for x in u]; h = magnitude(up)
            a, beta = dot(up, t), dot(up, l); sign = sign_of(a.value)
            cosine = cos_sign*sign*beta/h; positive_sine = sign*a/h
            # q encodes the final original right minus, not an artificial
            # change of the user's varsigma or gamma convention.
            p, q = cosine/self.scale, qsign*positive_sine/self.scale
            d = [p*x+q*y for x, y in zip(t, l)]; dp = [x.derivative() for x in d]
            g = dot(l, tp)
            result.append({**common, 'd': d, 'dp': dp, 'L': l, 'U': u, 'p': p, 'q': q, 'g': g,
                           'h': g*0, 'z': g*0, 'normalDerivativeLength': h,
                           'normalTangentProjection': a, 'normalLeftProjection': beta})
        return tuple(result)

    @lru_cache(maxsize=8192)
    def finite(self, s):
        try: return self.points(float(s))
        except SpaceCurveFoldError: raise
        except (ValueError, ZeroDivisionError, OverflowError) as exc:
            raise SpaceCurveFoldError('source-singularity', '原ff、Frenet曲率、U′或Sign投影在真实求值点退化；不改源曲线。') from exc

    target = FoldFlattenKernel.target
    jacobians = FoldFlattenKernel.jacobians

    def cell(self, start, end):
        left, right = self.points(Interval(start, end))
        fields = [('speedLowerBound', left['v'].value), ('curvatureLowerBound', left['curvature'].value),
                  ('leftNormalDerivativeLowerBound', left['normalDerivativeLength'].value),
                  ('rightNormalDerivativeLowerBound', right['normalDerivativeLength'].value)]
        output = {key: Interval.cast(value).lo for key, value in fields}
        output.update(leftSignProjectionLowerBound=lower_abs(left['normalTangentProjection'].value),
                      rightSignProjectionLowerBound=lower_abs(right['normalTangentProjection'].value))
        if min(output.values()) <= 0: raise ValueError('original frame/sign branch not enclosed')
        js = self.jacobians(left, right, Interval(self.query['transverseStart'], self.query['transverseEnd']))
        if not all(math.isfinite(j.lo+j.hi) for j in js.values()): raise ValueError('nonfinite strip interval')
        return {'start': start, 'end': end, **output, 'leftSign': sign_of(left['normalTangentProjection'].value),
                'rightSign': sign_of(right['normalTangentProjection'].value),
                **{key+'NormalizedJacobianBounds': [j.lo, j.hi] for key, j in js.items()}}

    def domain(self):
        q = self.query; stack = [(q['parameterStart'], q['parameterEnd'], 0)]
        cells, unresolved, evaluations = [], [], 0
        labels = ['sourceLeft', 'sourceRight', 'formalLeft', 'formalRight']
        while stack:
            a, b, depth = stack.pop(); evaluations += 1
            if evaluations > CERTIFICATION_BUDGET:
                unresolved.extend([[a, b]]+[[x, y] for x, y, _ in stack]); break
            try:
                cell = self.cell(a, b)
                uncertain = [label for label in labels if cell[label+'NormalizedJacobianBounds'][0] <= 0 <= cell[label+'NormalizedJacobianBounds'][1]]
                if uncertain and depth < 10 and evaluations+len(stack)+2 < CERTIFICATION_BUDGET:
                    l, r = self.finite((a+b)/2)
                    ends = [self.jacobians(l, r, w) for w in (q['transverseStart'], q['transverseEnd'])]
                    if any(not min(j[label].lo for j in ends) <= 0 <= max(j[label].hi for j in ends) for label in uncertain):
                        middle = (a+b)/2; stack.extend([(middle, b, depth+1), (a, middle, depth+1)]); continue
                cells.append(cell)
            except (ValueError, ZeroDivisionError, OverflowError):
                self.finite((a+b)/2)
                if depth >= 18 or b-a <= 1e-9: unresolved.append([a, b])
                else:
                    middle = (a+b)/2; stack.extend([(middle, b, depth+1), (a, middle, depth+1)])
        cells.sort(key=lambda c:c['start']); unresolved.sort(); certified = not unresolved
        def strip(label):
            intervals = [Interval(*c[label+'NormalizedJacobianBounds']) for c in cells]
            signs = {1 if j.lo > 0 else -1 if j.hi < 0 else 0 for j in intervals}
            valid = certified and len(signs) == 1 and 0 not in signs
            return {'status': 'verified' if valid else 'unknown', 'orientation': next(iter(signs)) if valid else None,
                    'minimumAbsoluteJacobianLowerBound': min(lower_abs(j) for j in intervals) if valid else None,
                    'reason': None if valid else 'original strip interval unresolved; full width retained'}
        fields = ['Speed', 'Curvature', 'LeftNormalDerivative', 'RightNormalDerivative', 'LeftSignProjection', 'RightSignProjection']
        return {'certified': certified, 'evaluations': evaluations, 'verifiedCells': len(cells), 'cells': cells, 'unresolved': unresolved,
                **{'minimum'+key+'LowerBound': min(c[key[0].lower()+key[1:]+'LowerBound'] for c in cells) if certified else None for key in fields},
                'roundingModel': ROUNDING, 'reason': None if certified else 'interval subdivision budget exhausted; original domain retained',
                'sourceStripRegularity': {side: strip('source'+side.title()) for side in ('left', 'right')},
                'formalStripRegularity': {side: strip('formal'+side.title()) for side in ('left', 'right')}}

    def row(self, s, left, right, target):
        row = FoldFlattenKernel.row(self, s, left, right, target)
        row.update(foldAngleRad=left['gamma'].value, foldAngleDerivative=left['gamma'].c[1])
        for key, frame in [('sourceTangent', 'T'), ('sourceNormal', 'N'), ('sourceBinormal', 'B')]:
            row[key] = values(left[frame]).tolist()
        for side, data in [('Left', left), ('Right', right)]:
            row['source'+side+'Normal'] = values(data['L']).tolist()
            row['source'+side+'SurfaceNormal'] = values(data['U']).tolist()
        row['coefficients'].update(curvature=left['curvature'].value/self.scale,
                                   normalizedCurvature=left['curvature'].value, torsion=left['torsion'].value/self.scale,
                                   normalizedTorsion=left['torsion'].value, g=left['g'].value)
        for side, data in [('left', left), ('right', right)]:
            coefficients = row['coefficients'][side]; coefficients.pop('g')
            for key in ('normalDerivativeLength', 'normalTangentProjection', 'normalLeftProjection'):
                coefficients[key] = data[key].value
        return row


def query_space_curve_fold_generic(data):
    q = validate_space_curve_fold_generic_query(data)
    try:
        kernel = SpaceCurveFoldKernel(q); domain = kernel.domain(); kernel.left.integrate()
        result = flattened_result(kernel, domain)
        result['family'], result['query'] = RESULT_FAMILY, q
        result['source'] = {'functions': ['FoldSpaceCurve3D', 'NSpaceCurveFold3D'], 'definitionCells': ['In[3939]', 'In[3942]'],
            'method': 'whitelist-AST/fourth-order-Frenet/original-sign-abs-rulings/planar-DOP853',
            'argumentOrder': ['ff', 'gamma', 'varsigma'],
            'rulingConstruction': 'literal Sign/Abs(Uprime dot T, Uprime dot L)/norm(Uprime), no extra ruling normalization',
            'flatteningFunctions': ['NFlattenFold2D'], 'flatteningDefinitionCells': ['In[3935]'],
            'flatteningInitialSource': 'NCurvedFoldHelix2D/In[3966]: {u0,{1,0},{0,1}}; explicit generic view extension',
            'interpolationReproduced': False, 'symbolicSolverReproduced': False, 'wolframOptionsReproduced': False,
            'metricConvention': 'normalized-s/world-w'}
        result['initial'] = {'parameter': kernel.ui, 'point': [1., 0.], 'tangent': [0., 1.], 'argumentOrder': ['ui', 'fi', 'ti']}
        old = result['diagnostics']; frame = old['maximumFrameResidual']; unit = 0.
        metric = {'left': 0., 'right': 0.}
        nodes = sorted(set(np.linspace(q['parameterStart'], q['parameterEnd'], 129)) |
                       set(np.linspace(q['parameterStart'], q['parameterEnd'], q['segments']+1)))
        audit_widths = sorted(set(np.linspace(q['transverseStart'], q['transverseEnd'], q['rulingSegments']+1)) |
                              {(q['transverseStart']+q['transverseEnd'])/2})
        for s in nodes:
            left, right = kernel.finite(float(s)); target = kernel.target(float(s), left, right)
            basis = np.column_stack([values(left[k]) for k in ('T', 'N', 'B')])
            frame = max(frame, float(np.max(np.abs(basis.T@basis-np.eye(3)))))
            unit = max(unit, *(abs(float(np.linalg.norm(values(p['d'])))*kernel.scale-1) for p in (left, right)))
            for side, source in [('left', left), ('right', right)]:
                bp, d, dp = [values(source[key]) for key in ('bp', 'd', 'dp')]
                recovered = target[side]
                for w in audit_widths:
                    ds, dt = bp+w*dp, recovered['bp']+w*recovered['dp']
                    sm = np.asarray([ds@ds, ds@d, d@d])
                    tm = np.asarray([dt@dt, dt@recovered['d'], recovered['d']@recovered['d']])
                    e, g = max(sm[0], tm[0]), max(sm[2], tm[2])
                    denominator = np.maximum([e, math.sqrt(e)*math.sqrt(g), g], np.finfo(float).tiny)
                    metric[side] = max(metric[side], float(np.max(np.abs(sm-tm)/denominator)))
        integration = dict(old['integration']); integration.pop('backwardEvaluations')
        result['diagnostics'] = {'validationNodes': 129, 'maximumFrameResidual': frame, 'maximumUnitRulingResidual': unit,
            'maximumLeftRelativeMetricDifference': metric['left'],
            'maximumRightRelativeMetricDifference': metric['right'],
            'maximumLeftRelativeDevelopabilityResidual': old['leftSourceDevelopability']['maximumRelativeResidual'],
            'maximumRightRelativeDevelopabilityResidual': old['rightSourceDevelopability']['maximumRelativeResidual'],
            'maximumSharedGeodesicCurvatureResidual': old['sharedGeodesicCurvature']['maximumRelativeResidual'],
            'metricTolerance': old['metricTolerance'], 'developabilityTolerance': DEVELOPABILITY_TOLERANCE, 'integration': integration}
        cert = result['certification']
        result['certification'] = {key: cert[key] for key in ['finiteLeftMetricVerified', 'finiteRightMetricVerified',
            'sourceRegularityCertified', 'sourceLeftStripRegularityCertified', 'sourceRightStripRegularityCertified',
            'formalLeftStripRegularityCertified', 'formalRightStripRegularityCertified', 'formalCommonFlatteningCertified',
            'integrationErrorIntervalCertified', 'globalInjectivityChecked', 'selfCollisionChecked', 'exactStraightCreaseFOLD', 'adoptableCreasePattern']}
        result['certification'].update(finiteDevelopabilityVerified=cert['finiteSourceDevelopabilityVerified'],
            finiteSharedGeodesicCurvatureVerified=cert['finiteSharedGeodesicCurvatureVerified'],
            finiteUnitRulingsVerified=unit <= DEVELOPABILITY_TOLERANCE, unitRulingsAnalytic=domain['certified'])
        for side in ('left', 'right'):
            result['certification']['finite'+side.title()+'MetricVerified'] = metric[side] <= old['metricTolerance']
        return result
    except GenericDarbouxError: raise
    except (ValueError, ZeroDivisionError, OverflowError) as exc:
        raise SpaceCurveFoldError('source-domain', '原四源空间曲折不能在完整有限实数域完成；不改保存圆族。') from exc
