"""Outward-rounded interval Taylor evaluation of the continuation domain.

The intervals bound the analytic parameter formulas and their derivatives,
not the numerical Darboux integrator's position error or self collisions.
Engineering bounds assume IEEE binary64 operations and libm endpoint error
at most two ULPs. They are not a machine-checked real-arithmetic proof.
"""
import math
from functools import lru_cache

import numpy as np

from tessellation_curved_linked_common_parameter_query import Jet,parameter_jets

def down(x):return math.nextafter(math.nextafter(x,-math.inf),-math.inf)
def up(x):return math.nextafter(math.nextafter(x,math.inf),math.inf)

class Interval:
    def __init__(self,lo,hi=None):self.lo=float(lo);self.hi=float(lo if hi is None else hi)
    @staticmethod
    def cast(value):return value if isinstance(value,Interval) else Interval(value)
    def __add__(self,other):
        other=self.cast(other)
        if self.lo==self.hi==0:return other
        if other.lo==other.hi==0:return self
        return Interval(down(self.lo+other.lo),up(self.hi+other.hi))
    __radd__=__add__
    def __neg__(self):return Interval(-self.hi,-self.lo)
    def __sub__(self,other):return self+-self.cast(other)
    def __rsub__(self,other):return self.cast(other)+-self
    def __mul__(self,other):
        other=self.cast(other)
        if self.lo==self.hi==0 or other.lo==other.hi==0:return Interval(0.)
        ends=[a*b for a in (self.lo,self.hi) for b in (other.lo,other.hi)]
        return Interval(down(min(ends)),up(max(ends)))
    __rmul__=__mul__
    def inverse(self):
        if self.lo<=0<=self.hi:raise ValueError('interval denominator straddles zero')
        return Interval(down(1/self.hi),up(1/self.lo))
    def __truediv__(self,other):return self*self.cast(other).inverse()
    def __rtruediv__(self,other):return self.cast(other)*self.inverse()
    def sin(self):
        if not math.isfinite(self.lo+self.hi) or self.hi-self.lo>=math.tau:return Interval(-1,1)
        values=[math.sin(self.lo),math.sin(self.hi)]
        if math.ceil((self.lo-math.pi/2)/math.tau)<=math.floor((self.hi-math.pi/2)/math.tau):values.append(1.)
        if math.ceil((self.lo+math.pi/2)/math.tau)<=math.floor((self.hi+math.pi/2)/math.tau):values.append(-1.)
        return Interval(max(-1,down(min(values))),min(1,up(max(values))))
    def cos(self):
        # Do not shift by a rounded pi/2: cancellation near -pi/2 would
        # lose the constant's rounding uncertainty and fail to enclose cos.
        if not math.isfinite(self.lo+self.hi) or self.hi-self.lo>=math.tau:return Interval(-1,1)
        values=[math.cos(self.lo),math.cos(self.hi)]
        if math.ceil(self.lo/math.tau)<=math.floor(self.hi/math.tau):values.append(1.)
        if math.ceil((self.lo-math.pi)/math.tau)<=math.floor((self.hi-math.pi)/math.tau):values.append(-1.)
        return Interval(max(-1,down(min(values))),min(1,up(max(values))))
    def atan(self):return Interval(down(math.atan(self.lo)),up(math.atan(self.hi)))
    def sqrt(self):
        if self.lo<=0:raise ValueError('interval square root not positive')
        return Interval(down(math.sqrt(self.lo)),up(math.sqrt(self.hi)))


class BoundJet(Jet):
    def __init__(self,values):self.c=np.asarray([Interval.cast(v) for v in values],dtype=object)
    @property
    def value(self):return self.c[0]
    def inverse(self):
        inv=self.value.inverse();out=[inv]
        for n in range(1,len(self.c)):out.append(-sum((self.c[k]*out[n-k] for k in range(1,n+1)),Interval(0))*inv)
        return BoundJet(out)
    def sincos(self):
        sn,cs=[self.value.sin()],[self.value.cos()]
        for n in range(1,len(self.c)):
            sn.append(sum((k*self.c[k]*cs[n-k] for k in range(1,n+1)),Interval(0))/n)
            cs.append(-sum((k*self.c[k]*sn[n-k] for k in range(1,n+1)),Interval(0))/n)
        return BoundJet(sn),BoundJet(cs)
    def atan(self):
        if self.order==0:return BoundJet([self.value.atan()])
        d=self.derivative()/(1+self*self)
        return BoundJet([self.value.atan()]+[d.c[n-1]/n for n in range(1,len(self.c))])
    def sqrt(self):
        out=[self.value.sqrt()]
        for n in range(1,len(self.c)):
            out.append((self.c[n]-sum((out[k]*out[n-k] for k in range(1,n)),Interval(0)))/(2*out[0]))
        return BoundJet(out)


@lru_cache(maxsize=24)
def certify_parameter_domain(radii,harmonics,angle,start,end):
    query={'radii':list(radii),'q1Harmonics':list(harmonics),'firstFoldAngleDeg':angle}
    stack=[(start,end)];count=0;min_speed=math.inf;min_transverse=math.inf
    maximum=4096
    while stack:
        a,b=stack.pop();count+=1
        if count>maximum:
            return {'certified':False,'evaluations':count,'verifiedCells':None,'minimumSpeedLowerBound':None,
                    'minimumTransverseLowerBound':None,'reason':'interval subdivision budget exhausted'}
        try:
            q,_=parameter_jets(query,Interval(a,b),BoundJet,order=2*(len(radii)-1)-1)
            speed=min(x.derivative().value.lo for x in q)
            transverse=min((radii[i+1]*(q[i+1].deviation-q[i].deviation).value.cos()-radii[i]).lo for i in range(len(radii)-1))
            good=speed>.01 and transverse>1e-6
        except (ValueError,OverflowError,ZeroDivisionError):good=False
        if not good:
            if b-a<1e-9:
                return {'certified':False,'evaluations':count,'verifiedCells':None,'minimumSpeedLowerBound':None,
                        'minimumTransverseLowerBound':None,'reason':'regularity could not be bounded'}
            middle=(a+b)/2;stack.extend(((middle,b),(a,middle)));continue
        min_speed=min(min_speed,speed);min_transverse=min(min_transverse,transverse)
    ends=[value.value for s in (start,end) for value in parameter_jets(query,Interval(s),BoundJet,order=2*(len(radii)-1)-1)[0]]
    angular_span=up(max(value.hi for value in ends)-min(value.lo for value in ends))
    return {'certified':True,'evaluations':count,'verifiedCells':(count+1)//2,
            'roundingModel':'binary64-outward-2ulp/libm-endpoints-2ulp-assumed',
            'minimumSpeedLowerBound':min_speed,'minimumTransverseLowerBound':min_transverse,
            'planarAngularSpanUpperBound':angular_span,'planarPaperInjective':angular_span<math.tau-.05,
            'reason':'outward-rounded interval Taylor evaluation covers complete parameter interval'}
