"""Analytic helix subdomain of Origamica P45 RibbonPair / NRibbonPair.

The source notebook is tmp/Origamica-15.0-reference.nb, lines
307674-309036. This module evaluates a continuous pair of ruled surfaces;
it does not produce a straight-crease FOLD file or certify self-collision.
"""

from dataclasses import dataclass
from math import cos, hypot, isfinite, pi, sin


def _add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def _scale(value, vector):
    return tuple(value * x for x in vector)


@dataclass(frozen=True)
class HelixRibbonPair:
    """A constant-angle helical RibbonPair with a certified regular width.

    The saved example is the default: c(s)=(cos s,sin s,s/2), eta=.35*pi,
    orientation=+1, s in [0,pi], and ruling coordinate in [-.5,.5].
    The flat curve starts at (0,0) with tangent (1,0) at ``start``.
    """

    radius: float = 1.0
    pitch: float = 0.5
    eta: float = 0.35 * pi
    orientation: int = 1
    start: float = 0.0
    end: float = pi
    half_width: float = 0.5

    def __post_init__(self):
        scalars = (self.radius, self.pitch, self.eta, self.start, self.end, self.half_width)
        if any(not isinstance(x, (int, float)) or not isfinite(x) for x in scalars):
            raise ValueError("ribbon parameters must be finite real numbers")
        if self.radius <= 0 or self.pitch <= 0:
            raise ValueError("radius and pitch must be positive")
        if not 0 < self.eta < pi / 2:
            raise ValueError("eta must be in (0, pi/2) for this branch")
        if type(self.orientation) is not int or self.orientation not in (-1, 1):
            raise ValueError("orientation must be +1 or -1")
        if not self.start < self.end or self.end - self.start > pi:
            raise ValueError("the finite parameter interval must span at most pi")
        try:
            derived = (
                self.speed,
                self.speed * self.speed,
                self.curvature,
                self.torsion,
                self.flat_turn_rate,
                *self.ruling_coefficients,
                self.focal_distance,
                self.speed / self.flat_turn_rate,
            )
        except (OverflowError, ZeroDivisionError) as exc:
            raise ValueError("derived ribbon geometry is not finite") from exc
        if not all(isfinite(value) for value in derived):
            raise ValueError("derived ribbon geometry is not finite")
        if self.half_width <= 0 or self.half_width >= self.focal_distance:
            raise ValueError("half_width must be positive and below the focal distance")

    @property
    def speed(self):
        return hypot(self.radius, self.pitch)

    @property
    def curvature(self):
        return (self.radius / self.speed) / self.speed

    @property
    def torsion(self):
        return (self.pitch / self.speed) / self.speed

    @property
    def flat_turn_rate(self):
        return (self.radius / self.speed) * cos(self.eta)

    @property
    def ruling_coefficients(self):
        normal = hypot(self.curvature * sin(self.eta), self.torsion)
        return (-self.torsion / normal, self.curvature * sin(self.eta) / normal)

    @property
    def focal_distance(self):
        _, sin_rho = self.ruling_coefficients
        return self.speed * sin_rho / self.flat_turn_rate

    def _check_parameter(self, s, v=0.0):
        if not isinstance(s, (int, float)) or not isfinite(s) or not self.start <= s <= self.end:
            raise ValueError("s is outside the certified parameter interval")
        if not isinstance(v, (int, float)) or not isfinite(v) or abs(v) > self.half_width:
            raise ValueError("v is outside the certified ruling width")

    def frame(self, s):
        """Return paired base curves, directors, and unit tangent frames."""
        self._check_parameter(s)
        radius, pitch, speed = self.radius, self.pitch, self.speed
        tangent3 = (-radius * sin(s) / speed, radius * cos(s) / speed, pitch / speed)
        normal3 = (-cos(s), -sin(s), 0.0)
        binormal3 = (pitch * sin(s) / speed, -pitch * cos(s) / speed, radius / speed)
        left3 = _add(_scale(cos(self.eta), normal3), _scale(-sin(self.eta), binormal3))
        surface_normal3 = _add(_scale(sin(self.eta), normal3), _scale(cos(self.eta), binormal3))
        angle = self.flat_turn_rate * (s - self.start)
        tangent2 = (cos(angle), sin(angle))
        left2 = (-sin(angle), cos(angle))
        cos_rho, sin_rho = self.ruling_coefficients
        director3 = _scale(
            self.orientation,
            _add(_scale(cos_rho, tangent3), _scale(sin_rho, left3)),
        )
        director2 = _scale(
            self.orientation,
            _add(_scale(cos_rho, tangent2), _scale(sin_rho, left2)),
        )
        flat_radius = speed / self.flat_turn_rate
        return {
            "flat_base": (flat_radius * sin(angle), flat_radius * (1.0 - cos(angle))),
            "flat_director": director2,
            "flat_tangent": tangent2,
            "flat_left": left2,
            "space_base": (radius * cos(s), radius * sin(s), pitch * s),
            "space_director": director3,
            "space_tangent": tangent3,
            "space_left": left3,
            "space_normal": surface_normal3,
        }

    def surface(self, space, s, v):
        self._check_parameter(s, v)
        frame = self.frame(s)
        if space not in ("flat", "space"):
            raise ValueError("space must be 'flat' or 'space'")
        return _add(frame[f"{space}_base"], _scale(v, frame[f"{space}_director"]))

    def differentials(self, space, s, v):
        """Return exact parameter derivatives (dX/ds, dX/dv)."""
        self._check_parameter(s, v)
        if space not in ("flat", "space"):
            raise ValueError("space must be 'flat' or 'space'")
        frame = self.frame(s)
        tangent = frame[f"{space}_tangent"]
        left = frame[f"{space}_left"]
        cos_rho, sin_rho = self.ruling_coefficients
        turn = self.orientation * self.flat_turn_rate
        ds = _add(
            _scale(self.speed - v * turn * sin_rho, tangent),
            _scale(v * turn * cos_rho, left),
        )
        return ds, frame[f"{space}_director"]

    def first_form(self, v):
        """Common exact first fundamental form (E,F,G) and area determinant."""
        self._check_parameter(self.start, v)
        cos_rho, sin_rho = self.ruling_coefficients
        turn = self.orientation * self.flat_turn_rate
        e = self.speed**2 - 2.0 * self.speed * v * turn * sin_rho + (v * self.flat_turn_rate) ** 2
        f = self.orientation * self.speed * cos_rho
        g = 1.0
        area_det = (self.speed * sin_rho - v * turn) ** 2
        return e, f, g, area_det

    def sample(self, curve_segments=200, ruling_segments=20):
        """Paired point samples, with shared base-curve indices and no faces."""
        if type(curve_segments) is not int or curve_segments < 1:
            raise ValueError("curve_segments must be a positive integer")
        if type(ruling_segments) is not int or ruling_segments < 2 or ruling_segments % 2:
            raise ValueError("ruling_segments must be a positive even integer")
        flat, space, parameters, base_indices = [], [], [], []
        row = ruling_segments + 1
        for i in range(curve_segments + 1):
            s = self.start + (self.end - self.start) * i / curve_segments
            base_indices.append(i * row + ruling_segments // 2)
            for j in range(row):
                v = self.half_width * (2.0 * j / ruling_segments - 1.0)
                parameters.append((s, v))
                flat.append(self.surface("flat", s, v))
                space.append(self.surface("space", s, v))
        return {
            "parameters": parameters,
            "flat": flat,
            "space": space,
            "base_indices": base_indices,
            "focal_distance": self.focal_distance,
            "sampled_mesh_exact_isometry": False,
            "self_collision_checked": False,
        }


def certify_helix_ribbon_pair(**kwargs):
    """Construct the verified constant-helix branch; defaults to In[3855]."""
    return HelixRibbonPair(**kwargs)
