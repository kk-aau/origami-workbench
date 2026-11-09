"""Bounded algebraic C' x C'' identity proof, independent of sampled tolerance.

Rational polynomials have exact dyadic scalar coefficients. Identical safe
function-call ASTs are opaque atoms: no trig, radical, or domain identities are
assumed. Only an algebraically zero cross proves a straight source. Unknown,
nonzero, or budget exhaustion never overrides the numeric source rules. Source
point/first/second jets must separately exist before a caller uses this proof.
"""
import ast
from fractions import Fraction


MAXIMUM_TERMS = 256
MAXIMUM_DEGREE = 64
MAXIMUM_COEFFICIENT_BITS = 4096
MAXIMUM_MULTIPLICATION_STEPS = 32768
MAXIMUM_PROOF_NODES = 8192


class _Unknown(Exception):
    pass


class _Budget:
    def __init__(self):
        self.products = self.nodes = 0
        self.opaque = False

    def node(self):
        self.nodes += 1
        if self.nodes > MAXIMUM_PROOF_NODES:
            raise _Unknown

    def multiply(self, a, b):
        count = len(a)*len(b)
        if count > MAXIMUM_MULTIPLICATION_STEPS-self.products:
            raise _Unknown
        self.products += count


def _coefficient(value):
    if max(abs(value.numerator).bit_length(), value.denominator.bit_length()) > MAXIMUM_COEFFICIENT_BITS:
        raise _Unknown
    return value


def _constant(value):
    value = _coefficient(Fraction.from_float(float(value)))
    return {(): value} if value else {}


def _add(a, b, sign=1):
    result = dict(a)
    for monomial, value in b.items():
        coefficient = _coefficient(result.get(monomial, Fraction(0))+sign*value)
        if coefficient:
            result[monomial] = coefficient
            if len(result) > MAXIMUM_TERMS:
                raise _Unknown
        else:
            result.pop(monomial, None)
    return result


def _monomial(a, b):
    exponents = dict(a)
    for atom, power in b:
        exponents[atom] = exponents.get(atom, 0)+power
    if sum(exponents.values()) > MAXIMUM_DEGREE:
        raise _Unknown
    return tuple(sorted(exponents.items()))


def _multiply(a, b, budget):
    budget.multiply(a, b)
    result = {}
    for left, x in a.items():
        for right, y in b.items():
            monomial = _monomial(left, right)
            coefficient = _coefficient(result.get(monomial, Fraction(0))+x*y)
            if coefficient:
                result[monomial] = coefficient
                if len(result) > MAXIMUM_TERMS:
                    raise _Unknown
            else:
                result.pop(monomial, None)
    return result


def _rational_add(a, b, budget, sign=1):
    return (_add(_multiply(a[0], b[1], budget), _multiply(b[0], a[1], budget), sign),
            _multiply(a[1], b[1], budget))


def _rational_multiply(a, b, budget):
    return _multiply(a[0], b[0], budget), _multiply(a[1], b[1], budget)


def _rational_power(a, exponent, budget):
    if abs(exponent) > MAXIMUM_DEGREE:
        raise _Unknown
    if exponent < 0:
        if not a[0]:
            raise _Unknown
        a = a[1], a[0]
    result = ({(): Fraction(1)}, {(): Fraction(1)})
    for _ in range(abs(exponent)):
        result = _rational_multiply(result, a, budget)
    return result


def _rational(node, budget):
    budget.node()
    one = {(): Fraction(1)}
    if isinstance(node, ast.Constant):
        return _constant(node.value), one
    if isinstance(node, ast.Name):
        if node.id != 's':
            # Caller folds finite variable-free original subtrees first.
            raise _Unknown
        return {(('s', 1),): Fraction(1)}, one
    if isinstance(node, ast.Call):
        key = ast.dump(node, include_attributes=False)
        if len(key) > MAXIMUM_COEFFICIENT_BITS:
            raise _Unknown
        budget.opaque = True
        return {((key, 1),): Fraction(1)}, one
    if isinstance(node, ast.UnaryOp):
        a = _rational(node.operand, budget)
        return ({m: -x for m, x in a[0].items()}, a[1]) if isinstance(node.op, ast.USub) else a
    if not isinstance(node, ast.BinOp):
        raise _Unknown
    a = _rational(node.left, budget)
    if isinstance(node.op, ast.Pow):
        value = node.right
        sign = 1
        if isinstance(value, ast.UnaryOp):
            sign = -1 if isinstance(value.op, ast.USub) else 1
            value = value.operand
        if not isinstance(value, ast.Constant) or value.value != int(value.value):
            raise _Unknown
        return _rational_power(a, sign*int(value.value), budget)
    b = _rational(node.right, budget)
    if isinstance(node.op, ast.Add):
        return _rational_add(a, b, budget)
    if isinstance(node.op, ast.Sub):
        return _rational_add(a, b, budget, -1)
    if isinstance(node.op, ast.Mult):
        return _rational_multiply(a, b, budget)
    if isinstance(node.op, ast.Div) and b[0]:
        return _rational_multiply(a, (b[1], b[0]), budget)
    raise _Unknown


def prove_uncurl_straight_identity(curve_derivatives):
    """true only for algebraically zero C'×C''; None means unproven.

    `curve_derivatives` is the existing safe, constant-folded per-component
    Expression list [C,C',C'',C''']. It avoids new parsing or evaluable code.
    None also covers formal atoms, coefficient/term/degree/work budget limits,
    and invalid rational denominators.  False asserts a nonzero rational
    polynomial only when the AST contained no opaque function calls.
    """
    budget = _Budget()
    try:
        first = [_rational(component[1].tree, budget) for component in curve_derivatives]
        second = [_rational(component[2].tree, budget) for component in curve_derivatives]
        for i, j in ((1, 2), (2, 0), (0, 1)):
            cross = _rational_add(_rational_multiply(first[i], second[j], budget),
                                  _rational_multiply(first[j], second[i], budget), budget, -1)
            if cross[0]:
                return None if budget.opaque else False
        return True
    except (_Unknown, ValueError, OverflowError, ZeroDivisionError, RecursionError):
        return None
