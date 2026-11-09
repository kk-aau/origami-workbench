"""Origamica In[2681] vector-valued Squaring-the-Circle ring functions.

F(x,i) = Sign[x] Abs[x]^(1/(i+1)); pfn[i](phi) and rfn[i](phi) use
R * (F(cos(phi),i), F(sin(phi),i)). `power` below is i+1.
"""
import math


def validate_signed_power(value):
    if type(value) is not int or not 1 <= value <= 8:
        raise ValueError('圆到方形二维向量幂须为 1–8 的整数。')
    return value


class SignedPowerSuperellipse:
    def __init__(self, power):
        self.power = validate_signed_power(power)
        self.maximum = 2 ** (.5-1/(2*power))

    def point(self, radius, phi):
        exponent = 1/self.power
        quadrant = round(phi/(math.pi/2))
        if abs(phi-quadrant*(math.pi/2)) <= 4*math.ulp(phi if phi else 1.):
            cosine, sine = ((1., 0.), (0., 1.), (-1., 0.), (0., -1.))[quadrant % 4]
        else:
            cosine, sine = math.cos(phi), math.sin(phi)
        return [radius*math.copysign(abs(value)**exponent, value)
                for value in (cosine, sine)]

    def radial_radius(self, radius, theta):
        exponent = 2*self.power
        denominator = abs(math.cos(theta))**exponent+abs(math.sin(theta))**exponent
        return radius/denominator**(1/exponent)

    def radial_bounds(self, radius, low, high):
        """Exact angular extrema: axes are minima, diagonals maxima."""
        if high-low >= math.tau:
            return radius, radius*self.maximum
        sample = [low, high]
        step = math.pi/4
        sample += [step*k for k in range(math.ceil(low/step), math.floor(high/step)+1)]
        values = [self.radial_radius(radius, theta) for theta in sample]
        margin = 1e-12*max(1., radius)
        return max(0., min(values)-margin), max(values)+margin
