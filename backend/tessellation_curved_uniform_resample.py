"""Explicit uniform resampling and bounded local-polynomial numerical output.

InterpolationPoints is the number of intervals: the original Table includes
both endpoints, so it contains ip+1 samples. No Wolfram adaptive interpolation
or unspecified higher-order stencil is claimed here.
"""
import math


class UniformLinear:
    def __init__(self, start, end, values):
        self.start, self.end = start, end
        self.values = [list(row) for row in values]
        self.intervals = len(values)-1
        if not self.intervals or any(len(row) != len(values[0]) or any(not math.isfinite(v) for v in row) for row in values):
            raise ValueError('nonfinite or inconsistent uniform samples')

    def evaluate(self, parameter):
        if not self.start <= parameter <= self.end:
            raise ValueError('uniform interpolation does not extrapolate')
        position = (parameter-self.start)/(self.end-self.start)*self.intervals
        nearest = round(position)
        if abs(position-nearest) <= 8*math.ulp(max(1., abs(position))): position = float(nearest)
        cell = min(self.intervals-1, max(0, math.floor(position)))
        weight = position-cell
        first, second = self.values[cell:cell+2]
        step = (self.end-self.start)/self.intervals
        value = [a+(b-a)*weight for a, b in zip(first, second)]
        derivative = [(b-a)/step for a, b in zip(first, second)]
        return value, derivative


class UniformPolynomial(UniformLinear):
    """Specified local degree-two/three/four polynomials, not a WL algorithm.

    Each grid cell uses order+1 consecutive samples. The centered stencil is
    clamped at the original endpoints. Values are continuous at knots; first
    derivatives need not be. No tangent/frame normalization is applied.
    """
    def __init__(self, start, end, values, order):
        super().__init__(start, end, values)
        if type(order) is not int or not 2 <= order <= 4 or self.intervals < order:
            raise ValueError('insufficient samples or unsupported polynomial degree')
        self.order = order

    def evaluate(self, parameter, side='right'):
        if not self.start <= parameter <= self.end or side not in ('right', 'left'):
            raise ValueError('uniform interpolation does not extrapolate')
        position = (parameter-self.start)/(self.end-self.start)*self.intervals
        nearest = round(position)
        if abs(position-nearest) <= 8*math.ulp(max(1., abs(position))): position = float(nearest)
        cell = min(self.intervals-1, max(0, math.floor(position)))
        if side == 'left' and position == nearest and 0 < nearest < self.intervals: cell = nearest-1
        first = min(self.intervals-self.order, max(0, cell-self.order//2))
        z = position-first; basis, slopes = [], []
        for j in range(self.order+1):
            factors = [(z-m)/(j-m) for m in range(self.order+1) if m != j]
            basis.append(math.prod(factors))
            slopes.append(math.fsum(math.prod((z-m)/(j-m) for m in range(self.order+1) if m != j and m != r)/(j-r)
                                    for r in range(self.order+1) if r != j))
        rows = self.values[first:first+self.order+1]
        step = (self.end-self.start)/self.intervals
        value = [math.fsum(row[k]*w for row, w in zip(rows, basis)) for k in range(len(rows[0]))]
        derivative = [math.fsum(row[k]*w for row, w in zip(rows, slopes))/step for k in range(len(rows[0]))]
        return value, derivative


def uniform_interpolator(start, end, values, order):
    return UniformLinear(start, end, values) if order == 1 else UniformPolynomial(start, end, values, order)
