"""Certified smooth fold of a symbolic space curve and its planar unfolding.

Origamica 15.0 section 45, In[3932]/In[3935]/In[3939]/In[3942].  The
construction is analytic; ODE solutions and triangle meshes are numerical
evaluations of it.  Neither a straight-crease FOLD pattern nor a deployment
or collision certificate is produced.
"""

from dataclasses import dataclass, field
import math

from mpmath import iv
import sympy as sp
from scipy.integrate import solve_ivp
from sympy.calculus.util import continuous_domain, function_range


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def _scale(a, scalar):
    return tuple(scalar * x for x in a)


def _clean(expr):
    return sp.simplify(sp.trigsimp(expr))


def _finite(value, name):
    if isinstance(value, bool):
        raise ValueError(f'{name} must be a finite real number.')
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(f'{name} must be a finite real number.') from exc
    if not math.isfinite(result):
        raise ValueError(f'{name} must be a finite real number.')
    return result


def _expression(value, name):
    if isinstance(value, (str, bool)):
        raise ValueError(f'{name} must be a numeric SymPy expression, not text.')
    try:
        result = sp.sympify(value)
    except (sp.SympifyError, TypeError, ValueError) as exc:
        raise ValueError(f'{name} is not a SymPy expression.') from exc
    if not isinstance(result, sp.Expr):
        raise ValueError(f'{name} is not a scalar SymPy expression.')
    return result


def _range(expr, parameter, domain, name):
    """Only accept a global symbolic range, never a sampled plausibility check."""
    expr = _clean(expr)
    if expr.free_symbols - {parameter}:
        raise ValueError(f'{name} contains unresolved parameters.')
    try:
        if continuous_domain(expr, parameter, domain) != domain:
            raise ValueError(f'{name} is not continuous on the full interval.')
        result = function_range(expr, parameter, domain)
        lo, hi = result.inf, result.sup
        if not math.isfinite(float(lo)) or not math.isfinite(float(hi)):
            raise ValueError(f'{name} has no finite certified range.')
        return lo, hi
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f'{name} has no provable global range on the interval.') from exc


def _proved(relation):
    return _clean(relation) is sp.S.true


def _interval_range(expr, parameter, domain, name, pieces=96):
    """Directed-rounding enclosure when symbolic extrema are unavailable.

    Interval arithmetic is conservative, so dependency can reject a genuinely
    safe width; it cannot turn an uncertified sampled estimate into a proof.
    """
    try:
        if continuous_domain(expr, parameter, domain) != domain:
            raise ValueError(f'{name} is not continuous on the full interval.')
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f'{name} continuity could not be proved.') from exc
    iv.dps = 40

    def evaluate(node, argument):
        if node == parameter:
            return argument
        if node is sp.pi:
            return iv.pi
        if node is sp.E:
            return iv.e
        if node.is_Number:
            exact = sp.Rational(node)
            return iv.mpf(int(exact.p)) / iv.mpf(int(exact.q))
        if node.is_Add:
            return sum((evaluate(arg, argument) for arg in node.args), iv.mpf(0))
        if node.is_Mul:
            product = iv.mpf(1)
            for arg in node.args:
                product *= evaluate(arg, argument)
            return product
        if node.is_Pow:
            base, power = node.args
            value = evaluate(base, argument)
            if power.is_Integer:
                return value ** int(power)
            if power == sp.Rational(1, 2):
                return iv.sqrt(value)
            if power == sp.Rational(-1, 2):
                return 1 / iv.sqrt(value)
        functions = {sp.sin: iv.sin, sp.cos: iv.cos,
                     sp.tan: iv.tan, sp.Abs: iv.fabs}
        if node.func in functions:
            return functions[node.func](evaluate(node.args[0], argument))
        raise ValueError(f'{name} uses an expression unsupported by interval proof.')

    start, end = map(float, (domain.start, domain.end))
    lower, upper = math.inf, -math.inf
    try:
        for i in range(pieces):
            a = start + (end - start) * i / pieces
            b = start + (end - start) * (i + 1) / pieces
            argument = iv.mpf([math.nextafter(a, -math.inf),
                               math.nextafter(b, math.inf)])
            result = evaluate(expr, argument)
            lower = min(lower, math.nextafter(float(result.a), -math.inf))
            upper = max(upper, math.nextafter(float(result.b), math.inf))
    except (ValueError, TypeError, ZeroDivisionError, OverflowError) as exc:
        raise ValueError(f'{name} has no interval certificate.') from exc
    if not math.isfinite(lower) or not math.isfinite(upper):
        raise ValueError(f'{name} has no finite interval certificate.')
    return lower, upper


@dataclass(frozen=True)
class CertifiedSpaceCurveFold:
    """Exact input equations and generator law with a numerical frame evaluator."""

    parameter: sp.Symbol
    interval: tuple[sp.Expr, sp.Expr]
    curve: tuple[sp.Expr, sp.Expr, sp.Expr]
    fold_angle: sp.Expr
    orientation: int
    speed: sp.Expr
    turn_rate: sp.Expr
    left_alpha: sp.Expr
    left_beta: sp.Expr
    right_alpha: sp.Expr
    right_beta: sp.Expr
    _jets: object = field(repr=False, compare=False)

    def frame(self, u):
        """Evaluate the notebook's Frenet generators at one parameter value."""
        u = _finite(u, 'u')
        u0, u1 = map(float, self.interval)
        if not u0 <= u <= u1:
            raise ValueError('u is outside the certified curve interval.')
        values = tuple(map(float, self._jets(u)))
        if len(values) != 14 or not all(map(math.isfinite, values)):
            raise ValueError('Curve evaluation is not finite.')
        point, d1, d2, d3 = (values[i:i + 3] for i in (0, 3, 6, 9))
        gamma, gamma_prime = values[12:]
        speed = math.sqrt(_dot(d1, d1))
        cross12 = _cross(d1, d2)
        cross_length = math.sqrt(_dot(cross12, cross12))
        if not speed > 0 or not cross_length > 0 or not 0 < gamma < math.pi:
            raise ValueError('Curve frame or fold angle became singular.')
        tangent = _scale(d1, 1 / speed)
        binormal = _scale(cross12, 1 / cross_length)
        normal = _cross(binormal, tangent)
        half_cos, half_sin = math.cos(gamma / 2), math.sin(gamma / 2)
        sigma = self.orientation
        left_transverse = _scale(_add(_scale(normal, half_cos),
                                      _scale(binormal, half_sin)), sigma)
        right_transverse = _scale(_add(_scale(normal, half_cos),
                                       _scale(binormal, -half_sin)), sigma)
        speed_curvature = cross_length / (speed * speed)
        speed_torsion = speed * _dot(cross12, d3) / (cross_length * cross_length)
        a = gamma_prime / 2 + speed_torsion
        b = gamma_prime / 2 - speed_torsion
        q = half_sin * speed_curvature
        m_left, m_right = math.hypot(q, a), math.hypot(q, b)
        alpha_left, beta_left = sigma * a / m_left, q / m_left
        alpha_right, beta_right = -sigma * b / m_right, -q / m_right
        left_ruling = _add(_scale(tangent, alpha_left),
                           _scale(left_transverse, beta_left))
        right_ruling = _add(_scale(tangent, alpha_right),
                            _scale(right_transverse, beta_right))
        return {'u': u, 'foldedCrease': point,
                'foldedLeftRuling': left_ruling,
                'foldedRightRuling': right_ruling,
                'leftFlatCoefficients': (alpha_left, beta_left),
                'rightFlatCoefficients': (alpha_right, beta_right),
                'tangent': tangent, 'speed': speed,
                'foldAngleRad': gamma,
                'geodesicTurnRate': sigma * half_cos * speed_curvature}

    def certify_ruling_width(self, width):
        """Prove a sufficient no-focal bound on both ruled strips."""
        width = _finite(width, 'ruling width')
        if width <= 0:
            raise ValueError('ruling width must be positive.')
        for side, alpha, beta in (
                ('left', self.left_alpha, self.left_beta),
                ('right', self.right_alpha, self.right_beta)):
            area_at_crease = _clean(self.speed * sp.Abs(beta))
            area_slope = _clean(beta * sp.diff(alpha, self.parameter)
                                - alpha * sp.diff(beta, self.parameter)
                                - self.turn_rate)
            domain = sp.Interval(*self.interval)
            try:
                if sp.count_ops(area_at_crease) > 10:
                    raise ValueError('use interval enclosure for compound expression')
                minimum, _ = _range(area_at_crease, self.parameter,
                                    domain, f'{side} area')
            except ValueError:
                minimum, _ = _interval_range(area_at_crease, self.parameter,
                                              domain, f'{side} area')
            try:
                if sp.count_ops(area_slope) > 10:
                    raise ValueError('use interval enclosure for compound expression')
                _, maximum = _range(sp.Abs(area_slope), self.parameter,
                                    domain, f'{side} area slope')
            except ValueError:
                _, maximum = _interval_range(sp.Abs(area_slope), self.parameter,
                                              domain, f'{side} area slope')
            safe = (_proved(minimum - sp.Float(width) * maximum > 0)
                    if isinstance(minimum, sp.Basic) and isinstance(maximum, sp.Basic)
                    else float(minimum) > width * float(maximum)
                    + 1e-12 * max(1.0, abs(float(minimum))))
            if not safe:
                raise ValueError(f'{side} ruling width cannot be certified before its focal set.')
        return width


def fold_space_curve_3d(curve, fold_angle, *, parameter, interval,
                        orientation=1):
    """Construct the source's two developable generators for a regular curve.

    Curve and angle are SymPy expressions, so their derivatives and regularity
    can be proved over the *whole* closed interval. Unproved input is refused.
    """
    if not isinstance(parameter, sp.Symbol) or parameter.is_real is not True:
        raise ValueError('parameter must be a real SymPy Symbol.')
    if orientation not in (-1, 1) or isinstance(orientation, bool):
        raise ValueError('fold orientation must be +1 or -1.')
    if not isinstance(curve, (tuple, list)) or len(curve) != 3:
        raise ValueError('curve must contain three symbolic coordinates.')
    if not isinstance(interval, (tuple, list)) or len(interval) != 2:
        raise ValueError('interval must contain two endpoints.')
    u0, u1 = (_expression(value, 'interval endpoint') for value in interval)
    if u0.free_symbols or u1.free_symbols or not _finite(u1 - u0, 'interval') > 0:
        raise ValueError('interval must be finite and increasing.')
    domain = sp.Interval(u0, u1)
    f = tuple(_expression(value, 'curve coordinate') for value in curve)
    gamma = _expression(fold_angle, 'fold angle')
    for name, expression, order in (
            *((f'curve coordinate {i}', expression, 4)
              for i, expression in enumerate(f)),
            ('fold angle', gamma, 2)):
        if expression.free_symbols - {parameter}:
            raise ValueError(f'{name} contains unresolved parameters.')
        for derivative in range(order + 1):
            _range(sp.diff(expression, parameter, derivative), parameter,
                   domain, f'{name} derivative {derivative}')
    d1 = tuple(sp.diff(value, parameter) for value in f)
    d2 = tuple(sp.diff(value, parameter) for value in d1)
    d3 = tuple(sp.diff(value, parameter) for value in d2)
    cross12 = _cross(d1, d2)
    speed_squared = _clean(_dot(d1, d1))
    curvature_numerator_squared = _clean(_dot(cross12, cross12))
    speed_minimum, _ = _range(speed_squared, parameter, domain, 'speed squared')
    curvature_minimum, _ = _range(curvature_numerator_squared, parameter,
                                  domain, 'curvature numerator squared')
    if not _proved(speed_minimum > 0) or not _proved(curvature_minimum > 0):
        raise ValueError('curve speed and Frenet curvature must stay nonzero.')
    angle_minimum, angle_maximum = _range(gamma, parameter, domain, 'fold angle')
    if not _proved(angle_minimum > 0) or not _proved(angle_maximum < sp.pi):
        raise ValueError('fold angle must stay strictly between 0 and π.')
    speed = _clean(sp.sqrt(speed_squared))
    speed_curvature = _clean(sp.sqrt(curvature_numerator_squared) / speed_squared)
    speed_torsion = _clean(speed * _dot(cross12, d3)
                           / curvature_numerator_squared)
    q = _clean(sp.sin(gamma / 2) * speed_curvature)
    a = _clean(sp.diff(gamma, parameter) / 2 + speed_torsion)
    b = _clean(sp.diff(gamma, parameter) / 2 - speed_torsion)
    m_left = _clean(sp.sqrt(q * q + a * a))
    m_right = _clean(sp.sqrt(q * q + b * b))
    jets = sp.lambdify(parameter, (*f, *d1, *d2, *d3, gamma,
                                   sp.diff(gamma, parameter)), modules='math')
    return CertifiedSpaceCurveFold(
        parameter=parameter, interval=(u0, u1), curve=f, fold_angle=gamma,
        orientation=orientation, speed=speed,
        turn_rate=_clean(orientation * sp.cos(gamma / 2) * speed_curvature),
        left_alpha=_clean(orientation * a / m_left),
        left_beta=_clean(q / m_left),
        right_alpha=_clean(-orientation * b / m_right),
        right_beta=_clean(-q / m_right), _jets=jets)


@dataclass(frozen=True)
class FlattenedCurveFold:
    """A certified smooth unfolding, numerically evaluated by an ODE."""

    folded: CertifiedSpaceCurveFold
    initial_parameter: float
    initial_point: tuple[float, float]
    initial_tangent: tuple[float, float]
    _exact_initial_parameter: sp.Expr = field(repr=False, compare=False)
    _exact_initial_point: tuple[sp.Expr, sp.Expr] = field(repr=False, compare=False)
    _exact_initial_tangent: tuple[sp.Expr, sp.Expr] = field(repr=False, compare=False)
    _lower_solution: object = field(repr=False, compare=False)
    _upper_solution: object = field(repr=False, compare=False)

    def exact_flat_expressions(self):
        """Return exact quadrature-defined plane curve and ruling functions."""
        u = self.folded.parameter
        t = sp.Dummy('t', real=True)
        s = sp.Dummy('s', real=True)
        phase0 = sp.atan2(self._exact_initial_tangent[1],
                          self._exact_initial_tangent[0])
        phase = phase0 + sp.Integral(self.folded.turn_rate.subs(u, t),
                                     (t, self._exact_initial_parameter, u))
        phase_s = phase.subs(u, s)
        x = self._exact_initial_point[0] + sp.Integral(
            self.folded.speed.subs(u, s) * sp.cos(phase_s),
            (s, self._exact_initial_parameter, u))
        y = self._exact_initial_point[1] + sp.Integral(
            self.folded.speed.subs(u, s) * sp.sin(phase_s),
            (s, self._exact_initial_parameter, u))
        tangent = (sp.cos(phase), sp.sin(phase))
        normal = (-sp.sin(phase), sp.cos(phase))
        r_left = tuple(self.folded.left_alpha * tangent[i]
                       + self.folded.left_beta * normal[i] for i in range(2))
        r_right = tuple(self.folded.right_alpha * tangent[i]
                        + self.folded.right_beta * normal[i] for i in range(2))
        return {'flatCrease': (x, y), 'flatLeftRuling': r_left,
                'flatRightRuling': r_right, 'tangentAngle': phase}

    def frame(self, u):
        u = _finite(u, 'u')
        u0, u1 = map(float, self.folded.interval)
        if not u0 <= u <= u1:
            raise ValueError('u is outside the certified curve interval.')
        if u == self.initial_parameter:
            x, y = self.initial_point
            phase = math.atan2(self.initial_tangent[1], self.initial_tangent[0])
        else:
            solution = self._lower_solution if u < self.initial_parameter else self._upper_solution
            x, y, phase = map(float, solution(u))
        folded = self.folded.frame(u)
        tangent = (math.cos(phase), math.sin(phase))
        normal = (-tangent[1], tangent[0])
        def ruling(coefficients):
            alpha, beta = coefficients
            return _add(_scale(tangent, alpha), _scale(normal, beta))
        return {**folded, 'flatCrease': (x, y),
                'flatLeftRuling': ruling(folded['leftFlatCoefficients']),
                'flatRightRuling': ruling(folded['rightFlatCoefficients'])}


def flatten_fold_2d(folded, *, initial_parameter=None,
                    initial_point=(1, 0), initial_tangent=(0, 1)):
    """Recover one plane crease shared by both sides, as in FlattenFold2D.

    The exact map is defined by quadratures; scipy evaluates those quadratures
    with a high-accuracy ODE. Only certified FoldSpaceCurve3D output is accepted.
    """
    if not isinstance(folded, CertifiedSpaceCurveFold):
        raise ValueError('flattening requires a certified space-curve fold.')
    u0, u1 = map(float, folded.interval)
    exact_ui = (folded.interval[0] if initial_parameter is None
                else _expression(initial_parameter, 'initial parameter'))
    ui = _finite(exact_ui, 'initial parameter')
    if not u0 <= ui <= u1:
        raise ValueError('initial parameter lies outside the curve interval.')
    if len(initial_point) != 2 or len(initial_tangent) != 2:
        raise ValueError('initial point and tangent must be 2D vectors.')
    exact_point = tuple(_expression(x, 'initial point') for x in initial_point)
    exact_tangent = tuple(_expression(x, 'initial tangent') for x in initial_tangent)
    if any(value.free_symbols for value in (*exact_point, *exact_tangent)):
        raise ValueError('initial frame cannot contain unresolved symbols.')
    point = tuple(_finite(x, 'initial point') for x in initial_point)
    tangent = tuple(_finite(x, 'initial tangent') for x in initial_tangent)
    if _clean(sum(value * value for value in exact_tangent) - 1) != 0:
        raise ValueError('initial planar tangent must have unit length.')
    phase0 = math.atan2(tangent[1], tangent[0])
    initial_state = (*point, phase0)
    def derivative(u, state):
        spatial = folded.frame(u)
        speed, turn = spatial['speed'], spatial['geodesicTurnRate']
        return (speed * math.cos(state[2]), speed * math.sin(state[2]), turn)
    def integrate(endpoint):
        if endpoint == ui:
            return lambda ignored: initial_state
        result = solve_ivp(derivative, (ui, endpoint), initial_state,
                           rtol=2e-11, atol=2e-12, dense_output=True)
        if not result.success:
            raise ValueError('numerical plane-curve recovery failed.')
        return result.sol
    return FlattenedCurveFold(folded, ui, point, tangent,
                              exact_ui, exact_point, exact_tangent,
                              integrate(u0), integrate(u1))


def _sample(folded, flat, *, ruling_width, curve_segments=96, ruling_segments=4):
    width = folded.certify_ruling_width(ruling_width)
    if type(curve_segments) is not int or not 8 <= curve_segments <= 2048:
        raise ValueError('curve_segments must be an integer from 8 to 2048.')
    if type(ruling_segments) is not int or not 1 <= ruling_segments <= 32:
        raise ValueError('ruling_segments must be an integer from 1 to 32.')
    if (curve_segments + 1) * (2 * ruling_segments + 1) > 60000:
        raise ValueError('sampled surface exceeds 60000 vertices.')
    u0, u1 = map(float, folded.interval)
    frames = [(flat.frame if flat is not None else folded.frame)(
        u0 + (u1 - u0) * i / curve_segments) for i in range(curve_segments + 1)]
    vertices3 = [tuple(frame['foldedCrease']) for frame in frames]
    vertices2 = ([tuple(frame['flatCrease']) for frame in frames]
                 if flat is not None else None)
    crease_indices = list(range(curve_segments + 1))
    boundaries = {}
    rows = {}
    for side in ('Left', 'Right'):
        side_rows = [crease_indices]
        for j in range(1, ruling_segments + 1):
            distance = width * j / ruling_segments
            indices = []
            for frame in frames:
                indices.append(len(vertices3))
                vertices3.append(_add(frame['foldedCrease'],
                                      _scale(frame[f'folded{side}Ruling'], distance)))
                if vertices2 is not None:
                    vertices2.append(_add(frame['flatCrease'],
                                          _scale(frame[f'flat{side}Ruling'], distance)))
            side_rows.append(indices)
        rows[side.lower()] = side_rows
        boundaries[side.lower()] = side_rows[-1]
    faces, face_sides = [], []
    for side in ('left', 'right'):
        for inner, outer in zip(rows[side][:-1], rows[side][1:]):
            for i in range(curve_segments):
                a, b, c, d = inner[i], inner[i + 1], outer[i + 1], outer[i]
                triangles = ((a, b, c), (a, c, d)) if side == 'left' else (
                    (a, c, b), (a, d, c))
                faces.extend(triangles)
                face_sides.extend((side, side))
    result = {'family': 'certified-space-curve-fold',
              'parameterRange': (u0, u1), 'frames': frames,
              'foldedVertices': vertices3, 'faces': faces,
              'faceSides': face_sides, 'creaseVertexIndices': crease_indices,
              'boundaryVertexIndices': boundaries,
              'continuousDevelopabilityCertified': True,
              'continuousIsometryCertified': flat is not None,
              'sampledMeshExactIsometry': False,
              'deploymentPathChecked': False, 'selfCollisionChecked': False}
    if vertices2 is not None:
        result['flatVertices'] = vertices2
    return result


def nspace_curve_fold_3d(folded, *, ruling_width,
                         curve_segments=96, ruling_segments=4):
    """Sample the certified 3D ruled strips (NSpaceCurveFold3D analogue)."""
    if not isinstance(folded, CertifiedSpaceCurveFold):
        raise ValueError('a certified space-curve fold is required.')
    return _sample(folded, None, ruling_width=ruling_width,
                   curve_segments=curve_segments,
                   ruling_segments=ruling_segments)


def nflatten_fold_2d(flat, *, ruling_width,
                     curve_segments=96, ruling_segments=4):
    """Sample paired 2D/3D strips (NFlattenFold2D analogue)."""
    if not isinstance(flat, FlattenedCurveFold):
        raise ValueError('a certified planar unfolding is required.')
    return _sample(flat.folded, flat, ruling_width=ruling_width,
                   curve_segments=curve_segments,
                   ruling_segments=ruling_segments)
