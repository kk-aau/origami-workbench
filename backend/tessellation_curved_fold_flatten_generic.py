"""Original nine-source FlattenFold2D / NFlattenFold2D numerical recovery.

Only the left geodesic turning drives the common planar recovery. Separate
source development and shared-turning certificates prevent two independently
developable, but incompatible, source ribbons from being called one flat fold.
"""
import math

import numpy as np
import sympy as sp

from tessellation_curved_generic_darboux import (
    DarbouxKernel, FLATTEN_PRESET, GenericDarbouxError, METRIC_TOLERANCE,
    DEVELOPABILITY_TOLERANCE, ROUNDING, values, dot, cross, validate_generic_darboux_query, initial_frame_compatibility,
)
from tessellation_curved_generic_linked_expression import Expression
from tessellation_curved_linked_common_interval import Interval
from tessellation_curved_matched_pair_query import symbolic_node, simplified, algebraic_budget

FAMILY = 'fold-flatten-generic-native'
RESULT_FAMILY = 'origamica-generic-fold-flatten'
CERTIFICATION_BUDGET = 1023
PRESET = {
    'family': FAMILY, 'foldCurve': ['sin(s)', 's**2/4', '1-cos(s)'],
    'leftDirector': ['0', '2+.1*s', '0'],
    'rightDirector': ['4*(1+.1*s)*sqrt(1+s**2/4)*sin(s)/(5+s**2)',
                      '(1+.1*s)*sqrt(1+s**2/4)*(3+s**2)/(5+s**2)',
                      '-4*(1+.1*s)*sqrt(1+s**2/4)*cos(s)/(5+s**2)'],
    'parameterStart': 0., 'parameterEnd': 1., 'transverseStart': 0., 'transverseEnd': .15,
    'segments': 32, 'rulingSegments': 16, 'initialParameter': 0.,
    'initialPoint': [0., 0.], 'initialTangent': [1., 0.]}


class FoldFlattenError(GenericDarbouxError):
    pass


def validate_flatten_fold_generic_query(data):
    if not isinstance(data, dict) or set(data)-set(PRESET):
        raise FoldFlattenError('input-contract', '双侧通用展开须为仅含已支持字段的对象。')
    q = {**PRESET, **data}
    if q['family'] != FAMILY: raise FoldFlattenError('input-contract', '双侧通用展开类型无效。')
    for key in ('foldCurve', 'leftDirector', 'rightDirector'):
        if not isinstance(q[key], list) or len(q[key]) != 3:
            raise FoldFlattenError('input-contract', 'ff、rrL、rrR须各有三个安全标量表达式。')
        for source in q[key]: Expression(source, 's')
        q[key] = list(q[key])
    temporary = {**FLATTEN_PRESET, **{k: q[k] for k in q if k in FLATTEN_PRESET},
                 'family': FLATTEN_PRESET['family'], 'baseCurve': q['foldCurve'], 'director': q['leftDirector']}
    checked = validate_generic_darboux_query(temporary)
    for key in q:
        if key in checked and key != 'family': q[key] = checked[key]
    return q


def shared_geodesic_square_identity(curve, left, right):
    """Bounded algebraic equality of squared geodesic turning numerators.

    The two real analytic candidates are either identically equal or opposite
    on a connected regular domain. A separately enclosed same-sign point
    selects equality. Zero numerators are proved independently, not sampled.
    """
    try:
        groups = [curve, left, right]
        if any(algebraic_budget(f.tree) > 24 for group in groups for f in group): return None
        s = sp.Symbol('s', real=True)
        b, dl, dr = [[symbolic_node(f.tree, s) for f in group] for group in groups]
        bp, bpp = [sp.diff(x, s) for x in b], [sp.diff(x, s, 2) for x in b]
        v2 = simplified(dot(bp, bp)); turning = simplified(dot(bp, bpp))
        def invariant(d):
            td = simplified(dot(bp, d)); dd = simplified(dot(d, d)); dc = simplified(dot(d, bpp))
            area2 = simplified(v2*dd-td*td)
            numerator = simplified(v2*dc-td*turning)
            return numerator, area2
        nl, al = invariant(dl); nr, ar = invariant(dr)
        if nl == nr == 0: return 'identically-zero'
        if simplified(nl*nl*ar-nr*nr*al) == 0: return 'squared-identity'
    except (ValueError, TypeError, ZeroDivisionError, RecursionError, OverflowError, sp.PolynomialError, NotImplementedError):
        pass
    return None


class FoldFlattenKernel:
    def __init__(self, q):
        self.query = q
        common = {k: q[k] for k in q if k in FLATTEN_PRESET and k != 'family'}
        self.left = DarbouxKernel({**FLATTEN_PRESET, **common, 'baseCurve': q['foldCurve'], 'director': q['leftDirector'], 'sigma': 1})
        self.right = DarbouxKernel({**FLATTEN_PRESET, **common, 'baseCurve': q['foldCurve'], 'director': q['rightDirector'], 'sigma': -1})
        self.scale, self.ui = self.left.scale, q['initialParameter']
        self.shared_proof = shared_geodesic_square_identity(self.left.curves[0], self.left.curves[1], self.right.curves[1])
        self.shared_analytic = self.shared_proof == 'identically-zero'
        if self.shared_proof == 'squared-identity':
            for s in np.linspace(q['parameterStart'], q['parameterEnd'], 9):
                try:
                    l, r = self.points(Interval(float(s)))
                    gl, gr = Interval.cast(l['g'].value), Interval.cast(r['g'].value)
                    if gl.lo > 0 and gr.lo > 0 or gl.hi < 0 and gr.hi < 0:
                        self.shared_analytic = True
                        break
                except (ValueError, ZeroDivisionError, OverflowError): pass

    def points(self, s):
        left, right = self.left.point(s), self.right.point(s)
        # The helper has sigma=-1. Original FlattenFold defines both pR and
        # qR without sigma; its two explicit negatives cancel at final Rot.
        right = {**right, 'p': -right['p'], 'q': -right['q']}
        return left, right

    def finite(self, s):
        left, right = self.left.finite_point(float(s)), self.right.finite_point(float(s))
        return left, {**right, 'p': -right['p'], 'q': -right['q']}

    def target(self, s, left, right):
        t = self.left.target(float(s), left)
        common = {'b': t['b'], 'bp': t['bp'], 'T': t['T'], 'L': t['L']}
        output = {'left': {**common, 'd': t['d'], 'dp': t['dp']}}
        p, q, pp, qp, g = right['p'].value, right['q'].value, right['p'].c[1], right['q'].c[1], left['g'].value
        output['right'] = {**common, 'd': p*t['T']+q*t['L'],
                           'dp': (pp-q*g)*t['T']+(qp+p*g)*t['L']}
        return output

    def jacobians(self, left, right, w):
        result = {}
        for label, f in [('Left', left), ('Right', right)]:
            ds = [a+b*w for a, b in zip(f['bp'], f['dp'])]
            result['source'+label] = Interval.cast(dot(cross(ds, f['d']), f['U']).value)
            v, p, q = [f[k].value for k in ('v', 'p', 'q')]
            pp, qp, g = f['p'].c[1], f['q'].c[1], left['g'].value
            # Scalar values may be Interval, so keep w on the right of any
            # Taylor operation and here use only scalar Interval arithmetic.
            result['formal'+label] = Interval.cast(v*q+w*(q*pp-p*qp-g*(p*p+q*q)))
        return result

    def cell(self, start, end):
        left, right = self.points(Interval(start, end))
        bounds = [Interval.cast(x.value).lo for x in (left['v'], left['transverse'], right['transverse'], left['directorLength'], right['directorLength'])]
        if min(bounds) <= 0: raise ValueError('two source frame regularity unresolved')
        w = Interval(self.query['transverseStart'], self.query['transverseEnd'])
        jac = self.jacobians(left, right, w)
        if any(not math.isfinite(j.lo+j.hi) for j in jac.values()): raise ValueError('nonfinite strip hull')
        return {'start': start, 'end': end, 'speedLowerBound': bounds[0], 'leftTransverseLowerBound': bounds[1],
                'rightTransverseLowerBound': bounds[2], 'leftDirectorLengthLowerBound': bounds[3], 'rightDirectorLengthLowerBound': bounds[4],
                **{key+'NormalizedJacobianBounds': [j.lo, j.hi] for key, j in jac.items()}}

    def domain(self):
        q = self.query; cells = []; unresolved = []; evaluations = 0
        stack = [(q['parameterStart'], q['parameterEnd'], 0)]
        while stack:
            a, b, depth = stack.pop(); evaluations += 1
            if evaluations > CERTIFICATION_BUDGET:
                unresolved.extend([[a, b]]+[[x, y] for x, y, _ in stack]); break
            try: cells.append(self.cell(a, b))
            except (ValueError, ZeroDivisionError, OverflowError):
                self.finite((a+b)/2)
                if depth >= 18 or b-a <= 1e-9: unresolved.append([a, b])
                else:
                    middle = (a+b)/2; stack.extend([(middle, b, depth+1), (a, middle, depth+1)])
        keys = ['sourceLeft', 'sourceRight', 'formalLeft', 'formalRight']
        def tighten(cell, depth):
            nonlocal evaluations
            uncertain = [key for key in keys if cell[key+'NormalizedJacobianBounds'][0] <= 0 <= cell[key+'NormalizedJacobianBounds'][1]]
            if not uncertain or depth >= 12 or evaluations+2 > CERTIFICATION_BUDGET: return [cell]
            a, b = cell['start'], cell['end']; middle = (a+b)/2
            left, right = self.finite(middle)
            ends = [self.jacobians(left, right, x) for x in (q['transverseStart'], q['transverseEnd'])]
            # An actual witness need not be repaired by subdivisions. Retain
            # all original widths; _result assigns the separate degenerate flag.
            improvable = [key for key in uncertain if not min(j[key].lo for j in ends) <= 0 <= max(j[key].hi for j in ends)]
            # A focused left side does not prevent proving a regular right
            # side (or a source/target counterpart) with tighter cells.
            if not improvable: return [cell]
            try:
                evaluations += 2
                children = [self.cell(a, middle), self.cell(middle, b)]
            except (ValueError, ZeroDivisionError, OverflowError): return [cell]
            return [x for child in children for x in tighten(child, depth+1)]
        cells = [x for cell in cells for x in tighten(cell, 0)]
        cells.sort(key=lambda x: x['start']); unresolved.sort(); certified = not unresolved
        def strip(key):
            bounds = [c[key+'NormalizedJacobianBounds'] for c in cells]
            orientation = 1 if certified and all(lo > 0 for lo, hi in bounds) else -1 if certified and all(hi < 0 for lo, hi in bounds) else None
            return {'status': 'verified' if orientation is not None else 'unknown', 'orientation': orientation,
                    'minimumAbsoluteJacobianLowerBound': min(lo if orientation == 1 else -hi for lo, hi in bounds) if orientation is not None else None,
                    'reason': None if orientation is not None else 'complete original strip Jacobian not enclosed away from zero; domain retained'}
        def lower(key): return min(c[key] for c in cells) if certified and cells else None
        return {'certified': certified, 'evaluations': min(evaluations, CERTIFICATION_BUDGET+1), 'verifiedCells': len(cells),
                'cells': cells, 'unresolved': unresolved, 'minimumSpeedLowerBound': lower('speedLowerBound'),
                'minimumLeftTransverseLowerBound': lower('leftTransverseLowerBound'), 'minimumRightTransverseLowerBound': lower('rightTransverseLowerBound'),
                'roundingModel': ROUNDING, 'reason': None if certified else 'two-source frame interval budget unresolved; original domain retained',
                'sourceStripRegularity': {'left': strip('sourceLeft'), 'right': strip('sourceRight')},
                'formalStripRegularity': {'left': strip('formalLeft'), 'right': strip('formalRight')}}

    def row(self, s, left, right, target):
        result = {'s': float(s)}
        for prefix, origin, items in [
            ('Source', self.left.source_origin, [('Base', values(left['b'])), ('LeftDirector', values(left['d'])), ('RightDirector', values(right['d'])),
              ('BaseDerivative', values(left['bp'])), ('LeftDirectorDerivative', values(left['dp'])), ('RightDirectorDerivative', values(right['dp']))]),
            ('Target', self.left.target_origin, [('Base', target['left']['b']), ('LeftDirector', target['left']['d']), ('RightDirector', target['right']['d']),
              ('BaseDerivative', target['left']['bp']), ('LeftDirectorDerivative', target['left']['dp']), ('RightDirectorDerivative', target['right']['dp'])])]:
            for suffix, norm in items:
                result[prefix.lower()+suffix] = (norm*self.scale+(origin if suffix == 'Base' else 0)).tolist()
                result['normalized'+prefix+suffix] = norm.tolist()
        result['targetTangent'], result['targetLeftNormal'] = target['left']['T'].tolist(), target['left']['L'].tolist()
        coefficients = {'speed': float(left['v'].value*self.scale), 'normalizedSpeed': float(left['v'].value)}
        for side, f in [('left', left), ('right', right)]:
            c = {'g': float(f['g'].value)}
            for key, value in [('p', f['p'].value), ('q', f['q'].value), ('pPrime', f['p'].c[1]), ('qPrime', f['q'].c[1])]:
                c[key] = float(value*self.scale); c['normalized'+key[0].upper()+key[1:]] = float(value)
            coefficients[side] = c
        result['coefficients'] = coefficients
        return result


def query_flatten_fold_generic(data):
    q = validate_flatten_fold_generic_query(data)
    try:
        kernel = FoldFlattenKernel(q); domain = kernel.domain(); kernel.left.integrate()
        return _result(kernel, domain)
    except GenericDarbouxError: raise
    except (ValueError, ZeroDivisionError, OverflowError) as exc:
        raise FoldFlattenError('source-domain', '原九标量源无法在有限实数域完成双侧展开。') from exc


def _result(kernel, domain):
    q = kernel.query; sample = []; grid = []
    transverse = np.linspace(q['transverseStart'], q['transverseEnd'], q['rulingSegments']+1)
    audit_w = list(transverse); midpoint = (q['transverseStart']+q['transverseEnd'])/2
    if midpoint not in audit_w: audit_w.append(midpoint)
    maxima = {'leftMetric': 0., 'rightMetric': 0., 'leftDevelop': 0., 'rightDevelop': 0., 'shared': 0., 'frame': 0.}
    degenerate = {key: False for key in ('sourceLeft', 'sourceRight', 'formalLeft', 'formalRight')}

    def inspect(s, left, right, target):
        frame = np.column_stack((target['left']['T'], target['left']['L']))
        maxima['frame'] = max(maxima['frame'], float(np.max(np.abs(frame.T@frame-np.eye(2)))))
        gl, gr = left['g'].value, right['g'].value
        maxima['shared'] = max(maxima['shared'], abs(gl-gr)/max(abs(gl), abs(gr), 1/(q['parameterEnd']-q['parameterStart'])))
        metrics = {}
        for side, f in [('left', left), ('right', right)]:
            bp, d, dp, u = [values(f[k]) for k in ('bp', 'd', 'dp', 'U')]
            tf = target[side]; tmetrics = []; smetrics = []
            residual = abs(float(u@dp))/max(float(np.linalg.norm(d)), float(np.linalg.norm(dp)), np.finfo(float).tiny)
            maxima[side+'Develop'] = max(maxima[side+'Develop'], residual)
            for i, w in enumerate(audit_w):
                ds, dt = bp+w*dp, tf['bp']+w*tf['dp']
                source_metric, target_metric = np.asarray([ds@ds, ds@d, d@d]), np.asarray([dt@dt, dt@tf['d'], tf['d']@tf['d']])
                mismatch = float(np.max(np.abs(source_metric-target_metric))/max(np.max(np.abs(source_metric)), np.max(np.abs(target_metric)), np.finfo(float).tiny))
                maxima[side+'Metric'] = max(maxima[side+'Metric'], mismatch)
                if i < len(transverse): smetrics.append(source_metric.tolist()); tmetrics.append(target_metric.tolist())
            metrics['source'+side.title()+'EFG'] = smetrics; metrics['target'+side.title()+'EFG'] = tmetrics
        endpoints = [kernel.jacobians(left, right, w) for w in (q['transverseStart'], q['transverseEnd'])]
        suspects = [key for key in degenerate if min(j[key].lo for j in endpoints) <= 0 <= max(j[key].hi for j in endpoints)]
        if suspects:
            narrow_left, narrow_right = kernel.points(Interval(float(s)))
            endpoints = [kernel.jacobians(narrow_left, narrow_right, Interval(w)) for w in (q['transverseStart'], q['transverseEnd'])]
        for key in degenerate:
            # Narrow interval endpoint tests retain arithmetic uncertainty;
            # opposite strict signs establish an actual affine focus.
            l, r = endpoints[0][key], endpoints[1][key]
            # A zero projection is only sufficient for actual source loss of
            # area when that side is proved developable. Otherwise retain
            # unknown: a transverse normal derivative can keep its area >0.
            eligible = not key.startswith('source') or (kernel.left.analytic if key == 'sourceLeft' else kernel.right.analytic)
            if eligible and (l.hi < 0 < r.lo or r.hi < 0 < l.lo or l.lo == l.hi == 0 or r.lo == r.hi == 0):
                degenerate[key] = True
        return metrics

    for s in np.linspace(q['parameterStart'], q['parameterEnd'], 129):
        l, r = kernel.finite(float(s)); inspect(float(s), l, r, kernel.target(float(s), l, r))
    for s in np.linspace(q['parameterStart'], q['parameterEnd'], q['segments']+1):
        l, r = kernel.finite(float(s)); target = kernel.target(float(s), l, r)
        sample.append(kernel.row(float(s), l, r, target)); metrics = inspect(float(s), l, r, target)
        row = {'s': float(s), **metrics}
        for side, f in [('Left', l), ('Right', r)]:
            normalized_source = [(values(f['b'])+w*values(f['d'])).tolist() for w in transverse]
            normalized_target = [(target[side.lower()]['b']+w*target[side.lower()]['d']).tolist() for w in transverse]
            row['normalizedSource'+side] = normalized_source; row['normalizedTarget'+side] = normalized_target
            row['source'+side] = [(np.asarray(x)*kernel.scale+kernel.left.source_origin).tolist() for x in normalized_source]
            row['target'+side] = [(np.asarray(x)*kernel.scale+kernel.left.target_origin).tolist() for x in normalized_target]
        grid.append(row)
    for stage in ('source', 'formal'):
        for side in ('left', 'right'):
            if degenerate[stage+side.title()]:
                domain[stage+'StripRegularity'][side] = {'status': 'degenerate', 'orientation': None, 'minimumAbsoluteJacobianLowerBound': None,
                                                        'reason': 'literal affine strip Jacobian has a finite focus witness; original width domain retained'}
    def evidence(analytic, residual, method):
        status = 'analytic' if analytic else 'incompatible' if residual > DEVELOPABILITY_TOLERANCE else 'numerical' if domain['certified'] else 'unknown'
        return {'status': status, 'method': method if analytic else 'finite-source-Taylor', 'analyticIdentity': analytic,
                'tolerance': DEVELOPABILITY_TOLERANCE, 'maximumRelativeResidual': residual}
    ld = evidence(kernel.left.analytic, maxima['leftDevelop'], 'bounded-safe-symbolic-triple-product')
    rd = evidence(kernel.right.analytic, maxima['rightDevelop'], 'bounded-safe-symbolic-triple-product')
    shared = evidence(kernel.shared_analytic, maxima['shared'], 'bounded-safe-symbolic-square-and-certified-sign')
    integration = {'method': 'DOP853', 'relativeTolerance': 2e-12, 'absoluteTolerance': 2e-14, 'initialParameter': kernel.ui,
                   'backwardEvaluations': 0 if kernel.left.backward is None else int(kernel.left.backward.nfev),
                   'forwardEvaluations': 0 if kernel.left.forward is None else int(kernel.left.forward.nfev), 'integrationErrorIntervalCertified': False}
    frame = initial_frame_compatibility([kernel.left.initial_tangent, kernel.left.initial_left])
    if not frame['frameCompatible']:
        domain['formalStripRegularity'] = {side: {'status': 'unknown', 'orientation': None,
            'minimumAbsoluteJacobianLowerBound': None,
            'reason': 'raw initial orthonormal-frame compatibility not verified at roundoff scale'} for side in ('left', 'right')}
    certifications = {'finiteLeftMetricVerified': maxima['leftMetric'] <= METRIC_TOLERANCE, 'finiteRightMetricVerified': maxima['rightMetric'] <= METRIC_TOLERANCE,
                      'finiteSourceDevelopabilityVerified': max(maxima['leftDevelop'], maxima['rightDevelop']) <= DEVELOPABILITY_TOLERANCE,
                      'finiteSharedGeodesicCurvatureVerified': maxima['shared'] <= DEVELOPABILITY_TOLERANCE,
                      'leftSourceDevelopabilityAnalytic': kernel.left.analytic, 'rightSourceDevelopabilityAnalytic': kernel.right.analytic,
                      'sharedGeodesicCurvatureAnalytic': kernel.shared_analytic, 'sourceRegularityCertified': domain['certified'],
                      'initialFrameCompatible': frame['frameCompatible'],
                      'formalCommonFlatteningCertified': bool(kernel.left.analytic and kernel.right.analytic and kernel.shared_analytic and domain['certified'] and frame['frameCompatible']),
                      'integrationErrorIntervalCertified': False, 'globalInjectivityChecked': False, 'selfCollisionChecked': False,
                      'exactStraightCreaseFOLD': False, 'adoptableCreasePattern': False}
    for stage in ('source', 'formal'):
        for side in ('Left', 'Right'):
            certifications[stage+side+'StripRegularityCertified'] = domain[stage+'StripRegularity'][side.lower()]['status'] == 'verified'
    return {'family': RESULT_FAMILY, 'query': q,
            'source': {'functions': ['FlattenFold2D', 'NFlattenFold2D'], 'definitionCells': ['In[3932]', 'In[3935]'],
                       'method': 'whitelist-AST/Taylor/two-source-Darboux/left-frame-DOP853', 'initialArgumentOrder': ['ui', 'fi', 'ti'],
                       'rightNormalConvention': 'UR=normalize(-T.cross(rrR));LR=UR.cross(T)',
                       'rightDirectorConvention': 'pR=rrR.dot(T);qR=rrR.dot(LR);rR=pR*t+qR*l',
                       'directorNormalized': False, 'interpolationReproduced': False, 'symbolicSolverReproduced': False,
                       'wolframOptionsReproduced': False, 'metricConvention': 'normalized-s/world-w'},
            'normalization': {'sourceOrigin': kernel.left.source_origin.tolist(), 'targetOrigin': kernel.left.target_origin.tolist(), 'scale': kernel.scale},
            'initial': {'parameter': kernel.ui, 'point': list(q['initialPoint']), 'tangent': list(q['initialTangent']), **frame},
            'diagnostics': {'validationNodes': 129, 'maximumFrameResidual': maxima['frame'],
                            'maximumLeftRelativeMetricDifference': maxima['leftMetric'], 'maximumRightRelativeMetricDifference': maxima['rightMetric'],
                            'leftSourceDevelopability': ld, 'rightSourceDevelopability': rd, 'sharedGeodesicCurvature': shared,
                            'metricTolerance': METRIC_TOLERANCE, 'integration': integration},
            'certification': certifications, 'domain': domain, 'sample': {'rows': sample}, 'grid': grid}
