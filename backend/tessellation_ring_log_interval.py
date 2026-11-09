"""Outward bounds for the smooth arguments of the finite Ring Log subset.

IEEE binary64 arithmetic with two outward ULPs per operation; libm endpoint
errors are assumed <=2 ULPs. This is an engineering enclosure, not a Wolfram
runtime or a machine-checked real-arithmetic certificate. The caller retains
its existing C1 gate for conditional/piecewise arguments.
"""
import ast,math

def down(x):return math.nextafter(math.nextafter(x,-math.inf),-math.inf)
def up(x):return math.nextafter(math.nextafter(x,math.inf),math.inf)
class I:
 def __init__(self,lo,hi=None):self.lo=float(lo);self.hi=float(lo if hi is None else hi)
 def pair(self):return (self.lo,self.hi)
 def __add__(self,b):return I(down(self.lo+b.lo),up(self.hi+b.hi))
 def __neg__(self):return I(-self.hi,-self.lo)
 def __sub__(self,b):return self+-b
 def __mul__(self,b):
  if self.lo==self.hi==0 or b.lo==b.hi==0:return I(0)
  ends=[x*y for x in self.pair() for y in b.pair()];return I(down(min(ends)),up(max(ends)))
 def __truediv__(self,b):
  if b.lo<=0<=b.hi:raise ValueError('Log 参数式分母区间跨零，未证明正域。')
  return self*I(down(1/b.hi),up(1/b.lo))
 def power(self,n):
  if n==0:return I(1)
  ends=[self.lo**n,self.hi**n];return I(down(0 if n%2==0 and self.lo<=0<=self.hi else min(ends)),up(max(ends)))
 def trig(self,cosine=False):
  if not math.isfinite(self.lo+self.hi) or self.hi-self.lo>=math.tau:return I(-1,1)
  f=math.cos if cosine else math.sin;ends=[f(self.lo),f(self.hi)]
  # Conservative critical-point windows include the rounding of pi and tau.
  for centre,value in ((0.,1.),(math.pi,-1.)) if cosine else ((math.pi/2,1.),(-math.pi/2,-1.)):
   a=(self.lo-centre)/math.tau;b=(self.hi-centre)/math.tau
   if math.ceil(down(a)-8*math.ulp(a))<=math.floor(up(b)+8*math.ulp(b)):ends.append(value)
  return I(max(-1.,down(min(ends))),min(1.,up(max(ends))))
 def unary(self,name):
  if name in ('sqrt','log') and self.lo<=0:raise ValueError('Log 参数及其根式/嵌套Log须在完整区间严格为正；零、负值或无法证明的区间拒绝。')
  f={'exp':math.exp,'sqrt':math.sqrt,'log':math.log}[name];return I(down(f(self.lo)),up(f(self.hi)))
 def hull(self,b):return I(min(self.lo,b.lo),max(self.hi,b.hi))

def argument_bounds(node,low,high,index,constant):
 """Enclose the argument AND its phi derivative by independent operations."""
 def visit(n):
  if isinstance(n,ast.Constant):return I(n.value),I(0)
  if isinstance(n,ast.Name):
   if n.id=='phi':return I(low,high),I(1)
   if n.id=='i' and index is not None:return I(index),I(0)
   v={'pi':math.pi,'tau':math.tau,'e':math.e,'degree':math.pi/180}.get(n.id)
   if v is None:raise ValueError('Log 参数含未解析的非数值符号。')
   return I(down(v),up(v)),I(0)
  if isinstance(n,ast.UnaryOp):
   a,da=visit(n.operand);return (-a,-da) if isinstance(n.op,ast.USub) else (a,da)
  if isinstance(n,ast.BinOp):
   a,da=visit(n.left)
   if isinstance(n.op,ast.Pow):
    exponent=constant(n.right,index)
    if not exponent.is_integer() or not 0<=exponent<=4:raise ValueError('Log 参数只支持现有有限整数幂。')
    k=int(exponent);return a.power(k),I(0) if k==0 else I(k)*a.power(k-1)*da
   b,db=visit(n.right)
   if isinstance(n.op,ast.Add):return a+b,da+db
   if isinstance(n.op,ast.Sub):return a-b,da-db
   if isinstance(n.op,ast.Mult):return a*b,da*b+a*db
   return a/b,(da*b-a*db)/b.power(2)
  if isinstance(n,ast.Call):
   name=n.func.id
   if name=='_ring_log':name='log'
   if name in ('_lexical_module','_lexical_function'):return visit(n.args[-1])
   if name in ('sin','cos','exp','sqrt','log'):
    a,da=visit(n.args[0])
    if name=='sin':return a.trig(),a.trig(True)*da
    if name=='cos':return a.trig(True),-a.trig()*da
    v=a.unary(name);slope=v if name=='exp' else I(1)/a if name=='log' else I(1)/(I(2)*v)
    return v,slope*da
   # A piecewise Log argument would require an additional selected-domain
   # certificate; do not infer positive values from sampled branches.
  raise ValueError('Log 正域证明仅支持光滑数值参数式；分支须置于Log外部，不能用采样通过。')
 value,derivative=visit(node)
 if any(not math.isfinite(x) for row in (value,derivative) for x in row.pair()):raise ValueError('Log 参数或导数区间不有限。')
 return value,derivative
