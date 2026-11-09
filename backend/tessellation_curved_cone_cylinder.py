"""Paired ruled-surface folds from Origamica 15.0, section 45.

The two public builders reproduce the notebook's saved cylinder-to-cone and
cone-to-cylinder examples (In[4047]/In[4050] and In[4054]/In[4057]).  A frame
has the original six-result contract ``(b2, d2, bb2, dd2, f, ff)`` plus the
given first surface.  Coordinates are evaluated from the notebook's algebra,
not from a polygonal approximation or an interpolated Wolfram ``Out`` cell.

The surfaces are *smooth ruled parametrizations*.  Neither a straight-crease
FOLD graph nor collision-free manufacturing is certified; the notebook even
uses the first saved example to show a self-intersection on the back side.
"""

from dataclasses import dataclass
import math


def _finite(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{name} must be a finite real number.')
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f'{name} must be a finite real number.')
    return result


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _add_scaled(a, b, scale):
    return tuple(x + scale * y for x, y in zip(a, b))


def _lerp(a, b, t):
    return tuple(x + t * (y - x) for x, y in zip(a, b))


def _unit(a):
    length = math.sqrt(_dot(a, a))
    if not math.isfinite(length) or length <= 1e-12:
        raise ValueError('The second-surface director reaches a singularity.')
    return tuple(x / length for x in a)


@dataclass(frozen=True)
class PairedRuledSurfaceFold:
    """The original six-function contract, with a common point sampler.

    ``surface('first', u, t, ...)`` travels from the given directrix to the
    crease; ``surface('second', u, t, ...)`` travels from crease to the new
    directrix.  ``t`` is in [0, 1].  One boundary is an apex and is therefore
    a singular *parametrization boundary*, even though its point is defined.
    """

    kind: str
    parameter_start: float
    parameter_end: float
    cone_angle_deg: float | None = None
    cylinder_axis_offset: float | None = None

    def __post_init__(self):
        if self.kind not in ('cylinder-to-cone', 'cone-to-cylinder'):
            raise ValueError('Unknown ruled-surface conversion kind.')

    @property
    def singular_boundary(self):
        return ('second', 1.0) if self.kind == 'cylinder-to-cone' else ('first', 0.0)

    @property
    def collision_checked(self):
        return False

    def frame(self, u):
        """Evaluate b1,d1,bb1,dd1,b2,d2,bb2,dd2,f,ff at one parameter."""
        u = _finite(u, 'u')
        if not self.parameter_start <= u <= self.parameter_end:
            raise ValueError('u is outside the validated parameter interval.')
        if self.kind == 'cylinder-to-cone':
            return _cylinder_to_cone_frame(u)
        return _cone_to_cylinder_frame(u, math.radians(self.cone_angle_deg),
                                       self.cylinder_axis_offset)

    def surface(self, side, u, t, *, folded=False):
        """Return paired 2D or 3D surface coordinates at the same (u,t)."""
        if side not in ('first', 'second'):
            raise ValueError("side must be 'first' or 'second'.")
        t = _finite(t, 't')
        if not 0 <= t <= 1:
            raise ValueError('t must be in [0, 1].')
        frame = self.frame(u)
        if side == 'first':
            a, b = ('bb1', 'ff') if folded else ('b1', 'f')
        else:
            a, b = ('ff', 'bb2') if folded else ('f', 'b2')
        return _lerp(frame[a], frame[b], t)


def _cylinder_to_cone_frame(u):
    """In[4047]/In[4050]: upright cylinder to a specified cone point."""
    b1, d1 = (-1.0, u), (1.0, 0.0)
    bb1, dd1 = (math.cos(u), math.sin(u), -1.0), (0.0, 0.0, 1.0)
    b2, bb2 = (2.0, 0.0), (2.0, 0.0, 1.0)
    flat_gap, spatial_gap = _sub(b2, b1), _sub(bb2, bb1)
    numerator = _dot(flat_gap, flat_gap) - _dot(spatial_gap, spatial_gap)
    denominator = 2 * (_dot(flat_gap, d1) - _dot(spatial_gap, dd1))
    # For this saved example denominator is exactly 2 and the expression
    # simplifies to v(u)=u^2/2+2*cos(u).
    v = numerator / denominator
    f, ff = _add_scaled(b1, d1, v), _add_scaled(bb1, dd1, v)
    d2, dd2 = _unit(_sub(b2, f)), _unit(_sub(bb2, ff))
    # The notebook chooses one sign at u_i=0; that sign is +1 here.
    return {'b1': b1, 'd1': d1, 'bb1': bb1, 'dd1': dd1,
            'b2': b2, 'd2': d2, 'bb2': bb2, 'dd2': dd2,
            'f': f, 'ff': ff, 'sourceRulingParameter': v,
            'orientationSign': 1}


def _cone_to_cylinder_frame(u, phi, epsilon):
    """In[4054]/In[4057]: cone to two specified parallel axis lines."""
    c, q = math.cos(phi), math.sin(phi)
    b1, bb1 = (0.0, 0.0), (0.0, 0.0, 0.0)
    d1 = (math.cos(q * u), math.sin(q * u))
    dd1 = (c, -q * math.cos(u), q * math.sin(u))
    p2, d2 = (1.0 + epsilon, 0.0), (-1.0, 0.0)
    pp2 = ((1.0 - epsilon) * c, -(1.0 + epsilon) * q, 0.0)
    dd2 = (c, q, 0.0)
    numerator = _dot(_sub(p2, b1), d2) - _dot(_sub(pp2, bb1), dd2)
    denominator = _dot(d1, d2) - _dot(dd1, dd2)
    # denominator = -2[cos^2(q*u/2)-q^2*cos^2(u/2)] < 0 in the
    # validated domain 0<q<=1/2 and 0<=u<=pi.
    v = numerator / denominator
    f, ff = _add_scaled(b1, d1, v), _add_scaled(bb1, dd1, v)
    b2 = _sub(f, tuple(_dot(_sub(f, p2), d2) * x for x in d2))
    bb2 = _sub(ff, tuple(_dot(_sub(ff, pp2), dd2) * x for x in dd2))
    return {'b1': b1, 'd1': d1, 'bb1': bb1, 'dd1': dd1,
            'b2': b2, 'd2': d2, 'bb2': bb2, 'dd2': dd2,
            'f': f, 'ff': ff, 'sourceRulingParameter': v,
            'flatAxisPoint': p2, 'foldedAxisPoint': pp2}


def fold_surface_to_cone_example(parameter_start=-math.pi / 3,
                                 parameter_end=math.pi):
    """Validated interval subset of the notebook's cylinder-to-cone example."""
    start = _finite(parameter_start, 'parameter_start')
    end = _finite(parameter_end, 'parameter_end')
    if not -math.pi / 3 <= start < end <= math.pi:
        raise ValueError('The cone example interval must lie within [-π/3, π].')
    return PairedRuledSurfaceFold('cylinder-to-cone', start, end)


def fold_surface_to_cylinder_example(cone_angle_deg=30,
                                     cylinder_axis_offset=.25,
                                     parameter_start=0,
                                     parameter_end=math.pi):
    """Validated cone-to-cylinder family containing the saved 30° example.

    The restricted 5°..30° opening keeps the planar generator angle in
    [0,π/2] over the whole interval, so both strips remain regular away from
    the original cone apex.  Positive axis offset avoids a zero-width second
    strip at u=0.  This is deliberately narrower than the symbolic API.
    """
    angle = _finite(cone_angle_deg, 'cone_angle_deg')
    epsilon = _finite(cylinder_axis_offset, 'cylinder_axis_offset')
    start = _finite(parameter_start, 'parameter_start')
    end = _finite(parameter_end, 'parameter_end')
    if not 5 <= angle <= 30:
        raise ValueError('The validated cone angle is in [5°, 30°].')
    if not 0 < epsilon <= 2:
        raise ValueError('cylinder_axis_offset must be in (0, 2].')
    if not 0 <= start < end <= math.pi:
        raise ValueError('The cylinder example interval must lie within [0, π].')
    return PairedRuledSurfaceFold('cone-to-cylinder', start, end, angle, epsilon)
