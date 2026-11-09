"""In[3777]: bounded two-variable SurfaceSystem, including mixed jets.

All twelve/fifteen rules are evaluated from the actual saved AST. Rectangle
regularity uses two-variable outward intervals, not a finite slice. Numeric
principal pairs reproduce the geometric eigensystem modulo permutation/sign;
they do not claim Wolfram's symbolic eigenvector gauge or continuity.
"""
import ast
import math
from fractions import Fraction

import numpy as np
import sympy as sp
import mpmath as mp

from tessellation_curved_generic_linked_expression import Expression, GenericLinkedError, normalize_expression
from tessellation_curved_linked_common_interval import Interval, down, up
from tessellation_curved_matched_pair_query import algebraic_budget, simplified

FAMILY='surface-system-generic-native'
RESULT_FAMILY='origamica-generic-surface-system'
ROUNDING='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'
CERTIFICATION_BUDGET=1023
PRESET={'family':FAMILY,'surface':['2*u','2*sin(v)','2*(1-cos(v))'],
        'uStart':0.,'uEnd':1.,'vStart':0.,'vEnd':1.5,'uSegments':16,'vSegments':16,'principalAnalysis':True}
NORMAL_FAMILY='surface-normal-generic-native'
NORMAL_PRESET={**{k:v for k,v in PRESET.items() if k!='principalAnalysis'},
               'family':NORMAL_FAMILY,'surfaceOrientation':1}
BASIC_RULES=['SurfaceTangentU','SurfaceTangentV','SurfaceNormal','FundamentalFormE','FundamentalFormF',
             'FundamentalFormG','FundamentalFormL','FundamentalFormM','FundamentalFormN',
             'GaussianCurvature','MeanCurvature','CurvatureMatrix']
PRINCIPAL_RULES=['PrincipalCurvatures','PrincipalDirectionsUV','PrincipalDirections']


class GenericSurfaceSystemError(GenericLinkedError):pass


def square(x):
    if not isinstance(x,Interval):return x*x
    lo=0. if x.lo<=0<=x.hi else min(x.lo*x.lo,x.hi*x.hi)
    return Interval(0. if lo==0 else down(lo),up(max(x.lo*x.lo,x.hi*x.hi)))


class SurfaceJet:
    """Actual derivatives [f,fu,fv,fuu,fuv,fvv], including interval values."""
    def __init__(self,c):self.c=list(c)
    @property
    def value(self):return self.c[0]
    @classmethod
    def constant(cls,x,interval=False):
        z=Interval(0.) if interval or isinstance(x,Interval) else 0.
        return cls([Interval.cast(x) if interval else x,z,z,z,z,z])
    @classmethod
    def variable(cls,x,axis):
        out=cls.constant(x,isinstance(x,Interval));out.c[axis+1]=Interval(1.) if isinstance(x,Interval) else 1.;return out
    def other(self,x):return x if isinstance(x,SurfaceJet) else self.constant(x,isinstance(self.value,Interval))
    def __add__(self,x):return SurfaceJet([a+b for a,b in zip(self.c,self.other(x).c)])
    __radd__=__add__
    def __neg__(self):return SurfaceJet([-a for a in self.c])
    def __sub__(self,x):return self+-self.other(x)
    def __rsub__(self,x):return self.other(x)+-self
    def __mul__(self,x):
        a,b=self.c,self.other(x).c
        return SurfaceJet([a[0]*b[0],a[1]*b[0]+a[0]*b[1],a[2]*b[0]+a[0]*b[2],
                           a[3]*b[0]+2*a[1]*b[1]+a[0]*b[3],
                           a[4]*b[0]+a[1]*b[2]+a[2]*b[1]+a[0]*b[4],
                           a[5]*b[0]+2*a[2]*b[2]+a[0]*b[5]])
    __rmul__=__mul__
    def compose(self,value,first,second):
        a=self.c
        return SurfaceJet([value,first*a[1],first*a[2],first*a[3]+second*square(a[1]),
                           first*a[4]+second*a[1]*a[2],first*a[5]+second*square(a[2])])
    def inverse(self):
        x=self.value
        inv=x.inverse() if isinstance(x,Interval) else 1/x
        if not isinstance(x,Interval):
            a=self.c;yu=-(a[1]/x)*inv;yv=-(a[2]/x)*inv
            return SurfaceJet([inv,yu,yv,-((a[3]/x)*inv+2*(a[1]/x)*yu),
                               -((a[4]/x)*inv+(a[1]/x)*yv+(a[2]/x)*yu),
                               -((a[5]/x)*inv+2*(a[2]/x)*yv)])
        return self.compose(inv,-square(inv),2*inv*square(inv))
    def __truediv__(self,x):return self*self.other(x).inverse()
    def __rtruediv__(self,x):return self.other(x)*self.inverse()
    def __pow__(self,n):
        if n<0:return self.inverse()**-n
        out=self.constant(1.,isinstance(self.value,Interval))
        for _ in range(n):out=out*self
        return out
    def sincos(self):
        x=self.value
        s,c=(x.sin(),x.cos()) if isinstance(x,Interval) else (math.sin(x),math.cos(x))
        return self.compose(s,c,-s),self.compose(c,-s,-c)
    def tan(self):
        s,c=self.sincos();return s/c
    def atan(self):
        x=self.value;den=1+square(x);inv=den.inverse() if isinstance(x,Interval) else 1/den
        return self.compose(x.atan() if isinstance(x,Interval) else math.atan(x),inv,-2*x*square(inv))
    def sqrt(self):
        x=self.value
        if not isinstance(x,Interval) and x<=0:raise ValueError('square root not strictly positive')
        root=x.sqrt() if isinstance(x,Interval) else math.sqrt(x)
        if not isinstance(x,Interval):
            a=self.c;yu=a[1]/(2*root);yv=a[2]/(2*root)
            return SurfaceJet([root,yu,yv,(a[3]-2*yu*yu)/(2*root),
                               (a[4]-2*yu*yv)/(2*root),(a[5]-2*yv*yv)/(2*root)])
        return self.compose(root,1/(2*root),-1/(4*root*x))
    def exp(self):
        x=self.value
        y=Interval(down(math.exp(x.lo)),up(math.exp(x.hi))) if isinstance(x,Interval) else math.exp(x)
        return self.compose(y,y,y)
    def log(self):
        x=self.value
        if (x.lo if isinstance(x,Interval) else x)<=0:raise ValueError('log not strictly positive')
        y=Interval(down(math.log(x.lo)),up(math.log(x.hi))) if isinstance(x,Interval) else math.log(x)
        inv=x.inverse() if isinstance(x,Interval) else 1/x
        return self.compose(y,inv,-square(inv))


class SurfaceExactIdentity:
    """Bounded rational normal forms, with analytic subtrees as exact atoms.

    This proves identities, never domains. The original AST's partial operations
    are checked separately even when their enclosing expression cancels to zero.
    Limits mirror TypeScript: 256 terms, degree 64, 4096 coefficient bits and
    32768 multiplication steps per expression. Unknown is not a zero proof.
    """
    def __init__(self,point=None):
        self.cache={};self.atoms={};self.relations={};self.exp_arguments={};self.steps=0;self.point=point
    def bounded(self,p):
        if len(p)>256 or any(sum(e for _,e in m)>64 or max(c.numerator.bit_length(),c.denominator.bit_length())>4096 for m,c in p.items()):
            raise ValueError('exact identity budget')
        return p
    def add(self,a,b,sign=1):
        out=dict(a)
        for m,c in b.items():
            value=out.get(m,Fraction(0))+sign*c
            if value:out[m]=value
            else:out.pop(m,None)
        return self.bounded(out)
    def mul(self,a,b):
        out={}
        def term(m,c):
            self.steps+=1
            if self.steps>32768:raise ValueError('exact identity budget')
            exponentials=[(k,e) for k,e in m if k in self.exp_arguments]
            if sum(e for _,e in exponentials)>=2:
                argument=self.constant_form(Fraction(0))
                for k,e in exponentials:
                    argument=self.combine(argument,self.combine(self.constant_form(Fraction(e)),self.exp_arguments[k],'*'),'+')
                rest={k:e for k,e in m if k not in self.exp_arguments}
                if self.ground(argument)!=0:
                    _,k=self.atom(('call','exp',self.key(argument)));self.exp_arguments[k]=argument;rest[k]=rest.get(k,0)+1
                term(tuple(sorted(rest.items())),c);return
            for atom,exponent in m:
                if exponent>=2 and atom in self.relations:
                    rest=tuple((k,e-2 if k==atom else e) for k,e in m if k!=atom or e>2)
                    for rm,rc in self.relations[atom].items():
                        combined=dict(rest)
                        for k,e in rm:combined[k]=combined.get(k,0)+e
                        term(tuple(sorted(combined.items())),c*rc)
                    return
            value=out.get(m,Fraction(0))+c
            if value:out[m]=value
            else:out.pop(m,None)
            self.bounded(out)
        for am,ac in a.items():
            for bm,bc in b.items():
                combined=dict(am)
                for k,e in bm:combined[k]=combined.get(k,0)+e
                term(tuple(sorted(combined.items())),ac*bc)
        return out
    @staticmethod
    def constant_form(value):return ({():value} if value else {},{():Fraction(1)})
    def normal(self,num,den):
        if not den:raise ValueError('undefined formal denominator')
        if not num:return self.constant_form(Fraction(0))
        # Normalize rational constants and proportional polynomials. Domain
        # obligations retain every cancelled denominator in the original AST.
        leading=den[sorted(den)[0]]
        num={m:c/leading for m,c in num.items()};den={m:c/leading for m,c in den.items()}
        if num.keys()==den.keys():
            ratio=num[sorted(num)[0]]/den[sorted(den)[0]]
            if all(num[m]==ratio*den[m] for m in num):return self.constant_form(ratio)
        return self.bounded(num),self.bounded(den)
    def combine(self,a,b,op):
        an,ad=a;bn,bd=b
        if op in ('+','-'):return self.normal(self.add(self.mul(an,bd),self.mul(bn,ad),1 if op=='+' else -1),self.mul(ad,bd))
        return self.normal(self.mul(an,bn if op=='*' else bd),self.mul(ad,bd if op=='*' else bn))
    def atom(self,key):
        if key not in self.atoms:self.atoms[key]=len(self.atoms)
        k=self.atoms[key];return ({((k,1),):Fraction(1)},{():Fraction(1)}),k
    @staticmethod
    def key(a):return tuple((tuple(sorted(p.items()))) for p in a)
    @staticmethod
    def ground(a):
        n,d=a
        return n.get((),Fraction(0))/d[()] if set(n)<= {()} and set(d)=={()} else None
    def call(self,name,a,node):
        value=self.ground(a)
        zero=self.constant_form(Fraction(0));one=self.constant_form(Fraction(1))
        if value==0:
            if name in ('sin','tan','atan','sqrt'):return zero
            if name in ('cos','exp'):return one
        if name=='log' and value==1:return zero
        if name=='sqrt' and value is not None and value>0:
            n,d=math.isqrt(value.numerator),math.isqrt(value.denominator)
            if n*n==value.numerator and d*d==value.denominator:return self.constant_form(Fraction(n,d))
        if name in ('exp','log') and isinstance(node,ast.Call) and node.func.id==('log' if name=='exp' else 'exp'):
            return self.form(node.args[0])
        if name in ('sin','cos','tan','atan'):
            first=a[0][sorted(a[0])[0]] if a[0] else Fraction(0)
            if first<0:
                positive=({m:-c for m,c in a[0].items()},a[1]);out=self.call(name,positive,node)
                return self.combine(zero,out,'-') if name!='cos' else out
            pi_id=self.atoms.get(('name','pi'))
            if pi_id is not None and set(a[0])=={((pi_id,1),)} and set(a[1])=={()}:
                half=2*a[0][((pi_id,1),)]/a[1][()]
                if half.denominator==1:
                    k=int(half)%4
                    if name in ('sin','cos'):return self.constant_form(Fraction(([0,1,0,-1] if name=='sin' else [1,0,-1,0])[k]))
                    if name=='tan':
                        if k%2:raise ValueError('exact tangent pole')
                        return zero
            if name=='tan':return self.combine(self.call('sin',a,node),self.call('cos',a,node),'/')
        result,k=self.atom(('call',name,self.key(a)))
        if name=='exp':self.exp_arguments[k]=a
        elif name=='cos':
            sine,_=self.atom(('call','sin',self.key(a)))
            self.relations[k]=self.add(one[0],self.mul(sine[0],sine[0]),-1)
        elif name=='sqrt' and set(a[1])=={()}:
            self.relations[k]={m:c/a[1][()] for m,c in a[0].items()}
        return result
    def form(self,node):
        key=id(node)
        if key in self.cache:return self.cache[key]
        try:
            if isinstance(node,ast.Constant):out=self.constant_form(Fraction(str(float(node.value))))
            elif isinstance(node,ast.Name):
                out=self.constant_form(Fraction(str(self.point[node.id]))) if self.point is not None and node.id in self.point else self.atom(('name',node.id))[0]
            elif isinstance(node,ast.UnaryOp):
                a=self.form(node.operand);out=self.combine(self.constant_form(Fraction(0)),a,'-') if isinstance(node.op,ast.USub) else a
            elif isinstance(node,ast.Call):out=self.call(node.func.id,self.form(node.args[0]),node.args[0])
            else:
                a=self.form(node.left)
                if isinstance(node.op,ast.Pow):
                    exponent=Expression._integer(node.right);out=self.constant_form(Fraction(1))
                    if exponent<0:a=self.combine(out,a,'/')
                    for _ in range(abs(exponent)):out=self.combine(out,a,'*')
                else:out=self.combine(a,self.form(node.right),{ast.Add:'+',ast.Sub:'-',ast.Mult:'*',ast.Div:'/'}[type(node.op)])
            self.cache[key]=out;return out
        except (ValueError,TypeError,OverflowError):
            self.cache[key]=None;raise ValueError('identity unknown or undefined')
    def constant(self,node):
        try:
            value=self.form(node)
            return self.ground(value) if value is not None else None
        except (ValueError,TypeError):return None
    def nonnegative(self,node):
        try:
            a=self.form(node)
            return a is not None and all(c>=0 and all(e%2==0 for _,e in m) for p in a for m,c in p.items())
        except (ValueError,TypeError):return False


def surface_domain_obligations(tree):
    out=[]
    for n in ast.walk(tree):
        if isinstance(n,ast.BinOp) and isinstance(n.op,ast.Div):out.append(('nonzero',n.right))
        elif isinstance(n,ast.BinOp) and isinstance(n.op,ast.Pow) and Expression._integer(n.right)<0:out.append(('nonzero',n.left))
        elif isinstance(n,ast.Call) and n.func.id in ('sqrt','log','tan'):
            out.append(({'sqrt':'nonnegative','log':'positive','tan':'tan'}[n.func.id],n.args[0]))
    return out


def check_surface_identity_domains(obligations,proof,u,v):
    """Check every original partial subexpression, separately from cancellation."""
    if not obligations:return
    interval=isinstance(u,Interval)
    point_proof=proof if interval else SurfaceExactIdentity({'u':u,'v':v})
    def budget(n):
        if isinstance(n,ast.Constant):return abs(math.log10(abs(float(n.value)))) if n.value else 0
        if isinstance(n,ast.Name):return 0
        if isinstance(n,ast.UnaryOp):return budget(n.operand)
        if isinstance(n,ast.Call):return budget(n.args[0])
        if isinstance(n.op,ast.Pow):return budget(n.left)*abs(Expression._integer(n.right))
        return budget(n.left)+budget(n.right) if isinstance(n.op,(ast.Mult,ast.Div)) else max(budget(n.left),budget(n.right))
    def evaluate(n):
        exact=point_proof.constant(n)
        if exact is not None:
            if interval:
                x=float(exact)
                return Interval(0.) if exact==0 else Interval(down(x),up(x))
            return mp.mpf(exact.numerator)/exact.denominator
        if isinstance(n,ast.Constant):return Interval(float(n.value)) if interval else mp.mpf(float(n.value))
        if isinstance(n,ast.Name):
            if n.id in ('u','v'):
                value=u if n.id=='u' else v
                return value if interval else mp.mpf(value)
            x=math.pi if n.id=='pi' else math.e
            return Interval(down(x),up(x)) if interval else mp.mpf(x)
        if isinstance(n,ast.UnaryOp):
            a=evaluate(n.operand);return -a if isinstance(n.op,ast.USub) else a
        if isinstance(n,ast.BinOp):
            a=evaluate(n.left)
            if isinstance(n.op,ast.Pow):
                k=Expression._integer(n.right)
                if interval:
                    if k<0:a=a.inverse();k=-k
                    r=Interval(1.)
                    for _ in range(k):r=r*a
                    return r
                return a**k
            b=evaluate(n.right)
            return a+b if isinstance(n.op,ast.Add) else a-b if isinstance(n.op,ast.Sub) else a*b if isinstance(n.op,ast.Mult) else a/b
        a=evaluate(n.args[0]);name=n.func.id
        if not interval:return getattr(mp,name)(a)
        if name=='tan':return a.sin()/a.cos()
        if name=='sqrt':
            if a.lo<0:raise ValueError('subexpression negative root')
            return Interval(0. if a.lo==0 else down(math.sqrt(a.lo)),up(math.sqrt(a.hi)))
        if name in ('log','exp'):
            return Interval(down(getattr(math,name)(a.lo)),up(getattr(math,name)(a.hi)))
        return getattr(a,name)()
    def check():
        for kind,node in obligations:
            if kind!='tan' and isinstance(node,ast.Call) and node.func.id=='exp':continue
            if kind=='nonnegative' and proof.nonnegative(node):continue
            if kind=='tan' and not interval:
                try:
                    if point_proof.ground(point_proof.call('cos',point_proof.form(node),node))==0:
                        raise ZeroDivisionError('original exact tangent pole')
                except (ValueError,TypeError):pass
            x=evaluate(node)
            if kind=='tan':x=x.cos() if interval else mp.cos(x)
            lo,hi=(x.lo,x.hi) if interval else (x,x)
            if not (lo>=0 if kind=='nonnegative' else lo>0 if kind=='positive' else lo>0 or hi<0):
                raise ValueError('cancelled source subexpression is outside its domain')
    if interval:check()
    else:
        # Scalar domain checks only run on proved-zero roots containing partial
        # operations. Keep tiny denominators away from binary64 underflow.
        digits=128+math.ceil(max(*(budget(node) for _,node in obligations),*(abs(math.log10(abs(x))) if x else 0 for x in (u,v))))
        with mp.workdps(digits):check()


class SurfaceExpression(Expression):
    def __init__(self,source):
        # The inherited grammar still checks every non-variable syntax node.
        super().__init__(source,'u')
        self.exact_identity=SurfaceExactIdentity()
        self.zero_sqrt_nodes=set()
        self.zero_sqrt_domains={}
        # An exact constant half-angle pole must not become a finite libm
        # tan(pi/2) artifact. This proof does not sample a variable argument.
        for node in ast.walk(self.tree):
            if isinstance(node,ast.Call) and node.func.id=='sqrt':
                try:
                    shared=self.exact_identity.constant(node.args[0])==0
                    if shared or algebraic_budget(node.args[0])<=24 and simplified(surface_symbolic_node(node.args[0]))==0:
                        self.zero_sqrt_nodes.add(id(node))
                        self.zero_sqrt_domains[id(node)]=surface_domain_obligations(node.args[0])
                except (ValueError,TypeError,RecursionError,NotImplementedError):pass
            if isinstance(node,ast.Call) and node.func.id=='tan' and not any(isinstance(n,ast.Name) and n.id in ('u','v') for n in ast.walk(node.args[0])):
                try:
                    if simplified(sp.cos(surface_symbolic_node(node.args[0])))==0:
                        raise GenericSurfaceSystemError('source-singularity','原常数 Tan 参数为奇 π/2 极点，不能把 libm 有限近似当原曲面。')
                except GenericSurfaceSystemError:raise
                except (ValueError,TypeError,RecursionError,NotImplementedError):pass
    def _check(self,node):
        if isinstance(node,ast.Name) and node.id in ('u','v'):return
        return super()._check(node)
    def __call__(self,u,v):
        offsets,dynamic=self.parts(u,v)
        return dynamic+(sum(offsets,Interval(0.)) if isinstance(u.value,Interval) else math.fsum(offsets))
    def parts(self,u,v):
        interval=isinstance(u.value,Interval)
        zero=SurfaceJet.constant(0.,interval)
        def add(a,b):return b if a is None else a if b is None else a+b
        def total(p):return (p[1] if p[1] is not None else zero)+sum(p[0],Interval(0.)) if interval else (p[1] if p[1] is not None else zero)+math.fsum(p[0])
        def multiply(a,b):
            sum_a=sum(a[0],Interval(0.)) if interval else math.fsum(a[0])
            sum_b=sum(b[0],Interval(0.)) if interval else math.fsum(b[0])
            exact_zero=lambda x:x.lo==0 and x.hi==0 if isinstance(x,Interval) else x==0
            if a[1] is None and exact_zero(sum_a) or b[1] is None and exact_zero(sum_b):
                return [Interval(0.) if interval else 0.],None
            offsets=[x*y for x in a[0] for y in b[0]];dynamic=None
            if a[1] is not None:dynamic=a[1]*sum_b
            if b[1] is not None:dynamic=add(dynamic,b[1]*sum_a)
            if a[1] is not None and b[1] is not None:dynamic=add(dynamic,a[1]*b[1])
            if len(offsets)>256:offsets=[sum(offsets,Interval(0.)) if interval else math.fsum(offsets)]
            return offsets,dynamic
        def visit(n):
            if isinstance(n,ast.Constant):return [Interval(float(n.value)) if interval else float(n.value)],None
            if isinstance(n,ast.Name):
                if n.id in ('u','v'):return [],u if n.id=='u' else v
                x=math.pi if n.id=='pi' else math.e
                return [Interval(down(x),up(x)) if interval else x],None
            if isinstance(n,ast.UnaryOp):
                a,b=visit(n.operand);return ([-x for x in a],-b if b is not None else None) if isinstance(n.op,ast.USub) else (a,b)
            if isinstance(n,ast.BinOp):
                a=visit(n.left)
                if isinstance(n.op,ast.Pow):
                    k=self._integer(n.right)
                    if k<0:return [],total(a)**k
                    out=([Interval(1.) if interval else 1.],None)
                    for _ in range(k):out=multiply(out,a)
                    return out
                b=visit(n.right)
                if isinstance(n.op,ast.Add):return a[0]+b[0],add(a[1],b[1])
                if isinstance(n.op,ast.Sub):return a[0]+[-x for x in b[0]],add(a[1],-b[1] if b[1] is not None else None)
                if isinstance(n.op,ast.Mult):return multiply(a,b)
                if b[1] is None:
                    den=sum(b[0],Interval(0.)) if interval else math.fsum(b[0])
                    return [x/den for x in a[0]],a[1]/den if a[1] is not None else None
                return [],total(a)/total(b)
            name=n.func.id
            if name=='sqrt' and id(n) in self.zero_sqrt_nodes:
                check_surface_identity_domains(self.zero_sqrt_domains[id(n)],self.exact_identity,u.value,v.value)
                return [Interval(0.) if interval else 0.],None
            argument=visit(n.args[0]);a=total(argument)
            # A source subtree independent of u/v is a genuine constant.
            # Zero sampled jets are not such a proof (e.g. sqrt(u**3) at 0).
            if name=='sin':return [],a.sincos()[0]
            if name=='cos':return [],a.sincos()[1]
            if name=='sqrt' and not interval:
                if a.value<=0:return [],precise_surface_expression(n,u.value,v.value)
                root=math.sqrt(a.value);yu=a.c[1]/(2*root);yv=a.c[2]/(2*root)
                terms=((a.c[3],2*yu*yu),(a.c[4],2*yu*yv),(a.c[5],2*yv*yv))
                if any(x!=0 and y!=0 and abs(x-y)<=1e-8*max(abs(x),abs(y)) for x,y in terms):
                    return [],precise_surface_expression(n,u.value,v.value)
            return [],getattr(a,name)()
        offsets,dynamic=visit(self.tree)
        return offsets,dynamic if dynamic is not None else zero


def precise_surface_expression(tree,u,v):
    """Rare cancelling unary chains: numerical AST, without symbolic grid work."""
    def budget(n):
        if isinstance(n,ast.Constant):return abs(math.log10(abs(float(n.value)))) if n.value else 0
        if isinstance(n,ast.Name):return 0
        if isinstance(n,ast.UnaryOp):return budget(n.operand)
        if isinstance(n,ast.Call):return budget(n.args[0])
        if isinstance(n.op,ast.Pow):return budget(n.left)*abs(Expression._integer(n.right))
        if isinstance(n.op,(ast.Mult,ast.Div)):return budget(n.left)+budget(n.right)
        return max(budget(n.left),budget(n.right))
    digits=80+int(math.ceil(max(budget(tree),*(abs(math.log10(abs(x))) if x else 0 for x in (u,v)))))
    with mp.workdps(digits):
        def evaluate(n):
            if isinstance(n,ast.Constant):return SurfaceJet.constant(mp.mpf(float(n.value)))
            if isinstance(n,ast.Name):
                if n.id in ('u','v'):return SurfaceJet.variable(mp.mpf(u if n.id=='u' else v),0 if n.id=='u' else 1)
                return SurfaceJet.constant(mp.mpf(math.pi if n.id=='pi' else math.e))
            if isinstance(n,ast.UnaryOp):
                a=evaluate(n.operand);return -a if isinstance(n.op,ast.USub) else a
            if isinstance(n,ast.BinOp):
                a=evaluate(n.left)
                if isinstance(n.op,ast.Pow):return a**Expression._integer(n.right)
                b=evaluate(n.right)
                return a+b if isinstance(n.op,ast.Add) else a-b if isinstance(n.op,ast.Sub) else a*b if isinstance(n.op,ast.Mult) else a/b
            a=evaluate(n.args[0]);x=a.value;name=n.func.id
            if name=='sqrt':
                if x<=0:raise ValueError('source square root not strictly positive')
                root=mp.sqrt(x);return a.compose(root,1/(2*root),-1/(4*root*x))
            value=float(x)
            if name in ('sin','cos','tan'):
                s,c=mp.mpf(math.sin(value)),mp.mpf(math.cos(value))
                sine,cosine=a.compose(s,c,-s),a.compose(c,-s,-c)
                return sine if name=='sin' else cosine if name=='cos' else sine/cosine
            if name=='atan':
                inv=1/(1+x*x);return a.compose(mp.mpf(math.atan(value)),inv,-2*x*inv*inv)
            if name=='exp':
                y=mp.mpf(math.exp(value));return a.compose(y,y,y)
            if name=='log':
                y=mp.mpf(math.log(value));return a.compose(y,1/x,-1/(x*x))
            raise ValueError('unknown source function')
        result=evaluate(tree);out=SurfaceJet([float(x) for x in result.c])
        if any(not math.isfinite(x) for x in out.c):raise ValueError('nonfinite compensated source derivative')
        return out


def validate_generic_surface_system_query(data):
    if not isinstance(data,dict) or set(data)!=set(PRESET) or data.get('family')!=FAMILY:
        raise GenericSurfaceSystemError('input-contract','曲面系统须为完整双变量来源、两个域、密度与主曲率开关；不接受其它字段。')
    q={**data}
    if not isinstance(q['surface'],list) or len(q['surface'])!=3:raise GenericSurfaceSystemError('input-contract','S(u,v)须有三个安全标量表达式。')
    q['surface']=list(q['surface'])
    for x in q['surface']:SurfaceExpression(x)
    for key in ('uStart','uEnd','vStart','vEnd'):
        x=q[key]
        if type(x) not in (int,float) or not math.isfinite(x):raise GenericSurfaceSystemError('input-contract','曲面两个域须为有限数。')
        q[key]=float(x)
    for axis in ('u','v'):
        a,b=q[axis+'Start'],q[axis+'End']
        if not -10<=a<b<=10 or not .01<=b-a<=12:raise GenericSurfaceSystemError('input-contract','两个独立域均须在−10…10内且跨度0.01–12；不交换或剪域。')
        count=q[axis+'Segments']
        if type(count) is not int or not 8<=count<=64:raise GenericSurfaceSystemError('input-contract','两个网格密度均须为8–64整数。')
    if type(q['principalAnalysis']) is not bool:raise GenericSurfaceSystemError('input-contract','PrincipalAnalysis须为布尔值。')
    return q


def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def unit(a):
    length=math.hypot(*a)
    if length==0 or not math.isfinite(length):raise GenericSurfaceSystemError('source-singularity','原曲面切向或 Su×Sv 为零／非有限，不能定义原规则。')
    return [x/length for x in a]


def surface_symbolic_node(n):
    functions={'sin':sp.sin,'cos':sp.cos,'tan':sp.tan,'atan':sp.atan,'sqrt':sp.sqrt,'exp':sp.exp,'log':sp.log}
    u,v=sp.symbols('u v',real=True)
    if isinstance(n,ast.Constant):return sp.Rational(str(n.value))
    if isinstance(n,ast.Name):return {'u':u,'v':v,'pi':sp.pi,'e':sp.E}[n.id]
    if isinstance(n,ast.UnaryOp):return -surface_symbolic_node(n.operand) if isinstance(n.op,ast.USub) else surface_symbolic_node(n.operand)
    if isinstance(n,ast.Call):return functions[n.func.id](surface_symbolic_node(n.args[0]))
    a=surface_symbolic_node(n.left)
    if isinstance(n.op,ast.Pow):return a**Expression._integer(n.right)
    b=surface_symbolic_node(n.right)
    return a+b if isinstance(n.op,ast.Add) else a-b if isinstance(n.op,ast.Sub) else a*b if isinstance(n.op,ast.Mult) else a/b


def umbilic_identity(expressions):
    """Bounded AST algebra proof; a near-zero sampled eigen gap is not proof."""
    u,v=sp.symbols('u v',real=True)
    try:
        if any(algebraic_budget(e.tree)>24 for e in expressions):return False
        s=[surface_symbolic_node(e.tree) for e in expressions]
        su,sv=[[sp.diff(x,axis) for x in s] for axis in (u,v)]
        area=cross(su,sv)
        E,F,G=dot(su,su),dot(su,sv),dot(sv,sv)
        l,m,n=[dot([sp.diff(x,axis) for x in tangent],area) for tangent,axis in ((su,u),(su,v),(sv,v))]
        return all(simplified(x)==0 for x in (G*m-F*n,E*m-F*l,G*l-E*n))
    except (ValueError,TypeError,OverflowError,RecursionError,sp.PolynomialError,NotImplementedError):return False


def precise_surface_frame(su,sv,suu,suv,svv,sine):
    """Numerical compensation only; never symbolic per-grid evaluation.

    The original UV matrix is computed independently of the orthonormal
    matrix. Precision follows the parameter condition, so a tiny angle does
    not erase G-E or amplify a rounded change of frame into a false A.
    """
    digits=max(80,int(math.ceil(-2*math.log10(sine)))+48)
    with mp.workdps(digits):
        a,b,c,d,e=[list(map(mp.mpf,t)) for t in (su,sv,suu,suv,svv)]
        area=cross(a,b);area2=dot(area,area);normal=[x/mp.sqrt(area2) for x in area]
        E,F,G=dot(a,a),dot(a,b),dot(b,b)
        L,M,N=dot(c,normal),dot(d,normal),dot(e,normal)
        length=mp.sqrt(E);e1=[x/length for x in a];e2=cross(normal,e1)
        rb,rd=dot(b,e1),dot(b,e2)
        inverse=mp.matrix([[1/length,-rb/(length*rd)],[0,1/rd]])
        second=mp.matrix([[L,M],[M,N]])
        shape=inverse.T*second*inverse
        A=mp.matrix([[(G*L-F*M)/area2,(G*M-F*N)/area2],
                     [(E*M-F*L)/area2,(E*N-F*M)/area2]])
        as_matrix=lambda x:np.asarray([[float(x[i,j]) for j in range(2)] for i in range(2)])
        return {'normal':list(map(float,normal)),'EFG':list(map(float,(E,F,G))),
                'LMN':list(map(float,(L,M,N))),'e1':list(map(float,e1)),'e2':list(map(float,e2)),
                'inverse':as_matrix(inverse),'shape':as_matrix(shape),'A':as_matrix(A),
                'H':float((shape[0,0]+shape[1,1])/2),'K':float((L*N-M*M)/area2)}


class SurfaceSystemKernel:
    def __init__(self,q):
        self.q=q;self.expressions=[SurfaceExpression(x) for x in q['surface']]
        self.origin_parts=[e.parts(SurfaceJet.variable(q['uStart'],0),SurfaceJet.variable(q['vStart'],1)) for e in self.expressions]
        self.origin=[math.fsum(a)+b.value for a,b in self.origin_parts]
        first=[[p[1].c[k] for p in self.origin_parts] for k in (1,2)]
        self.scale=max(math.hypot(*first[0])*(q['uEnd']-q['uStart']),math.hypot(*first[1])*(q['vEnd']-q['vStart']))
        if not math.isfinite(self.scale) or self.scale<=0 or any(not math.isfinite(x) for x in self.origin):
            raise GenericSurfaceSystemError('source-singularity','原曲面起点或局部长度非有限／退化。')
        self.umbilic=umbilic_identity(self.expressions) if q['principalAnalysis'] else False

    def jets(self,u,v):
        a,b=SurfaceJet.variable(u,0),SurfaceJet.variable(v,1)
        out=[]
        for i,e in enumerate(self.expressions):
            offsets,dynamic=e.parts(a,b);center=self.origin_parts[i]
            # Additive leaf offsets are identical AST constants at every u/v.
            # Interval offset subtraction would invent uncertainty for exact
            # translations. Their algebraic cancellation is exact as written.
            shift=Interval(0.) if isinstance(u,Interval) else math.fsum(offsets+[-x for x in center[0]])
            out.append((dynamic-center[1].value+shift)/self.scale)
        return out

    def row(self,u,v):
        try:
            jets=self.jets(u,v);coords=[[float(x.c[k]) for x in jets] for k in range(6)]
            if any(not math.isfinite(x) for row in coords for x in row):raise ValueError('nonfinite jet')
            p,su,sv,suu,suv,svv=coords
            n=unit(cross(unit(su),unit(sv)))
            E,F,G=dot(su,su),dot(su,sv),dot(sv,sv)
            L,M,N=dot(suu,n),dot(suv,n),dot(svv,n)
            a=math.hypot(*su);e1=unit(su);e2=cross(n,e1);b=dot(sv,e1);d=dot(sv,e2)
            if d<=0:raise ValueError('singular oriented parameter frame')
            inverse=np.asarray([[1/a,-b/(a*d)],[0.,1/d]])
            II=np.asarray([[L,M],[M,N]])
            shape=inverse.T@II@inverse
            # Same original inverse(F1).F2, evaluated through the metric QR
            # factors to preserve nearly parallel finite parameter directions.
            A=inverse@shape@np.asarray([[a,b],[0.,d]])
            H=float((shape[0,0]+shape[1,1])/2)
            K=float(shape[0,0]*shape[1,1]-shape[0,1]*shape[1,0])
            sine=math.hypot(*cross(unit(su),unit(sv)))
            if sine<1e-4:
                compensated=precise_surface_frame(su,sv,suu,suv,svv,sine)
                n=compensated['normal'];E,F,G=compensated['EFG'];L,M,N=compensated['LMN']
                e1=compensated['e1'];e2=compensated['e2'];inverse=compensated['inverse']
                shape=compensated['shape'];A=compensated['A'];H=compensated['H'];K=compensated['K']
            rules=dict(zip(BASIC_RULES,[su,sv,n,E,F,G,L,M,N,K,H,A.tolist()]))
            choice=None;residual=0.;world_orthogonal=0.
            if self.q['principalAnalysis']:
                values,vectors=np.linalg.eigh(shape)
                # Descending numeric value is our deterministic pair convention;
                # no Wolfram eigenpair order/sign equivalence is asserted.
                values=values[::-1];vectors=vectors[:,::-1]
                coefficients=[inverse@vectors[:,i] for i in range(2)]
                uv=[unit2(c) for c in coefficients]
                dirs=[unit([e1[j]*vectors[0,i]+e2[j]*vectors[1,i] for j in range(3)]) for i in range(2)]
                natural=max(math.hypot(*shape.flat),np.finfo(float).tiny)
                residual=max(math.hypot(*(shape@vectors[:,i]-values[i]*vectors[:,i]))/natural for i in range(2))
                uv_natural=max(math.hypot(*A.flat),max(abs(float(x)) for x in values),np.finfo(float).tiny)
                residual=max(residual,max(math.hypot(*(A@np.asarray(uv[i])-values[i]*np.asarray(uv[i])))/uv_natural for i in range(2)))
                world_orthogonal=abs(dot(dirs[0],dirs[1]))
                choice='non-unique-identity' if self.umbilic else 'separated-numeric' if abs(values[0]-values[1])>128*np.finfo(float).eps*natural else 'unresolved-numeric'
                rules.update(dict(zip(PRINCIPAL_RULES,[values.tolist(),uv,dirs])))
            physical=scaled_rules(rules,self.scale)
            source_point=[self.origin[i]+p[i]*self.scale for i in range(3)]
            row={'u':u,'v':v,'sourcePoint':source_point,'normalizedPoint':p,
                 'sourceSecondDerivatives':[[x*self.scale for x in r] for r in (suu,suv,svv)],
                 'normalizedSecondDerivatives':[suu,suv,svv],'rules':physical,'normalizedRules':rules,
                 'principalChoice':choice,'principalEigenResidual':residual,'principalWorldOrthogonalityResidual':world_orthogonal}
            ensure_finite(row)
            return row
        except GenericSurfaceSystemError:raise
        except (ValueError,OverflowError,ZeroDivisionError,FloatingPointError,np.linalg.LinAlgError) as exc:
            raise GenericSurfaceSystemError('source-singularity',f'原曲面在 (u,v)=({u:g},{v:g}) 的混合导数／法向／曲率规则不能有限求值。') from exc

    def interval_cell(self,rect):
        a,b,c,d=rect;jet=self.jets(Interval(a,b),Interval(c,d))
        su,sv=[[x.c[k] for x in jet] for k in (1,2)]
        area=cross(su,sv);area2=sum((square(x) for x in area),Interval(0.))
        if area2.lo<=0:raise ValueError('surface area may vanish')
        n=[x/area2.sqrt() for x in area]
        E,F,G=dot(su,su),dot(su,sv),dot(sv,sv)
        L,M,N=[dot([x.c[k] for x in jet],n) for k in (3,4,5)]
        # EG-F² == |Su×Sv|², an exact algebraic identity. The latter
        # avoids cancellation without changing the original literal quotient.
        K=(L*N-square(M))/area2;H=(E*N-2*F*M+G*L)/(2*area2)
        A=[[(G*L-F*M)/area2,(G*M-F*N)/area2],[(E*M-F*L)/area2,(E*N-F*M)/area2]]
        fields=su+sv+n+[E,F,G,L,M,N,K,H]+[x for row in A for x in row]
        for x in [z for j in jet for z in j.c]+fields:
            if not math.isfinite(x.lo) or not math.isfinite(x.hi):raise ValueError('nonfinite rule bounds')
        return {'rectangle':rect,'normalizedAreaSquaredBounds':[area2.lo,area2.hi],
                'normalizedBasicRuleBounds':[[x.lo,x.hi] for x in fields]}


def unit2(a):
    length=math.hypot(*a)
    if length==0 or not math.isfinite(length):raise ValueError('nonfinite principal UV direction')
    return [float(x/length) for x in a]


def scaled_rules(rules,scale):
    out={}
    for key,value in rules.items():
        factor=scale if key in ('SurfaceTangentU','SurfaceTangentV','FundamentalFormL','FundamentalFormM','FundamentalFormN') else scale*scale if key in ('FundamentalFormE','FundamentalFormF','FundamentalFormG') else 1/(scale*scale) if key=='GaussianCurvature' else 1/scale if key in ('MeanCurvature','CurvatureMatrix','PrincipalCurvatures') else 1.
        def convert(x):return [convert(v) for v in x] if isinstance(x,list) else float(x*factor)
        out[key]=convert(value)
    return out


def ensure_finite(value):
    if isinstance(value,dict):
        for x in value.values():ensure_finite(x)
    elif isinstance(value,(list,tuple)):
        for x in value:ensure_finite(x)
    elif type(value) in (float,int) and not math.isfinite(value):raise ValueError('nonfinite output')


def certify_rectangle(kernel,normal_only=False,orientation=1):
    q=kernel.q;stack=[([q['uStart'],q['uEnd'],q['vStart'],q['vEnd']],0)];cells=[];unresolved=[];evaluations=0
    while stack:
        rect,depth=stack.pop()
        if evaluations>=CERTIFICATION_BUDGET:
            unresolved.append(rect);unresolved.extend(r for r,_ in stack);break
        evaluations+=1
        try:
            cells.append(normal_interval_cell(kernel,rect,orientation) if normal_only else kernel.interval_cell(rect));continue
        except (ValueError,OverflowError,ZeroDivisionError,FloatingPointError):pass
        if depth>=14:unresolved.append(rect);continue
        a,b,c,d=rect
        # Split normalized parameter width, keeping the original two domains.
        if (b-a)/(q['uEnd']-q['uStart'])>=(d-c)/(q['vEnd']-q['vStart']):
            middle=(a+b)/2;stack.extend((([middle,b,c,d],depth+1),([a,middle,c,d],depth+1)))
        else:
            middle=(c+d)/2;stack.extend((([a,b,middle,d],depth+1),([a,b,c,middle],depth+1)))
    return {'certified':not unresolved,'evaluations':evaluations,'verifiedCells':len(cells),'cells':cells,
            'unresolved':unresolved,'minimumNormalizedAreaSquaredLowerBound':min((c['normalizedAreaSquaredBounds'][0] for c in cells),default=None),
            'roundingModel':ROUNDING,'reason':None if not unresolved else '完整双变量矩形区间预算未证全部原规则有限及正面积；有限网格不是全域证明。'}


def query_generic_surface_system(data):
    q=validate_generic_surface_system_query(data)
    try:kernel=SurfaceSystemKernel(q)
    except (ValueError,OverflowError,ZeroDivisionError) as exc:
        if isinstance(exc,GenericSurfaceSystemError):raise
        raise GenericSurfaceSystemError('source-singularity','曲面起点安全表达式／导数不能有限求值。') from exc
    sample=[kernel.row(u,v) for u in np.linspace(q['uStart'],q['uEnd'],5) for v in np.linspace(q['vStart'],q['vEnd'],5)]
    us=np.linspace(q['uStart'],q['uEnd'],q['uSegments']+1).tolist();vs=np.linspace(q['vStart'],q['vEnd'],q['vSegments']+1).tolist()
    rows=[[kernel.row(u,v) for v in vs] for u in us]
    domain=certify_rectangle(kernel)
    return {'family':RESULT_FAMILY,'query':q,
            'source':{'function':'SurfaceSystem','definitionCell':'In[3777]','argumentOrder':['u','v'],
                      'ruleOrder':BASIC_RULES+(PRINCIPAL_RULES if q['principalAnalysis'] else []),
                      'simplification':'None','principalPairConvention':'numeric-descending-value/modulo-synchronized-sign-and-permutation',
                      'principalUmbilicIdentity':kernel.umbilic,'symbolicWolframReproduced':False,'interpolationReproduced':False},
            'normalization':{'sourceOrigin':kernel.origin,'scale':kernel.scale},'domain':domain,
            'sample':{'rows':sample},'grid':{'u':us,'v':vs,'rows':rows},
            'diagnostics':{'validationNodes':25,'maximumPrincipalEigenResidual':max(r['principalEigenResidual'] for r in sample),
                           'maximumPrincipalWorldOrthogonalityResidual':max(r['principalWorldOrthogonalityResidual'] for r in sample)},
            'certification':{'mixedDerivativesEvaluated':True,'allRequestedRulesEvaluated':True,'finiteGridVerified':True,
                             'fullRectangleRegularityCertified':domain['certified'],'principalDirectionsUniqueCertified':False,
                             'principalDirectionsContinuousCertified':False,'globalSurfaceInjectivityChecked':False,
                             'selfCollisionChecked':False,'exactStraightCreaseFOLD':False,'adoptableCreasePattern':False}}


def validate_generic_surface_normal_query(data):
    if not isinstance(data,dict) or set(data)!=set(NORMAL_PRESET) or data.get('family')!=NORMAL_FAMILY:
        raise GenericSurfaceSystemError('input-contract','独立曲面法向须为完整双变量来源、两个域、密度与 SurfaceOrientation；不接受主曲率或其它字段。')
    if type(data['surfaceOrientation']) is not int or data['surfaceOrientation'] not in (-1,1):
        raise GenericSurfaceSystemError('input-contract','独立曲面法向的 SurfaceOrientation 须为原正反方向 +1 或 -1。')
    system=validate_generic_surface_system_query({**{k:v for k,v in data.items() if k not in ('family','surfaceOrientation')},
                                                'family':FAMILY,'principalAnalysis':False})
    return {**{k:v for k,v in system.items() if k!='principalAnalysis'},'family':NORMAL_FAMILY,
            'surfaceOrientation':data['surfaceOrientation']}


def normal_interval_cell(kernel,rect,orientation):
    a,b,c,d=rect;jet=kernel.jets(Interval(a,b),Interval(c,d))
    su,sv=[[x.c[k] for x in jet] for k in (1,2)]
    area=cross(su,sv);area2=sum((square(x) for x in area),Interval(0.))
    if area2.lo<=0:raise ValueError('surface area may vanish')
    normal=[orientation*x/area2.sqrt() for x in area]
    fields=su+sv+normal
    for x in [j.c[0] for j in jet]+fields:
        if not math.isfinite(x.lo) or not math.isfinite(x.hi):raise ValueError('nonfinite normal bounds')
    return {'rectangle':rect,'normalizedAreaSquaredBounds':[area2.lo,area2.hi],
            'normalizedBasicRuleBounds':[[x.lo,x.hi] for x in fields]}


def query_generic_surface_normal(data):
    q=validate_generic_surface_normal_query(data)
    system={**{k:v for k,v in q.items() if k not in ('family','surfaceOrientation')},'family':FAMILY,'principalAnalysis':False}
    try:kernel=SurfaceSystemKernel(system)
    except (ValueError,OverflowError,ZeroDivisionError) as exc:
        if isinstance(exc,GenericSurfaceSystemError):raise
        raise GenericSurfaceSystemError('source-singularity','曲面法向来源起点不能有限求值。') from exc
    orientation=q['surfaceOrientation']
    def row(u,v):
        try:
            jet=kernel.jets(u,v);p,su,sv=[[float(x.c[k]) for x in jet] for k in (0,1,2)]
            normal=[orientation*x for x in unit(cross(unit(su),unit(sv)))]
            result={'u':u,'v':v,'sourcePoint':[kernel.origin[i]+p[i]*kernel.scale for i in range(3)],
                    'normalizedPoint':p,'sourceTangents':[[x*kernel.scale for x in t] for t in (su,sv)],
                    'normalizedTangents':[su,sv],'normal':normal}
            ensure_finite(result);return result
        except GenericSurfaceSystemError:raise
        except (ValueError,OverflowError,ZeroDivisionError,FloatingPointError) as exc:
            raise GenericSurfaceSystemError('source-singularity',f'原曲面在 (u,v)=({u:g},{v:g}) 的来源切向／法向不能有限求值。') from exc
    sample=[row(u,v) for u in np.linspace(q['uStart'],q['uEnd'],5) for v in np.linspace(q['vStart'],q['vEnd'],5)]
    us=np.linspace(q['uStart'],q['uEnd'],q['uSegments']+1).tolist();vs=np.linspace(q['vStart'],q['vEnd'],q['vSegments']+1).tolist()
    rows=[[row(u,v) for v in vs] for u in us]
    domain=certify_rectangle(kernel,True,orientation)
    return {'family':'origamica-generic-surface-normal','query':q,
            'source':{'function':'SurfaceNormalFromSurface','definitionCell':'In[3746]',
                      'argumentOrder':['u','v'],'originalOrientationOption':'SurfaceOrientation',
                      'simplification':'None','symbolicWolframReproduced':False,'interpolationReproduced':False,
                      'numericalWrapperFunction':'NSurfaceNormalFromSurface','numericalWrapperDefinitionCell':'In[3750]',
                      'numericalWrapperInterpolationReproduced':False},
            'normalization':{'sourceOrigin':kernel.origin,'scale':kernel.scale},'domain':domain,
            'sample':{'rows':sample},'grid':{'u':us,'v':vs,'rows':rows},
            'certification':{'finiteGridVerified':True,'fullRectangleRegularityCertified':domain['certified'],
                             'globalSurfaceInjectivityChecked':False,'selfCollisionChecked':False,
                             'exactStraightCreaseFOLD':False,'adoptableCreasePattern':False}}
