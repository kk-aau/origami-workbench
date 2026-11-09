"""Origamica In[3984]/In[3987]: a circular 2D fold with linear angle.

This is a planar ruled-neighborhood evaluator.  The notebook examples do not
provide a paired 3D solution or a table of Wolfram output coordinates.
Samples are drawing aids, never an exact straight-crease FOLD graph.
"""

from dataclasses import dataclass
import math


FAMILY = 'linear-angle-circle-across-right-2d'


def _finite(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{name} must be a finite real number.')
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f'{name} must be a finite real number.')
    return result


@dataclass(frozen=True)
class LinearAngleCircleAcrossRight2D:
    angle_slope: float = .5
    parameter_start: float = .001
    parameter_end: float = math.pi / 2
    left_width: float = .75
    right_width: float = 1.0

    def __post_init__(self):
        for name in ('angle_slope', 'parameter_start', 'parameter_end',
                     'left_width', 'right_width'):
            object.__setattr__(self, name, _finite(getattr(self, name), name))
        if not .1 <= self.angle_slope <= 1:
            raise ValueError('angle_slope must be in [0.1, 1].')
        if not .001 <= self.parameter_start < self.parameter_end <= math.pi / 2:
            raise ValueError('parameter interval must stay in [0.001, pi/2].')
        if not 0 < self.left_width < 1:
            raise ValueError('left_width must stop before the circle center at v=1.')
        if not 0 < self.right_width <= 2:
            raise ValueError('right_width must be in (0, 2].')

    def _u(self, u):
        u = _finite(u, 'u')
        if not self.parameter_start <= u <= self.parameter_end:
            raise ValueError('u lies outside the certified interval.')
        return u

    def _v(self, side, v):
        if side not in ('left', 'right'):
            raise ValueError('side must be left or right.')
        v = _finite(v, 'ruling distance')
        width = self.left_width if side == 'left' else self.right_width
        if not 0 <= v <= width:
            raise ValueError('ruling distance lies outside the certified strip.')
        return v

    def frame(self, u):
        """Evaluate the exact In[3983] right-ruling law on the saved family."""
        u = self._u(u)
        tangent = (-math.sin(u), math.cos(u))
        left_normal = (-math.cos(u), -math.sin(u))
        t = math.tan(self.angle_slope * u / 2)
        d = math.hypot(self.angle_slope, t)
        alpha, beta = -self.angle_slope / d, -t / d
        right = (alpha * tangent[0] + beta * left_normal[0],
                 alpha * tangent[1] + beta * left_normal[1])
        return {
            'u': u,
            'crease': (math.cos(u), math.sin(u)),
            'leftRuling': left_normal,
            'rightRuling': right,
            'foldAngleRad': self.angle_slope * u,
            'rightTangentCoefficient': alpha,
            'rightLeftNormalCoefficient': beta,
        }

    def surface(self, side, u, v):
        v = self._v(side, v)
        frame = self.frame(u)
        ruling = frame['leftRuling' if side == 'left' else 'rightRuling']
        return tuple(x + v * r for x, r in zip(frame['crease'], ruling))

    def signed_area_jacobian(self, side, u, v):
        """Exact signed det(surface_u,surface_v), without sampled derivatives.

        The right expression is strictly negative for u>0 and v>=0.  Thus
        its focal set is behind the right ruling, while the left vanishes at
        v=1.  This certifies local immersion, not global injectivity.
        """
        v = self._v(side, v)
        u = self._u(u)
        if side == 'left':
            return 1 - v
        k = self.angle_slope
        t = math.tan(k * u / 2)
        d = math.hypot(k, t)
        delta_prime = k * k * (1 + t * t) / (2 * d * d)
        return -t / d - v * (1 + delta_prime)

    def sample(self, curve_segments=96):
        """Sample exact planar curves; no faces or 3D counterpart are made."""
        if type(curve_segments) is not int or not 16 <= curve_segments <= 256:
            raise ValueError('curve_segments must be an integer in [16, 256].')
        us = [self.parameter_start +
              (self.parameter_end - self.parameter_start) * i / curve_segments
              for i in range(curve_segments + 1)]
        us[0], us[-1] = self.parameter_start, self.parameter_end
        frames = [self.frame(u) for u in us]
        return {
            'family': FAMILY,
            'parameterValues': us,
            'crease': [frame['crease'] for frame in frames],
            'leftBoundary': [self.surface('left', u, self.left_width) for u in us],
            'rightBoundary': [self.surface('right', u, self.right_width) for u in us],
            'leftRulings': [frame['leftRuling'] for frame in frames],
            'rightRulings': [frame['rightRuling'] for frame in frames],
            'foldAnglesRad': [frame['foldAngleRad'] for frame in frames],
        }


def certify_linear_angle_circle_across_right_2d(
        angle_slope=.5, parameter_start=.001, parameter_end=math.pi / 2,
        left_width=.75, right_width=1.0):
    """Construct the regular saved 2D family with explicit pre-focal widths."""
    return LinearAngleCircleAcrossRight2D(
        angle_slope, parameter_start, parameter_end, left_width, right_width)
