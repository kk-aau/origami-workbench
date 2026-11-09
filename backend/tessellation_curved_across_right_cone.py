"""Exact cone subfamily of Origamica 15.0 FoldAcrossRightBoth.

The notebook's In[3999] and In[4002] save a paired cone example.  These
closed-form surfaces are a restricted analytic result of its 2D, 3D and Both
right-ruling laws.  ``sample`` only evaluates the smooth surfaces; its chords
are not an exact straight-crease FOLD pattern or a collision certificate.
"""

from dataclasses import dataclass
import math


FAMILY = 'cone-across-right'


def _finite(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{name} must be a finite real number.')
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f'{name} must be a finite real number.')
    return result


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


@dataclass(frozen=True)
class ConeAcrossRight:
    """A certified local pair of smooth ruled surfaces over one common arc.

    ``v`` is positive on either side, measured along a unit ruling.  The
    original left cone reaches its apex/focal line at v=1; the right ruling
    has its focal line at v=-1, outside the positive right strip.
    """

    theta_deg: float
    parameter_start: float
    parameter_end: float
    left_width: float
    right_width: float

    def __post_init__(self):
        for name in ('theta_deg', 'parameter_start', 'parameter_end',
                     'left_width', 'right_width'):
            object.__setattr__(self, name, _finite(getattr(self, name), name))
        # The open mathematical bounds avoid the zero-speed and zero-normal-
        # rate branches; a margin keeps the same branch in binary64.
        if not 1e-6 < self.theta_deg < 90 - 1e-6:
            raise ValueError('theta_deg must lie strictly between 0 and 90 degrees.')
        if not 0 < self.parameter_end - self.parameter_start <= math.pi:
            raise ValueError('parameter interval must have length in (0, pi].')
        if not 0 < self.left_width < 1:
            raise ValueError('left_width must stop before the cone apex at v=1.')
        if not 0 < self.right_width <= 1e6:
            raise ValueError('right_width must be positive and at most 1e6.')

    @property
    def theta(self):
        return math.radians(self.theta_deg)

    @property
    def fold_angle_deg(self):
        # The right face orientation reverses across the seam.
        return 180 - 2 * self.theta_deg

    def _u(self, u):
        u = _finite(u, 'u')
        if not self.parameter_start <= u <= self.parameter_end:
            raise ValueError('u lies outside the certified interval.')
        return u

    def _side_distance(self, side, v):
        if side not in ('left', 'right'):
            raise ValueError('side must be left or right.')
        v = _finite(v, 'ruling distance')
        width = self.left_width if side == 'left' else self.right_width
        if not 0 <= v <= width:
            raise ValueError('ruling distance lies outside the certified strip.')
        return v

    def frame(self, u):
        """Return the notebook cone example's paired crease and unit rulings.

        For a=sin(theta), b=cos(theta), flat f=(-sin(a*u),cos(a*u)) and
        folded F=(-a*sin(u),b,a*cos(u)).  Left rulings are -f and -F.
        The notebook's signed 3D construction gives right rulings f and
        (-a*sin(u),-b,a*cos(u)), uniquely when 0<theta<pi/2.
        """
        u = self._u(u)
        a, b = math.sin(self.theta), math.cos(self.theta)
        aq = a * u
        flat = (-math.sin(aq), math.cos(aq))
        folded = (-a * math.sin(u), b, a * math.cos(u))
        return {
            'u': u,
            'flatCrease': flat,
            'foldedCrease': folded,
            'flatLeftRuling': (-flat[0], -flat[1]),
            'flatRightRuling': flat,
            'foldedLeftRuling': tuple(-x for x in folded),
            'foldedRightRuling': (folded[0], -b, folded[2]),
            'foldAngleRad': math.pi - 2 * self.theta,
        }

    def surface(self, space, side, u, v):
        """Evaluate the continuous ruled surface at a certified parameter."""
        if space not in (2, 3):
            raise ValueError('space must be 2 or 3.')
        v = self._side_distance(side, v)
        frame = self.frame(u)
        prefix = 'flat' if space == 2 else 'folded'
        crease = frame[f'{prefix}Crease']
        ruling = frame[f'{prefix}{side.title()}Ruling']
        return tuple(x + v * r for x, r in zip(crease, ruling))

    def differentials(self, space, side, u, v):
        """Return analytic (d/du, d/dv), including the crease-side limit."""
        if space not in (2, 3):
            raise ValueError('space must be 2 or 3.')
        v = self._side_distance(side, v)
        u = self._u(u)
        a = math.sin(self.theta)
        if space == 2:
            du_crease = (-a * math.cos(a * u), -a * math.sin(a * u))
        else:
            du_crease = (-a * math.cos(u), 0.0, -a * math.sin(u))
        factor = 1 - v if side == 'left' else 1 + v
        frame = self.frame(u)
        prefix = 'flat' if space == 2 else 'folded'
        return (tuple(factor * x for x in du_crease),
                frame[f'{prefix}{side.title()}Ruling'])

    def first_form(self, space, side, u, v):
        """Return (E,F,G) of the smooth surface from analytic derivatives."""
        du, dv = self.differentials(space, side, u, v)
        return _dot(du, du), _dot(du, dv), _dot(dv, dv)

    def sample(self, curve_segments=48, ruling_segments=4):
        """Evaluate corresponding points on both exact surfaces.

        There are no triangle faces or FOLD edges in this result.  A chord
        joining adjacent samples generally has different 2D and 3D lengths.
        """
        if type(curve_segments) is not int or not 2 <= curve_segments <= 2048:
            raise ValueError('curve_segments must be an integer in [2, 2048].')
        if type(ruling_segments) is not int or not 1 <= ruling_segments <= 32:
            raise ValueError('ruling_segments must be an integer in [1, 32].')
        if (curve_segments + 1) * (2 * ruling_segments + 1) > 60000:
            raise ValueError('sample grid exceeds 60000 points.')
        us = [self.parameter_start +
              (self.parameter_end - self.parameter_start) * i / curve_segments
              for i in range(curve_segments + 1)]
        frames = [self.frame(u) for u in us]
        flat = [frame['flatCrease'] for frame in frames]
        folded = [frame['foldedCrease'] for frame in frames]
        seam = list(range(len(us)))
        rows = {}
        distances = {}
        for side, width in (('left', self.left_width),
                            ('right', self.right_width)):
            rows[side] = [seam]
            distances[side] = [0.0]
            for j in range(1, ruling_segments + 1):
                v = width * j / ruling_segments
                distances[side].append(v)
                row = []
                for frame in frames:
                    row.append(len(flat))
                    flat.append(tuple(x + v * r for x, r in zip(
                        frame['flatCrease'],
                        frame[f'flat{side.title()}Ruling'])))
                    folded.append(tuple(x + v * r for x, r in zip(
                        frame['foldedCrease'],
                        frame[f'folded{side.title()}Ruling'])))
                rows[side].append(row)
        return {
            'family': FAMILY,
            'parameterValues': us,
            'rulingDistances': distances,
            'flatSamples': flat,
            'foldedSamples': folded,
            'creaseIndices': seam,
            'sideRows': rows,
        }


def certify_cone_across_right(theta_deg=30, parameter_start=-math.pi / 2,
                              parameter_end=math.pi / 2,
                              left_width=0.75, right_width=0.75):
    """Restrict In[3999]/In[4002] to their regular, pre-focal cone family."""
    return ConeAcrossRight(theta_deg, parameter_start, parameter_end,
                           left_width, right_width)
