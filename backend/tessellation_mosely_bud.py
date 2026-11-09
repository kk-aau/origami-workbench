"""Real branch of Origamica In[3456] MoselyBudCrossSectionPt on 0 <= r <= 1.

The notebook writes z with complex incomplete/complete elliptic integrals.
On its saved real branch x'(r)^2 + z'(r)^2 = 1, z'(r) >= 0, z(0) = 0.
The substitution r = sin(u)^2 removes both endpoint square roots and gives
z(r) = int_0^asin(sqrt(r)) sqrt(2) sin(2u)^2 / sqrt(1+sin(2u)^2) du.
This is a profile sampler, not a certificate for a fabricated bud.
"""

import math

_STEPS = 512


def _integrand(u):
    sine = math.sin(2*u)
    return math.sqrt(2)*sine*sine/math.sqrt(1+sine*sine)


def _integral(end):
    step = end/_STEPS
    total = _integrand(0.) + _integrand(end)
    for index in range(1, _STEPS):
        total += (4 if index % 2 else 2)*_integrand(index*step)
    return total*step/3


_HEIGHT = _integral(math.pi/2)


def mosely_bud_point(r):
    if type(r) not in (int, float) or not math.isfinite(r) or not 0 <= r <= 1:
        raise ValueError('MoselyBudCrossSectionPt 的实数范围为 0≤r≤1。')
    x = .5*(math.sqrt(1+4*r-4*r*r)-1)
    # The integrand is symmetric around r=1/2. This avoids endpoint
    # cancellation of the notebook's complex elliptic expression.
    z = (_HEIGHT - _integral(math.asin(math.sqrt(1-r))) if r > .5
         else _integral(math.asin(math.sqrt(r))))
    return [max(0., x), z]


def saved_mosely_bud_section():
    """Both In[3481]/In[3482] multiply the original z by -1."""
    return [[x, 0. if z == 0 else -z]
            for x, z in (mosely_bud_point(i/20) for i in range(21))]
