"""Bounded scalar expression language and Taylor automatic differentiation.

Expressions are parsed, never evaluated as Python.  Native curves use u;
common-parameter functions use s.  Taylor coefficients are derivatives / k!.
The same operations accept outward-rounded Interval coefficients.
"""
import ast
import math
import re

from tessellation_curved_linked_common_interval import Interval, down, up


class GenericLinkedError(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(f'[{code}] {message}')


def scalar_value(value):
    return (value.lo + value.hi) / 2 if isinstance(value, Interval) else float(value)


class Taylor:
    def __init__(self, coefficients):
        self.c = list(coefficients)

    @property
    def order(self):
        return len(self.c) - 1

    @property
    def value(self):
        return self.c[0]

    @classmethod
    def constant(cls, value, order):
        zero = Interval(0) if isinstance(value, Interval) else 0.
        return cls([value] + [zero] * order)

    @classmethod
    def variable(cls, value, order):
        zero = Interval(0) if isinstance(value, Interval) else 0.
        one = Interval(1) if isinstance(value, Interval) else 1.
        return cls([value, one] + [zero] * (order - 1))

    def other(self, value):
        return value if isinstance(value, Taylor) else self.constant(value, self.order)

    def __add__(self, other):
        other = self.other(other)
        return Taylor([a + b for a, b in zip(self.c, other.c)])

    __radd__ = __add__

    def __neg__(self):
        return Taylor([-a for a in self.c])

    def __sub__(self, other):
        return self + -self.other(other)

    def __rsub__(self, other):
        return self.other(other) + -self

    def __mul__(self, other):
        other = self.other(other)
        n = min(len(self.c), len(other.c))
        return Taylor([sum(self.c[k] * other.c[j-k] for k in range(j+1)) for j in range(n)])

    __rmul__ = __mul__

    def inverse(self):
        if isinstance(self.value, Interval):
            inv = self.value.inverse()
        else:
            if not math.isfinite(self.value) or self.value == 0:
                raise GenericLinkedError('singularity', '表达式或续接方程出现零分母。')
            inv = 1 / self.value
        c = [inv]
        for n in range(1, len(self.c)):
            c.append(-sum(self.c[k] * c[n-k] for k in range(1, n+1)) * inv)
        return Taylor(c)

    def __truediv__(self, other):
        return self * self.other(other).inverse()

    def __rtruediv__(self, other):
        return self.other(other) * self.inverse()

    def __pow__(self, exponent):
        if exponent < 0:
            return self.inverse() ** -exponent
        result = self.constant(1., self.order)
        for _ in range(exponent):
            result = result * self
        return result

    def derivative(self):
        if self.order < 1:
            raise GenericLinkedError('derivative-budget', '高阶自动导数预算不足。')
        return Taylor([k * self.c[k] for k in range(1, len(self.c))])

    def sincos(self):
        interval = isinstance(self.value, Interval)
        sn = [self.value.sin() if interval else math.sin(self.value)]
        cs = [self.value.cos() if interval else math.cos(self.value)]
        for n in range(1, len(self.c)):
            sn.append(sum(k*self.c[k]*cs[n-k] for k in range(1, n+1))/n)
            cs.append(-sum(k*self.c[k]*sn[n-k] for k in range(1, n+1))/n)
        return Taylor(sn), Taylor(cs)

    def tan(self):
        sn, cs = self.sincos()
        return sn / cs

    def atan(self):
        v = self.value.atan() if isinstance(self.value, Interval) else math.atan(self.value)
        if self.order == 0:
            return Taylor([v])
        d = self.derivative() / (1 + self*self)
        return Taylor([v] + [d.c[n-1]/n for n in range(1, len(self.c))])

    def sqrt(self):
        if isinstance(self.value, Interval):
            root = self.value.sqrt()
        else:
            if self.value <= 0:
                raise GenericLinkedError('singularity', '表达式根式不为严格正数。')
            root = math.sqrt(self.value)
        c = [root]
        for n in range(1, len(self.c)):
            c.append((self.c[n]-sum(c[k]*c[n-k] for k in range(1,n)))/(2*root))
        return Taylor(c)

    def exp(self):
        v = self.value
        c = [Interval(down(math.exp(v.lo)), up(math.exp(v.hi))) if isinstance(v,Interval) else math.exp(v)]
        for n in range(1,len(self.c)):
            c.append(sum(k*self.c[k]*c[n-k] for k in range(1,n+1))/n)
        return Taylor(c)

    def log(self):
        v = self.value
        if (v.lo if isinstance(v,Interval) else v) <= 0:
            raise GenericLinkedError('singularity', 'log 参数不为严格正数。')
        c = [Interval(down(math.log(v.lo)),up(math.log(v.hi))) if isinstance(v,Interval) else math.log(v)]
        if self.order:
            d = self.derivative()/self
            c.extend(d.c[n-1]/n for n in range(1,len(self.c)))
        return Taylor(c)


class Expression:
    FUNCTIONS = {'sin','cos','tan','atan','sqrt','exp','log'}

    def __init__(self, source, variable):
        if not isinstance(source,str) or not 1 <= len(source) <= 240:
            raise GenericLinkedError('expression-contract', '表达式须为 1–240 字符的字符串。')
        self.source, self.variable = source, variable
        try:
            self.tree = ast.parse(normalize_expression(source),mode='eval').body
        except (SyntaxError,ValueError,RecursionError) as exc:
            raise GenericLinkedError('expression-contract', '表达式语法无效。') from exc
        nodes = list(ast.walk(self.tree))
        if len(nodes)>96:
            raise GenericLinkedError('expression-budget', '单个表达式的 AST 节点超过 96。')
        self._check(self.tree)

    def _check(self,node):
        if isinstance(node,ast.Constant):
            if type(node.value) not in (int,float) or not math.isfinite(node.value) or abs(node.value)>1e12:
                raise GenericLinkedError('expression-contract','表达式常数须为绝对值不超过 10¹² 的有限数。')
        elif isinstance(node,ast.Name):
            if node.id not in (self.variable,'pi','e'):
                raise GenericLinkedError('expression-contract',f'只允许变量 {self.variable} 与常数 pi、e。')
        elif isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub)):
            self._check(node.operand)
        elif isinstance(node,ast.BinOp) and isinstance(node.op,(ast.Add,ast.Sub,ast.Mult,ast.Div,ast.Pow)):
            self._check(node.left)
            if isinstance(node.op,ast.Pow):
                exponent=self._integer(node.right)
                if not -8<=exponent<=8:
                    raise GenericLinkedError('expression-contract','** 只允许 −8…8 的整数常数幂。')
            else:
                self._check(node.right)
        elif isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id in self.FUNCTIONS and len(node.args)==1 and not node.keywords:
            self._check(node.args[0])
        else:
            raise GenericLinkedError('expression-contract','只允许标量四则、整数幂与 sin/cos/tan/atan/sqrt/exp/log；不允许代码或属性访问。')

    @staticmethod
    def _integer(node):
        sign=1
        if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.USub,ast.UAdd)):
            sign=-1 if isinstance(node.op,ast.USub) else 1
            node=node.operand
        if not isinstance(node,ast.Constant) or type(node.value) is not int:
            raise GenericLinkedError('expression-contract','幂指数必须是整数常数。')
        return sign*node.value

    def derivative(self):
        """Symbolic native derivative evaluated by the same safe Taylor AST.

        This keeps q' out of normalized native tangent calculations, then
        explicitly inserts it into common-s speed and angular speed.
        """
        def constant(v):return ast.Constant(value=v)
        def is_const(n,v):return isinstance(n,ast.Constant) and n.value==v
        def binary(op,a,b):
            if isinstance(op,ast.Mult):
                if is_const(a,0) or is_const(b,0):return constant(0)
                if is_const(a,1):return b
                if is_const(b,1):return a
            if isinstance(op,ast.Add):
                if is_const(a,0):return b
                if is_const(b,0):return a
            return ast.BinOp(left=a,op=op,right=b)
        def mul(a,b):return binary(ast.Mult(),a,b)
        def add(a,b):return binary(ast.Add(),a,b)
        def divide(a,b):return binary(ast.Div(),a,b)
        def power(a,n):return binary(ast.Pow(),a,constant(n))
        def call(name,a):return ast.Call(func=ast.Name(id=name,ctx=ast.Load()),args=[a],keywords=[])
        def d(n):
            if isinstance(n,ast.Constant):return constant(0)
            if isinstance(n,ast.Name):return constant(1 if n.id==self.variable else 0)
            if isinstance(n,ast.UnaryOp):return ast.UnaryOp(op=n.op,operand=d(n.operand))
            if isinstance(n,ast.BinOp):
                a,b=n.left,n.right;da=d(a)
                if isinstance(n.op,ast.Pow):
                    k=self._integer(b)
                    return mul(mul(constant(k),power(a,k-1)),da) if k else constant(0)
                db=d(b)
                if isinstance(n.op,ast.Add):return add(da,db)
                if isinstance(n.op,ast.Sub):return binary(ast.Sub(),da,db)
                if isinstance(n.op,ast.Mult):return add(mul(da,b),mul(a,db))
                return divide(binary(ast.Sub(),mul(da,b),mul(a,db)),power(b,2))
            a=n.args[0];da=d(a);name=n.func.id
            if name=='sin':return mul(call('cos',a),da)
            if name=='cos':return mul(ast.UnaryOp(op=ast.USub(),operand=call('sin',a)),da)
            if name=='tan':return divide(da,power(call('cos',a),2))
            if name=='atan':return divide(da,add(constant(1),power(a,2)))
            if name=='sqrt':return divide(da,mul(constant(2),call('sqrt',a)))
            if name=='exp':return mul(call('exp',a),da)
            return divide(da,a)
        expression=object.__new__(Expression)
        expression.source=self.source;expression.variable=self.variable;expression.tree=d(self.tree)
        return expression

    def __call__(self, argument):
        def visit(node):
            if isinstance(node,ast.Constant):return argument.constant(float(node.value),argument.order)
            if isinstance(node,ast.Name):
                return argument if node.id==self.variable else argument.constant(math.pi if node.id=='pi' else math.e,argument.order)
            if isinstance(node,ast.UnaryOp):
                v=visit(node.operand);return -v if isinstance(node.op,ast.USub) else v
            if isinstance(node,ast.BinOp):
                a=visit(node.left)
                if isinstance(node.op,ast.Pow):return a**self._integer(node.right)
                b=visit(node.right)
                if isinstance(node.op,ast.Add):return a+b
                if isinstance(node.op,ast.Sub):return a-b
                if isinstance(node.op,ast.Mult):return a*b
                return a/b
            a=visit(node.args[0]);name=node.func.id
            if name=='sin':return a.sincos()[0]
            if name=='cos':return a.sincos()[1]
            return getattr(a,name)()
        try:
            out=visit(self.tree)
        except (OverflowError,ZeroDivisionError) as exc:
            raise GenericLinkedError('singularity','表达式超出有限实数域。') from exc
        for c in out.c:
            if isinstance(c,Interval):
                finite=math.isfinite(c.lo) and math.isfinite(c.hi)
            else:finite=math.isfinite(c)
            if not finite:raise GenericLinkedError('singularity','表达式或自动导数产生非有限数。')
        return out

    def affine_parts(self,argument):
        """Keep additive native-coordinate constants separate until centering.

        f(u)=largeTranslation + tinyCurve is evaluated as separate summands;
        math.fsum of offset differences prevents destroying the tiny curve.
        This is algebraic rewriting of the same scalar source, not a change
        to a user's saved expression or a geometric tolerance adjustment.
        """
        zero=argument.constant(0.,argument.order)
        def add_dynamic(a,b):
            if a is None:return b
            if b is None:return a
            return a+b
        def total(parts):return (parts[1] if parts[1] is not None else zero)+math.fsum(parts[0])
        def multiply(a,b):
            ca,da=a;cb,db=b
            offset=[x*y for x in ca for y in cb]
            dynamic=None
            if da is not None:dynamic=da*math.fsum(cb)
            if db is not None:dynamic=add_dynamic(dynamic,db*math.fsum(ca))
            if da is not None and db is not None:dynamic=add_dynamic(dynamic,da*db)
            if len(offset)>256:offset=[math.fsum(offset)]
            return offset,dynamic
        def visit(node):
            if isinstance(node,ast.Constant):return [float(node.value)],None
            if isinstance(node,ast.Name):
                return ([],argument) if node.id==self.variable else ([math.pi if node.id=='pi' else math.e],None)
            if isinstance(node,ast.UnaryOp):
                c,d=visit(node.operand)
                return ([-x for x in c],-d if d is not None else None) if isinstance(node.op,ast.USub) else (c,d)
            if isinstance(node,ast.BinOp):
                a=visit(node.left)
                if isinstance(node.op,ast.Pow):
                    n=self._integer(node.right)
                    if n<0:return [],total(a)**n
                    out=([1.],None)
                    for _ in range(n):out=multiply(out,a)
                    return out
                b=visit(node.right)
                if isinstance(node.op,ast.Add):return a[0]+b[0],add_dynamic(a[1],b[1])
                if isinstance(node.op,ast.Sub):return a[0]+[-x for x in b[0]],add_dynamic(a[1],-b[1] if b[1] is not None else None)
                if isinstance(node.op,ast.Mult):return multiply(a,b)
                if b[1] is None:
                    denominator=math.fsum(b[0])
                    if denominator==0:raise GenericLinkedError('singularity','表达式出现零分母。')
                    return [x/denominator for x in a[0]],a[1]/denominator if a[1] is not None else None
                return [],total(a)/total(b)
            v=total(visit(node.args[0]));name=node.func.id
            if name=='sin':return [],v.sincos()[0]
            if name=='cos':return [],v.sincos()[1]
            return [],getattr(v,name)()
        try:
            offsets,dynamic=visit(self.tree)
        except (OverflowError,ZeroDivisionError) as exc:
            raise GenericLinkedError('singularity','原生表达式超出有限实数域。') from exc
        for x in offsets:
            if not math.isfinite(x):raise GenericLinkedError('singularity','原生坐标常数非有限。')
        if dynamic is not None:
            for x in dynamic.c:
                if isinstance(x,Interval):valid=math.isfinite(x.lo) and math.isfinite(x.hi)
                else:valid=math.isfinite(x)
                if not valid:raise GenericLinkedError('singularity','原生坐标或高阶导数非有限。')
        return offsets,dynamic if dynamic is not None else zero


def normalize_expression(source):
    """Translate a bounded scalar Wolfram spelling; preserve source in query.

    Accept Sin[u], ArcTan[s], Pi, ^, and adjacent scalar factors.  This is a
    lexer, not Wolfram evaluation: no definitions, lists, patterns or code.
    """
    names={'Sin':'sin','Cos':'cos','Tan':'tan','ArcTan':'atan','Sqrt':'sqrt',
           'Exp':'exp','Log':'log','Pi':'pi','E':'e'}
    pattern=re.compile(r'\s*(\*\*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[\[\]()+*/^,-])')
    tokens=[];offset=0
    while offset<len(source):
        match=pattern.match(source,offset)
        if match is None:
            if not source[offset:].strip():break
            raise GenericLinkedError('expression-contract','表达式包含不允许的字符或代码。')
        token=match.group(1);tokens.append(names.get(token,{'[':'(',']':')','^':'**'}.get(token,token)))
        offset=match.end()
    def word(t):return bool(re.match(r'^(?:[A-Za-z_]|\d|\.)',t))
    out=[]
    for token in tokens:
        if out:
            previous=out[-1]
            if (word(previous) or previous==')') and (word(token) or token=='(') and not (previous in Expression.FUNCTIONS and token=='('):out.append('*')
        out.append(token)
    return ''.join(out)
