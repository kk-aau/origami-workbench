"""A bounded numeric expression subset for Origamica's vector pfn/rfn.

Each input is [x(phi), y(phi)] in units of the ring's base radius.  The
grammar is deliberately periodic: phi occurs only inside sin/cos with an
integer frequency, possibly composed through exp/sqrt or the C1 piecewise
form, so endpoint equality is structural rather than sampled.
No Python names, attributes, indexing, comprehensions, or user functions run.
"""
import ast
import copy
import math
import re
from collections import Counter

from tessellation_ring_vector_fourier import (
    FourierCurve, _add_intervals, _scaled_interval, _subtract_intervals,
    _trig_bounds,
)
from tessellation_ring_signed_power import SignedPowerSuperellipse


_WOLFRAM_ESCAPES = {
    r'\[Phi]': 'phi', r'\[CurlyPhi]': 'phi', r'\[Pi]': 'pi',
    r'\[Tau]': 'tau', r'\[Degree]': 'degree', r'\[LessEqual]': '<=', r'\[GreaterEqual]': '>=',
    'φ': 'phi', 'ϕ': 'phi', 'π': 'pi', 'τ': 'tau', '°': 'degree', '≤': '<=', '≥': '>=',
}
_MATH_NAMES = {
    'Sin': 'sin', 'Cos': 'cos', 'Exp': 'exp', 'Sqrt': 'sqrt', 'Log':'_ring_log', 'log':'_ring_log',
    'Sign': 'sign', 'Abs': 'abs', 'Pi': 'pi', 'Tau': 'tau',
    'E': 'e', 'Degree': 'degree', 'Piecewise': 'wolfram_piecewise', 'If': 'conditional',
}
_MATH_FUNCTIONS = frozenset(('sin', 'cos', 'exp', 'sqrt', '_ring_log', 'sign', 'abs', 'piecewise', 'wolfram_piecewise', 'conditional'))
_MATH_NAMES_ALLOWED = _MATH_FUNCTIONS | frozenset(('phi', 'pi', 'tau', 'e', 'degree', 'i'))
_MATH_TOKEN = re.compile(
    r'(?P<space>\s+)|(?P<number>(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+|\*\^[+-]?\d+)?)|'
    r'(?P<name>[A-Za-z_][A-Za-z_0-9]*)|(?P<op>\*\*|[<>]=?|[+\-*/^(),\[\]{}])'
)


def _numeric_formula_syntax(source, symbols=(), functions=()):
    """Normalize a small Wolfram numeric syntax, then leave semantics to the AST gate.

    Function brackets, power, and adjacent scalar products are lexical only:
    neither arbitrary Mathematica definitions nor Python expressions execute.
    The original source string remains in the saved project.
    """
    for original, replacement in _WOLFRAM_ESCAPES.items():
        source = source.replace(original, replacement)
    pieces = []
    previous = None
    offset = 0
    delimiters = []
    while offset < len(source):
        match = _MATH_TOKEN.match(source, offset)
        if match is None:
            raise ValueError('二维向量公式含不支持的字符或 Mathematica 结构。')
        offset = match.end()
        kind = match.lastgroup
        if kind == 'space':
            continue
        token = match.group()
        if kind == 'name':
            if token=='_ring_log':raise ValueError('不接受内部数值函数名称。')
            token = token if token in symbols or token in functions else _MATH_NAMES.get(token, token)
            if token not in _MATH_NAMES_ALLOWED and token not in symbols and token not in functions:
                raise ValueError('二维向量公式含不支持的函数或符号。')
            current = 'function' if token in _MATH_FUNCTIONS or token in functions else 'atom'
        elif kind == 'number':
            current = 'atom'
            token = token.replace('*^', 'e')
        else:
            if token == '[':
                if previous != 'function':
                    raise ValueError('Mathematica 方括号只用于受支持的函数调用。')
                delimiters.append('[')
            elif token in ('(', '{'):
                delimiters.append(token)
            elif token in (')', ']', '}'):
                if not delimiters or delimiters.pop() != {')': '(', ']': '[', '}': '{'}[token]:
                    raise ValueError('二维向量公式的括号不配对。')
            current = 'open' if token in ('(', '[', '{') else 'close' if token in (')', ']', '}') else 'operator'
            token = {'[': '(', ']': ')', '{': '[', '}': ']', '^': '**'}.get(token, token)
        if previous in ('atom', 'close') and current in ('atom', 'function', 'open'):
            pieces.append('*')
        pieces.append(token)
        previous = current
    if delimiters:
        raise ValueError('二维向量公式的括号不配对。')
    normalized = ''.join(pieces)
    if len(normalized) > 256:
        raise ValueError('二维向量公式过于复杂。')
    return normalized


class _VectorFunctionRegistry(dict):
    def __init__(self, source=()):
        super().__init__()
        self.source = tuple(source)


def _bounded_tree(node):
    if sum(1 for _ in ast.walk(node)) > 64:
        raise ValueError('二维向量公式展开后过于复杂，最多 64 个语法节点。')
    return node


def _numeric_walk(node):
    """Include bounded definition templates in validation, before dispatch."""
    for item in ast.walk(node):
        yield item
        for template in tuple(getattr(item,'local_cases',()))+tuple(getattr(item,'local_definitions',())):
            yield from _numeric_walk(template)


def _replace_names(node, bindings):
    class Substitute(ast.NodeTransformer):
        def visit_Name(self, item):
            return copy.deepcopy(bindings[item.id]) if item.id in bindings else copy.copy(item)
    return _bounded_tree(Substitute().visit(copy.deepcopy(node)))


def _split_numeric_parts(source, separator=','):
    """Split commas only at lexical top level; no expression executes."""
    parts, stack, start = [], [], 0
    for index, char in enumerate(source):
        if char in '[({':stack.append(char)
        elif char in '])}':
            if not stack or stack.pop()!={']':'[',')':'(','}':'{'}[char]:
                raise ValueError('局部数值表达式的括号不配对。')
        elif char==separator and not stack:
            parts.append(source[start:index]);start=index+1
    if stack:raise ValueError('局部数值表达式的括号不配对。')
    return parts+[source[start:]]


_LOCAL_IDENTIFIER = r'[A-Za-z][A-Za-z0-9]{0,23}'
_LOCAL_RESERVED = (set(_MATH_NAMES) | (_MATH_NAMES_ALLOWED - {'i','phi'}) | {'Module'})-{'Log','log'}


class _NumericScope:
    """Compilation-only lexical cells: no Python/Wolfram user code executes."""
    def __init__(self, parent=None, values=None, writable=False):
        self.parent, self.values, self.functions = parent, dict(values or {}), {}
        self.writable = writable

    def owner(self, name):
        if name in self.values:
            return self
        return self.parent.owner(name) if self.parent else None

    def visible(self):
        values = self.parent.visible() if self.parent else {}
        values.update({name:self for name in self.values})
        return values


def _local_function_statement(source):
    match = re.fullmatch(r'\s*('+_LOCAL_IDENTIFIER+r')\s*\[([^\[\]]*)\]\s*(:=|=)\s*(.+?)\s*',source,re.S)
    if not match:
        return None
    name, patterns, operator, body = match.groups()
    parameters, literals = [], []
    for pattern in patterns.split(','):
        formal = re.fullmatch(r'\s*('+_LOCAL_IDENTIFIER+r')_\s*',pattern)
        number = re.fullmatch(r'\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+|\*\^[+-]?\d+)?)\s*',pattern)
        if formal:
            parameters.append(formal.group(1));literals.append(None)
        elif number:
            parameters.append(None);literals.append(_finite(float(number.group(1).replace('*^','e'))))
        else:
            raise ValueError('Module 局部函数参数只接受 name_ 或有限实数字面量。')
    named = [p for p in parameters if p is not None]
    if not 1 <= len(parameters) <= 4 or len(set(named)) != len(named) or any(p in _LOCAL_RESERVED for p in named):
        raise ValueError('Module 局部函数须有 1–4 个互不重名的数值模式参数。')
    return name, tuple(parameters), tuple(literals), operator, body


class _NumericParser:
    def __init__(self, symbols, functions):
        self.scope = _NumericScope(values={name:ast.Name(id=name,ctx=ast.Load()) for name in symbols})
        self.external = set(functions)
        self.serial = self.visits = 0
        self.active = set()
        self.write_barriers = []

    def fresh(self, prefix):
        self.serial += 1
        return prefix+str(self.serial)

    def parse(self, source, scope=None):
        self.visits += 1
        if self.visits > 1024:
            raise ValueError('Module 数值展开超过有限预算。')
        scope = scope or self.scope
        if not isinstance(source,str) or not 1 <= len(source) <= 120:
            raise ValueError('二维向量公式每个分量／函数体须为 1–120 字符。')
        # Keep Modules unevaluated until AST traversal reaches them. Hoisting
        # a nested assignment would turn a + Module[{},a=2;a] from 3 into 4.
        modules = {}
        while True:
            match = re.search(r'\bModule\s*\[',source)
            if match is None:
                break
            opening=source.index('[',match.start());depth=1;closing=opening+1
            while closing<len(source) and depth:
                depth+=(source[closing]=='[')-(source[closing]==']');closing+=1
            if depth:
                raise ValueError('Module 的括号不配对。')
            placeholder=self.fresh('ModuleReadSlot')
            while placeholder in source or placeholder in scope.visible() or placeholder in self.external:
                placeholder += 'Q'
            modules[placeholder]=source[opening+1:closing-1]
            source=source[:match.start()]+placeholder+source[closing:]
        visible=scope.visible()
        calls=(self.external-set(visible)) | {name for name,owner in visible.items() if name in owner.functions}
        try:
            tree=ast.parse(_numeric_formula_syntax(source,set(visible)|set(modules),calls),mode='eval').body
        except SyntaxError as error:
            raise ValueError('二维向量公式语法无效。') from error

        def resolve(item):
            if isinstance(item,ast.Name):
                if item.id in modules:
                    return self.module(modules[item.id],scope)
                owner=scope.owner(item.id)
                if owner:
                    value=owner.values[item.id]
                    if value is None or item.id in owner.functions:
                        raise ValueError('Module 局部量须先赋值，局部函数不能作为数值返回。')
                    return copy.deepcopy(value)
                return copy.copy(item)
            if isinstance(item,ast.Call):
                if not isinstance(item.func,ast.Name) or item.keywords:
                    raise ValueError('数值调用只接受函数名与位置参数。')
                if item.func.id=='conditional' and len(item.args)==3:
                    condition=resolve(item.args[0])
                    # If holds its branches. Eager lexical expansion must not
                    # leak a branch's writes into the surrounding Module and
                    # turn a discontinuous source into a constant certificate.
                    captured=set();current=scope
                    while current:
                        captured.add(id(current));current=current.parent
                    self.write_barriers.append(captured)
                    try:arguments=[condition,resolve(item.args[1]),resolve(item.args[2])]
                    finally:self.write_barriers.pop()
                else:
                    arguments=[resolve(argument) for argument in item.args]
                owner=scope.owner(item.func.id)
                if owner:
                    cases=owner.functions.get(item.func.id)
                    if not cases:
                        raise ValueError('Module 局部函数须先定义再调用。')
                    return self.local_call(owner,item.func.id,cases,arguments)
                return ast.Call(func=copy.copy(item.func),args=arguments,keywords=[])
            result=copy.copy(item)
            for field,value in ast.iter_fields(item):
                if isinstance(value,ast.AST):setattr(result,field,resolve(value))
                elif isinstance(value,list):setattr(result,field,[resolve(child) if isinstance(child,ast.AST) else child for child in value])
            return result
        return _bounded_tree(resolve(tree))

    def case_tree(self, owner, name, case):
        parameters,literals,source,immediate,formals=case
        key=(id(owner),name)
        if key in self.active:
            raise ValueError('Module 局部纯函数不允许递归或循环依赖。')
        if immediate is not None:
            return parameters,literals,copy.deepcopy(immediate),formals
        self.active.add(key)
        captured=set();current=owner
        while current:
            captured.add(id(current));current=current.parent
        self.write_barriers.append(captured)
        try:
            values={p:ast.Name(id=q,ctx=ast.Load()) for p,q in zip(parameters,formals) if p is not None}
            body=self.parse(source,_NumericScope(owner,values))
        finally:
            self.write_barriers.pop()
            self.active.remove(key)
        return parameters,literals,body,formals

    def local_call(self, owner, name, cases, arguments):
        if len(arguments)!=len(cases[0][0]):
            raise ValueError('Module 局部函数调用的参数数目无效。')
        parsed=[self.case_tree(owner,name,case) for case in cases]
        node=ast.Call(func=ast.Name(id='_lexical_function',ctx=ast.Load()),args=arguments,keywords=[])
        # Templates are individually bounded and structurally validated; the
        # selected executable body is again checked against 64 nodes.
        node.local_cases=[case[2] for case in parsed]
        node.local_parameters=[case[3] for case in parsed]
        node.local_literals=[case[1] for case in parsed]
        return _bounded_tree(node)

    def module(self, source, outer):
        parts=_split_numeric_parts(source)
        if len(parts)!=2:
            raise ValueError('数值 Module 须为 Module[{局部列表},赋值序列;末数值式]。')
        locals_text,body=(part.strip() for part in parts)
        if not locals_text.startswith('{') or not locals_text.endswith('}'):
            raise ValueError('数值 Module 须提供局部声明列表。')
        declarations=[] if not locals_text[1:-1].strip() else _split_numeric_parts(locals_text[1:-1])
        if len(declarations)>32:
            raise ValueError('数值 Module 最多 32 个局部名称。')
        values, audits = {}, []
        for declaration in declarations:
            local=re.fullmatch(r'\s*('+_LOCAL_IDENTIFIER+r')\s*(?:=(?!=)\s*(.+?))?\s*',declaration,re.S)
            if not local:
                raise ValueError('Module 局部声明须为 name 或 name=纯数值式。')
            name,initializer=local.groups()
            if name in values or name in _LOCAL_RESERVED:
                raise ValueError('Module 局部名称不能重复或覆盖内置函数与常数。')
            # All initializers read the outer scope, including same-name cells.
            value=self.parse(initializer,outer) if initializer is not None else None
            values[name]=value
            if value is not None:audits.append(value)
        scope=_NumericScope(outer,values,writable=True)
        statements=_split_numeric_parts(body,';')
        if len(statements)>33 or any(not part.strip() for part in statements):
            raise ValueError('Module 须有最多 32 条赋值／定义和非空末数值式。')
        for statement in statements[:-1]:
            definition=_local_function_statement(statement)
            if definition:
                name,parameters,literals,operator,source=definition
                owner=scope.owner(name)
                if owner is None or not owner.writable or any(id(owner) in barrier for barrier in self.write_barriers):
                    raise ValueError('Module 函数定义只能写入已声明的 Module 局部名。')
                if owner.values[name] is not None and name not in owner.functions:
                    raise ValueError('Module 同一局部名不能同时为标量与函数。')
                cases=owner.functions.setdefault(name,[])
                if cases and len(cases[0][0])!=len(parameters) or any(case[1]==literals for case in cases):
                    raise ValueError('Module 同名函数模式须同元数且不能重复。')
                formals=tuple(self.fresh('_lexical_formal') if p is not None else None for p in parameters)
                immediate=None
                if operator=='=':
                    provisional=(parameters,literals,source,None,formals)
                    immediate=self.case_tree(owner,name,provisional)[2]
                cases.append((parameters,literals,source,immediate,formals))
                continue
            assignment=re.fullmatch(r'\s*('+_LOCAL_IDENTIFIER+r')\s*=(?!=)\s*(.+?)\s*',statement,re.S)
            if assignment is None:
                raise ValueError('Module 中间语句只接受确定性局部赋值或局部纯函数定义。')
            name,source=assignment.groups();owner=scope.owner(name)
            if (owner is None or not owner.writable or name in owner.functions or
                    any(id(owner) in barrier for barrier in self.write_barriers)):
                raise ValueError('Module 赋值只能写入已声明的标量 Module 局部量。')
            value=self.parse(source,scope);owner.values[name]=value;audits.append(value)
        if any(scope.values[name] is None and name not in scope.functions for name in scope.values):
            raise ValueError('Module 未初始化局部名须在末表达式前赋值或定义。')
        definitions=[]
        for name,cases in scope.functions.items():
            if not any(all(value is None for value in case[1]) for case in cases):
                raise ValueError('Module 有限模式函数须有一条全 name_ 默认定义。')
            for case in cases:
                _,_,tree,_=self.case_tree(scope,name,case);definitions.append(tree)
        result=self.parse(statements[-1],scope)
        node=ast.Call(func=ast.Name(id='_lexical_module',ctx=ast.Load()),args=audits+[result],keywords=[])
        node.local_definitions=definitions
        return _bounded_tree(node)


def _parse_numeric_tree(source, symbols=(), functions=()):
    node=_NumericParser(symbols,functions).parse(source)
    _validate_numeric_structure(node,functions)
    return node


def _validate_numeric_structure(node, functions):
    """Validate every body, including uncalled Module-local definitions."""
    builtin_arities={'sin':(1,), 'cos':(1,), 'exp':(1,), 'sqrt':(1,), '_ring_log':(1,),
                     'sign':(1,), 'abs':(1,), 'piecewise':(3,4), 'wolfram_piecewise':(1,2), 'conditional':(3,),
                     '_lexical_module':tuple(range(1,66)), '_lexical_function':(1,2,3,4)}
    allowed=(ast.Constant,ast.Name,ast.Call,ast.BinOp,ast.UnaryOp,ast.List,ast.Compare,
             ast.Load,ast.Add,ast.Sub,ast.Mult,ast.Div,ast.Pow,ast.UAdd,ast.USub,
             ast.Gt,ast.GtE,ast.Lt,ast.LtE)
    lists,conditions,called_names=set(),set(),set()
    for item in _numeric_walk(node):
        if isinstance(item,ast.Call) and isinstance(item.func,ast.Name):
            called_names.add(id(item.func))
            if item.func.id=='conditional':
                if len(item.args)!=3 or not isinstance(item.args[0],ast.Compare):
                    raise ValueError('If 须有一个数值比较条件和两个数值分支。')
                conditions.add(id(item.args[0]))
            if item.func.id=='wolfram_piecewise':
                if not item.args or not isinstance(item.args[0],ast.List) or not 1<=len(item.args[0].elts)<=4:
                    raise ValueError('Piecewise 须提供有界分支列表。')
                lists.add(id(item.args[0]))
                for row in item.args[0].elts:
                    if not isinstance(row,ast.List) or len(row.elts)!=2 or not isinstance(row.elts[1],ast.Compare):
                        raise ValueError('Piecewise 分支须有数值式和比较条件。')
                    lists.add(id(row));conditions.add(id(row.elts[1]))
    for item in _numeric_walk(node):
        if not isinstance(item,allowed):
            raise ValueError('数值 Module 只接受白名单数值式，不能访问对象、索引或执行其他语句。')
        if isinstance(item,ast.Call):
            if not isinstance(item.func,ast.Name) or item.keywords:
                raise ValueError('数值函数只接受位置参数。')
            if isinstance(functions,dict) and item.func.id in functions:
                arities=(len(functions[item.func.id][0][0]),)
            elif item.func.id in functions:
                arities=tuple(range(1,5))
            else:
                arities=builtin_arities.get(item.func.id,())
            if len(item.args) not in arities:
                raise ValueError('数值函数调用的参数数目无效。')
        elif isinstance(item,ast.List) and id(item) not in lists:
            raise ValueError('数值函数的列表只用于 Piecewise 分支。')
        elif isinstance(item,ast.Compare) and id(item) not in conditions:
            raise ValueError('数值函数的比较只用于 If 或 Piecewise 条件。')
        elif isinstance(item,ast.Name) and id(item) not in called_names and item.id in set(functions)|set(_MATH_FUNCTIONS):
            raise ValueError('数值函数不能返回函数符号。')
        elif isinstance(item,ast.Constant):
            if type(item.value) not in (int,float):raise ValueError('数值函数只接受有限实数常量。')
            _finite(float(item.value))
        if isinstance(item,(ast.BinOp,ast.UnaryOp,ast.Call)):
            try:_constant(item)
            except _NonConstant:pass


def _function_registry(definitions):
    if isinstance(definitions, _VectorFunctionRegistry):
        return definitions
    if definitions is None:
        return _VectorFunctionRegistry()
    if not isinstance(definitions, list) or not 1 <= len(definitions) <= 8:
        raise ValueError('局部纯函数定义须为 1–8 条定义字符串。')
    registry = _VectorFunctionRegistry(definitions)
    declarations = {}
    reserved = (set(_MATH_NAMES_ALLOWED) | set(_MATH_NAMES) | {'Module'})-{'Log','log'}
    identifier = r'[A-Za-z][A-Za-z0-9]{0,23}'
    for source in definitions:
        if not isinstance(source, str) or not 1 <= len(source) <= 240:
            raise ValueError('局部纯函数每条定义须为 1–240 字符。')
        match = re.fullmatch(r'\s*('+identifier+r')\s*\[([^\[\]]*)\]\s*(?::=|=)\s*(.+?)\s*', source, re.S)
        if not match:
            raise ValueError('局部纯函数须写成 Name[x_,i_]:=数值式，不支持条件定义或一般符号模式。')
        name, parameters, body = match.groups()
        if name in reserved:
            raise ValueError('局部纯函数不能覆盖内置函数与常数。')
        patterns=parameters.split(',');parameters=[];literals=[]
        if not 1<=len(patterns)<=4:raise ValueError('局部纯函数须有 1–4 个有界模式参数。')
        for pattern in patterns:
            formal=re.fullmatch(r'\s*('+identifier+r')_\s*',pattern)
            if formal:
                parameters.append(formal.group(1));literals.append(None)
            else:
                number=re.fullmatch(r'\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+|\*\^[+-]?\d+)?)\s*',pattern)
                if number is None:raise ValueError('模式只接受 name_ 或有限实数字面量。')
                parameters.append(None);literals.append(_finite(float(number.group(1).replace('*^','e'))))
        named=[value for value in parameters if value is not None]
        if len(set(named))!=len(named) or any(value in reserved-{'i','phi'} for value in named):
            raise ValueError('局部纯函数参数不能重名或覆盖内置函数与常数。')
        cases=declarations.setdefault(name,[])
        if cases and len(cases[0][0])!=len(parameters):raise ValueError('同名有限模式须有相同参数数目。')
        if any(tuple(literals)==case[1] for case in cases):raise ValueError('局部纯函数不能重复同一模式。')
        cases.append((tuple(parameters),tuple(literals),body))
    if any(not any(all(v is None for v in literals) for _,literals,_ in cases) for cases in declarations.values()):
        raise ValueError('有限模式函数须有一条全 name_ 默认定义。')
    if any(set(parameters)&set(declarations) for cases in declarations.values() for parameters,_,_ in cases):
        raise ValueError('局部纯函数参数不能与局部函数同名。')
    dependencies = {name:set() for name in declarations}
    builtin_arities = {'sin': (1,), 'cos': (1,), 'exp': (1,), 'sqrt': (1,), '_ring_log': (1,),
                      'sign': (1,), 'abs': (1,), 'piecewise': (3,4), 'wolfram_piecewise': (1,2), 'conditional': (3,),
                      '_lexical_module': tuple(range(1,66)), '_lexical_function': (1,2,3,4)}
    constants = {'pi','tau','e','degree'}
    allowed_types = (ast.Constant,ast.Name,ast.Call,ast.BinOp,ast.UnaryOp,ast.List,ast.Compare,
                     ast.Load,ast.Add,ast.Sub,ast.Mult,ast.Div,ast.Pow,ast.UAdd,ast.USub,
                     ast.Gt,ast.GtE,ast.Lt,ast.LtE)
    parsed=[]
    for name,cases in declarations.items():
        for parameters,literals,body in cases:
            parsed.append((name,parameters,literals,_parse_numeric_tree(body,[p for p in parameters if p is not None],declarations)))
    for name,parameters,literals,node in parsed:
        called_names = set()
        piecewise_lists, piecewise_conditions = set(), set()
        for item in _numeric_walk(node):
            if isinstance(item, ast.Call) and isinstance(item.func, ast.Name):
                called_names.add(id(item.func))
                if item.func.id == 'conditional':
                    if len(item.args)!=3 or not isinstance(item.args[0],ast.Compare):
                        raise ValueError('If 须有一个数值比较条件和两个数值分支。')
                    piecewise_conditions.add(id(item.args[0]))
                if item.func.id == 'wolfram_piecewise':
                    if not item.args or not isinstance(item.args[0],ast.List) or not 1 <= len(item.args[0].elts) <= 4:
                        raise ValueError('局部函数中的 Piecewise 须提供显式分支列表。')
                    piecewise_lists.add(id(item.args[0]))
                    for row in item.args[0].elts:
                        if not isinstance(row,ast.List) or len(row.elts) != 2 or not isinstance(row.elts[1],ast.Compare):
                            raise ValueError('局部函数中的 Piecewise 分支须有数值式和比较条件。')
                        piecewise_lists.add(id(row))
                        piecewise_conditions.add(id(row.elts[1]))
        for item in _numeric_walk(node):
            if not isinstance(item, allowed_types):
                raise ValueError('局部纯函数只接受白名单数值表达式，不能访问对象、索引或执行语句。')
            if isinstance(item, ast.Call):
                if not isinstance(item.func, ast.Name) or item.keywords:
                    raise ValueError('局部纯函数只接受按位置传参的数值调用。')
                called = item.func.id
                if called in declarations:
                    dependencies[name].add(called)
                    arities = (len(declarations[called][0][0]),)
                else:
                    arities = builtin_arities.get(called, ())
                if len(item.args) not in arities:
                    raise ValueError('局部纯函数调用的参数数目无效。')
            elif (isinstance(item, ast.Name) and id(item) not in called_names and
                  item.id not in set(parameters) | constants and not item.id.startswith('_lexical_formal')):
                raise ValueError('局部纯函数不能引用未声明的自由变量或返回函数符号。')
            elif isinstance(item, ast.List) and id(item) not in piecewise_lists:
                raise ValueError('局部纯函数的列表只用于 Piecewise 分支，结果须为标量数值式。')
            elif isinstance(item, ast.Compare) and id(item) not in piecewise_conditions:
                raise ValueError('局部纯函数的比较只用于 If 或 Piecewise 分支条件。')
            elif isinstance(item, ast.Constant) and type(item.value) not in (int,float):
                raise ValueError('局部纯函数只接受实数常量。')
            if isinstance(item, ast.Constant):
                _finite(float(item.value))
            elif isinstance(item, (ast.BinOp,ast.UnaryOp,ast.Call)):
                # Invalid constant subexpressions are invalid declarations even
                # when the function is not called by either component.
                try:
                    _constant(item)
                except _NonConstant:
                    pass
        registry.setdefault(name,[]).append((parameters,literals,node))
    completed, visiting = set(), set()
    def visit(name):
        if name in visiting:
            raise ValueError('局部纯函数不允许递归或循环依赖。')
        if name in completed:
            return
        visiting.add(name)
        for dependency in dependencies[name]:
            visit(dependency)
        visiting.remove(name)
        completed.add(name)
    for name in registry:
        visit(name)
    return registry


def validate_vector_function_definitions(value):
    if not isinstance(value, list):
        raise ValueError('局部纯函数定义须为 1–8 条定义字符串。')
    _function_registry(value)
    return value.copy()


def _expanded_component(expression, registry, ring_index=None):
    node = _parse_numeric_tree(expression, functions=registry)
    visits = 0
    def expand(item, bindings):
        nonlocal visits
        visits += 1
        if visits > 1024:
            raise ValueError('局部纯函数展开超过有限预算。')
        if isinstance(item, ast.Name) and item.id in bindings:
            return _bounded_tree(copy.deepcopy(bindings[item.id]))
        if isinstance(item,ast.Call) and isinstance(item.func,ast.Name) and item.func.id=='_lexical_module':
            values=[expand(argument,bindings) for argument in item.args]
            for initializer in values[:-1]:
                try:
                    _constant(initializer,ring_index)
                except _NonConstant:
                    if any(_signed_power_component(initializer,trig,ring_index) is not None for trig in ('cos','sin')):
                        continue
                    try:
                        function=_compile(initializer,ring_index)
                    except ValueError:
                        # Affine angle locals may be used inside Sin/Cos after
                        # lexical substitution; they are finite on [0,2pi].
                        frequency,phase=_phase(initializer,ring_index)
                        _finite(phase);_finite(math.tau*frequency+phase)
                    else:
                        function(0.,math.tau)
            return values[-1]
        if (isinstance(item, ast.Call) and isinstance(item.func, ast.Name) and
                (item.func.id in registry or item.func.id=='_lexical_function')):
            cases=(list(zip(item.local_parameters,item.local_literals,item.local_cases))
                   if item.func.id=='_lexical_function' else registry[item.func.id])
            if item.keywords or len(item.args)!=len(cases[0][0]):
                raise ValueError('局部纯函数调用的参数数目无效。')
            arguments = [expand(argument, bindings) for argument in item.args]
            known=[]
            for argument in arguments:
                try:known.append(_constant(argument,ring_index))
                except _NonConstant:known.append(None)
            possible=[]
            for parameters,literals,body in cases:
                if any(literal is not None and value is not None and literal!=value
                       for literal,value in zip(literals,known)):continue
                definite=all(literal is None or value is not None for literal,value in zip(literals,known))
                possible.append((sum(literal is not None for literal in literals),definite,parameters,literals,body))
            # Every name has a total name_ default, so there is a definite case.
            definite=[case for case in possible if case[1]]
            specificity=max(case[0] for case in definite)
            selected=next(case for case in definite if case[0]==specificity)
            def body_value(case,values):
                locals={name:value for name,value in zip(case[2],values) if name is not None}
                return _bounded_tree(expand(case[4],{**bindings,**locals}))
            answer=body_value(selected,arguments)
            def equal(a,b):
                if ast.dump(a)==ast.dump(b):return True
                try:return _constant(a,ring_index)==_constant(b,ring_index)
                except _NonConstant:return False
            for case in possible:
                if case is selected or case[0]<specificity:continue
                if case[1]:
                    if not equal(answer,body_value(case,arguments)):
                        raise ValueError('同等具体的有限模式匹配结果不一致。')
                else:
                    # Unknown phi-dependent literal guards cannot simply be
                    # skipped: prove their value equals the selected body on
                    # that exact guard, or reject a potential isolated jump.
                    restricted=[ast.Constant(value=literal) if literal is not None else argument
                                for literal,argument in zip(case[3],arguments)]
                    if not equal(body_value(selected,restricted),body_value(case,restricted)):
                        raise ValueError('角度相关字面量模式无法证明在匹配处与默认值一致。')
            return answer
        result = copy.copy(item)
        for field, value in ast.iter_fields(item):
            if isinstance(value, ast.AST):
                setattr(result, field, expand(value, bindings))
            elif isinstance(value, list):
                setattr(result, field, [expand(child, bindings) if isinstance(child, ast.AST) else child for child in value])
        return _bounded_tree(result)
    return expand(node, {})


def _finite(value):
    if not math.isfinite(value) or abs(value) > 1e6:
        raise ValueError('二维向量公式的数值超出范围。')
    return value


class _NonConstant(ValueError):
    """An expression depends on phi or is outside the constant grammar."""


def _constant_condition(node, ring_index=None):
    """Bind the discrete ring index before selecting a numeric branch."""
    if (not isinstance(node, ast.Compare) or len(node.ops)!=1 or len(node.comparators)!=1 or
            type(node.ops[0]) not in (ast.Gt, ast.GtE, ast.Lt, ast.LtE)):
        raise ValueError('条件须为两个有限数值式之间的 >、>=、< 或 <= 比较。')
    left, right = _constant(node.left, ring_index), _constant(node.comparators[0], ring_index)
    op = type(node.ops[0])
    return {ast.Gt:lambda:left>right, ast.GtE:lambda:left>=right,
            ast.Lt:lambda:left<right, ast.LtE:lambda:left<=right}[op]()


def _constant(node, ring_index=None):
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        return _finite(float(node.value))
    if isinstance(node, ast.Name) and node.id in ('pi', 'tau', 'e', 'degree'):
        return {'pi': math.pi, 'tau': math.tau, 'e': math.e, 'degree': math.pi/180}[node.id]
    if isinstance(node, ast.Name) and node.id == 'i' and ring_index is not None:
        return float(ring_index)
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and
            node.func.id == 'conditional' and len(node.args)==3 and not node.keywords):
        selected = node.args[1] if _constant_condition(node.args[0], ring_index) else node.args[2]
        return _constant(selected, ring_index)
    if isinstance(node, ast.UnaryOp) and type(node.op) in (ast.UAdd, ast.USub):
        value = _constant(node.operand, ring_index)
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.BinOp) and type(node.op) in (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow):
        left, right = _constant(node.left, ring_index), _constant(node.right, ring_index)
        try:
            if isinstance(node.op, ast.Add): return _finite(left+right)
            if isinstance(node.op, ast.Sub): return _finite(left-right)
            if isinstance(node.op, ast.Mult): return _finite(left*right)
            if isinstance(node.op, ast.Pow):
                # math.pow is bounded-time and rejects complex-valued powers.
                if left == right == 0:
                    raise ValueError('0^0 不具有确定的实数值。')
                return _finite(math.pow(left, right))
            return _finite(left/right)
        except (ZeroDivisionError, OverflowError, ValueError) as error:
            raise ValueError('二维向量公式中的常数运算须有有限实数结果。') from error
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and
            node.func.id in ('sin', 'cos', 'exp', 'sqrt', '_ring_log', 'sign', 'abs') and len(node.args) == 1 and not node.keywords):
        argument = _constant(node.args[0], ring_index)
        if node.func.id == '_ring_log' and argument<=0:
            raise ValueError('Log 的原参数须严格为正。')
        if node.func.id == 'sqrt' and argument < 0:
            raise ValueError('二维向量公式的平方根实数域无效。')
        try:
            return _finite({'sin': math.sin, 'cos': math.cos, 'exp': math.exp, 'sqrt': math.sqrt, '_ring_log':math.log,
                            'sign':lambda x:float((x>0)-(x<0)), 'abs':abs}[node.func.id](argument))
        except OverflowError as error:
            raise ValueError('二维向量公式的数值超出范围。') from error
    raise _NonConstant('二维向量公式中的常数须为有限实数或 pi、tau、E、Degree。')


def _phase(node, ring_index=None):
    """Return a*phi+b; only integer a in 1..8 is accepted at the call site."""
    if isinstance(node, ast.Name) and node.id == 'phi':
        return 1., 0.
    if isinstance(node, ast.UnaryOp) and type(node.op) in (ast.UAdd, ast.USub):
        a, b = _phase(node.operand, ring_index)
        return (a, b) if isinstance(node.op, ast.UAdd) else (-a, -b)
    if isinstance(node, ast.BinOp) and type(node.op) in (ast.Add, ast.Sub):
        a, b = _phase(node.left, ring_index)
        c, d = _phase(node.right, ring_index)
        return (a+c, b+d) if isinstance(node.op, ast.Add) else (a-c, b-d)
    if isinstance(node, ast.BinOp) and type(node.op) in (ast.Mult, ast.Div):
        try:
            left = _constant(node.left, ring_index)
        except ValueError:
            left = None
        try:
            right = _constant(node.right, ring_index)
        except ValueError:
            right = None
        if isinstance(node.op, ast.Mult):
            if left is not None:
                a, b = _phase(node.right, ring_index)
                return _finite(left*a), _finite(left*b)
            if right is not None:
                a, b = _phase(node.left, ring_index)
                return _finite(right*a), _finite(right*b)
        elif right is not None and right != 0:
            a, b = _phase(node.left, ring_index)
            return _finite(a/right), _finite(b/right)
    return 0., _constant(node, ring_index)


def _product(a, b):
    values = [x*y for x in a for y in b]
    return min(values), max(values)


def _divide(a, b):
    if b[0] <= 0 <= b[1]:
        raise ValueError('二维向量公式的分母可能为零。')
    return _product(a, (1/b[1], 1/b[0]))


def _power(a, exponent):
    if exponent == 0:
        return 1., 1.
    if exponent % 2:
        return a[0]**exponent, a[1]**exponent
    ends = a[0]**exponent, a[1]**exponent
    return (0. if a[0] <= 0 <= a[1] else min(ends)), max(ends)


def _hull(a, b):
    return min(a[0], b[0]), max(a[1], b[1])


def _piecewise_base_terms(branch, gate):
    """Remove only terms with a visible g² factor; the rest must match."""
    gate_key = ast.dump(gate)
    base = Counter()

    def has_gate_square(term):
        factors = []
        def split_product(node):
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult):
                split_product(node.left)
                split_product(node.right)
            else:
                factors.append(node)
        split_product(term)
        if any(isinstance(item, ast.BinOp) and isinstance(item.op, ast.Pow) and
               ast.dump(item.left) == gate_key and isinstance(item.right, ast.Constant) and
               type(item.right.value) is int and item.right.value >= 2 for item in factors):
            return True
        return sum(ast.dump(item) == gate_key for item in factors) >= 2

    def visit(node, sign=1):
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            visit(node.operand, sign if isinstance(node.op, ast.UAdd) else -sign)
        elif isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
            visit(node.left, sign)
            visit(node.right, sign if isinstance(node.op, ast.Add) else -sign)
        elif (isinstance(node, ast.Constant) and type(node.value) in (int, float) and
              node.value == 0):
            return
        elif not has_gate_square(node):
            base[ast.dump(node)] += sign

    visit(branch)
    return tuple(sorted((term, count) for term, count in base.items() if count))


def _compile(node, ring_index=None):
    """A node returns (value interval, derivative interval) over phi bounds."""
    try:
        value = _constant(node, ring_index)
    except _NonConstant:
        pass
    else:
        return lambda low, high: ((value, value), (0., 0.))
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and
            node.func.id == 'conditional' and len(node.args)==3 and not node.keywords):
        try:
            selected = node.args[1] if _constant_condition(node.args[0], ring_index) else node.args[2]
        except _NonConstant:
            # A numeric angular If has exactly the original one-guard
            # Piecewise semantics. Use its entire existing gate/C1/interval
            # kernel; no sampling or weaker continuity test is introduced.
            converted = ast.Call(func=ast.Name(id='wolfram_piecewise',ctx=ast.Load()),
                args=[ast.List(elts=[ast.List(elts=[node.args[1],node.args[0]],ctx=ast.Load())],ctx=ast.Load()),node.args[2]],keywords=[])
            return _compile(converted,ring_index)
        # If evaluates only the selected numeric branch; an unselected c/i
        # must not introduce a spurious singularity at i=0.
        return _compile(selected, ring_index)
    if isinstance(node, ast.UnaryOp) and type(node.op) in (ast.UAdd, ast.USub):
        child = _compile(node.operand, ring_index)
        if isinstance(node.op, ast.UAdd): return child
        return lambda low, high: tuple(_scaled_interval(row, -1.) for row in child(low, high))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ('sin', 'cos') and len(node.args) == 1 and not node.keywords:
        frequency, phase = _phase(node.args[0], ring_index)
        if not frequency.is_integer() or not 1 <= abs(frequency) <= 8 or abs(phase) > 1e3:
            raise ValueError('三角函数角度须为整数频率 1–8 的 phi 加有限常相位。')
        def evaluate(low, high):
            a, b = sorted((frequency*low+phase, frequency*high+phase))
            if node.func.id == 'sin':
                return _trig_bounds(a, b), _scaled_interval(_trig_bounds(a, b, True), frequency)
            return _trig_bounds(a, b, True), _scaled_interval(_trig_bounds(a, b), -frequency)
        return evaluate
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and
            node.func.id == 'wolfram_piecewise' and len(node.args) in (1, 2) and not node.keywords):
        rows = node.args[0]
        if not isinstance(rows, ast.List) or not 1 <= len(rows.elts) <= 4:
            raise ValueError('Piecewise 须有 1–4 个 {数值式, 条件} 分支。')
        default_node = node.args[1] if len(node.args) == 2 else ast.Constant(value=0)
        # Constant guards cannot create an angular seam. Preserve original
        # first-match ordering and retain the existing C1 proof as soon as a
        # condition depends on phi.
        for row in rows.elts:
            try:
                selected = _constant_condition(row.elts[1], ring_index)
            except _NonConstant:
                break
            if selected:
                return _compile(row.elts[0], ring_index)
        else:
            return _compile(default_node, ring_index)
        branches, gates = [], []
        for row in rows.elts:
            if not isinstance(row, ast.List) or len(row.elts) != 2:
                raise ValueError('Piecewise 每个分支须为 {数值式, 条件}。')
            branch, condition = row.elts
            if (not isinstance(condition, ast.Compare) or len(condition.ops) != 1 or
                    type(condition.ops[0]) not in (ast.Gt, ast.GtE, ast.Lt, ast.LtE)):
                raise ValueError('Piecewise 条件须为两个光滑数值式之间的 >、>=、< 或 <= 比较。')
            left, right = condition.left, condition.comparators[0]
            positive = isinstance(condition.ops[0], (ast.Gt, ast.GtE))
            strict = isinstance(condition.ops[0], (ast.Gt, ast.Lt))
            is_zero = lambda item: isinstance(item, ast.Constant) and type(item.value) in (int, float) and item.value == 0
            if is_zero(right):
                gate_node = left
            elif is_zero(left):
                gate_node, positive = right, not positive
            else:
                gate_node = ast.BinOp(left=left, op=ast.Sub(), right=right)
            gates.append((gate_node, _compile(gate_node, ring_index), positive, strict))
            branches.append((branch, _compile(branch, ring_index)))
        # Every potentially active branch must agree in value and first
        # derivative on every switching surface, including overlapping guards.
        # Checking only a branch against its own default is insufficient: a
        # later branch could be discontinuous where an earlier guard ends.
        for gate_node, _, _, _ in gates:
            reference = _piecewise_base_terms(default_node, gate_node)
            if any(_piecewise_base_terms(branch, gate_node) != reference for branch, _ in branches):
                raise ValueError('Piecewise 所有分支与默认式的差异须含每个条件函数的平方因子，以证明全部接缝一阶连续。')
        default = _compile(default_node, ring_index)
        def evaluate(low, high):
            candidates = []
            for (_, gate, positive, strict), (_, branch) in zip(gates, branches):
                value, _ = gate(low, high)
                if not positive:
                    value = _scaled_interval(value, -1.)
                definitely_true = value[0] > 0 if strict else value[0] >= 0
                definitely_false = value[1] <= 0 if strict else value[1] < 0
                if definitely_false:
                    continue
                candidates.append(branch(low, high))
                if definitely_true:
                    break
            else:
                candidates.append(default(low, high))
            result = candidates[0]
            for candidate in candidates[1:]:
                result = tuple(_hull(a, b) for a, b in zip(result, candidate))
            return result
        return evaluate
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and
            node.func.id == 'piecewise' and len(node.args) in (3, 4) and not node.keywords):
        gate = _compile(node.args[0], ring_index)
        if len(node.args) == 3:
            positive_node, negative_node = node.args[1:]
            if _piecewise_base_terms(positive_node, node.args[0]) != _piecewise_base_terms(negative_node, node.args[0]):
                raise ValueError('三参数分段的两支须有相同基式，差异项须含条件函数的平方因子，以证明接缝一阶连续。')
            positive, negative = (_compile(arg, ring_index) for arg in (positive_node, negative_node))
        else:
            base, positive, negative = (_compile(arg, ring_index) for arg in node.args[1:])
        def evaluate(low, high):
            g, dg = gate(low, high)
            if len(node.args) == 3:
                above, below = positive(low, high), negative(low, high)
            else:
                b, db = base(low, high)
                g_squared = _power(g, 2)
                twice_g_dg = _product(_scaled_interval(g, 2.), dg)
                def branch(function):
                    extra, dextra = function(low, high)
                    return (_add_intervals(b, _product(g_squared, extra)),
                            _add_intervals(db, _add_intervals(_product(twice_g_dg, extra),
                                                             _product(g_squared, dextra))))
                above, below = branch(positive), branch(negative)
            # The accepted branches differ only by g² times smooth terms, so
            # values and first derivatives agree at every g=0 switch.
            if g[0] >= 0:
                return above
            if g[1] < 0:
                return below
            return tuple(_hull(a, b) for a, b in zip(above, below))
        return evaluate
    if (isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and
            node.func.id=='_ring_log' and len(node.args)==1 and not node.keywords):
        from tessellation_ring_log_interval import argument_bounds,I
        child=_compile(node.args[0],ring_index)
        def evaluate(low,high):
            value,derivative=argument_bounds(node.args[0],low,high,ring_index,_constant)
            if value.lo<=0:raise ValueError('Log 参数在完整角区间未证明严格为正；未移动点或截断负值。')
            if low==high:
                # Original floating point evaluation stays a point value;
                # positive-domain proof above is independently outward-rounded.
                v,d=child(low,high)
                if v[0]<=0:raise ValueError('Log 的原求值参数须严格为正。')
                ratios=[_finite(x/y) for x in d for y in v]
                return (math.log(v[0]),math.log(v[1])),(min(ratios),max(ratios))
            return value.unary('log').pair(),(derivative/value).pair()
        return evaluate
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and
            node.func.id in ('exp', 'sqrt') and len(node.args) == 1 and not node.keywords):
        child = _compile(node.args[0], ring_index)
        def evaluate(low, high):
            value, derivative = child(low, high)
            if node.func.id == 'sqrt':
                # A strictly positive enclosure makes sqrt smooth on the whole
                # interval. A zero seen only between samples is rejected too.
                if value[0] <= 0:
                    raise ValueError('二维向量公式的平方根须在整段角度内严格为正。')
                result = math.sqrt(value[0]), math.sqrt(value[1])
                slope = 1/(2*result[1]), 1/(2*result[0])
            else:
                try:
                    result = math.exp(value[0]), math.exp(value[1])
                except OverflowError as error:
                    raise ValueError('二维向量公式的指数值超出范围。') from error
                slope = result
            result = tuple(_finite(bound) for bound in result)
            slope = tuple(_finite(bound) for bound in slope)
            return result, _product(slope, derivative)
        return evaluate
    if isinstance(node, ast.BinOp) and type(node.op) in (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow):
        left = _compile(node.left, ring_index)
        if isinstance(node.op, ast.Pow):
            exponent = _constant(node.right, ring_index)
            if not exponent.is_integer() or not 0 <= exponent <= 4:
                raise ValueError('二维向量公式的幂只接受 0–4 的整数。')
            exponent = int(exponent)
            def evaluate(low, high):
                value, derivative = left(low, high)
                if exponent == 0: return (1., 1.), (0., 0.)
                return _power(value, exponent), _product(_scaled_interval(_power(value, exponent-1), exponent), derivative)
            return evaluate
        right = _compile(node.right, ring_index)
        def evaluate(low, high):
            a, da = left(low, high)
            b, db = right(low, high)
            if isinstance(node.op, ast.Add): return _add_intervals(a, b), _add_intervals(da, db)
            if isinstance(node.op, ast.Sub): return _subtract_intervals(a, b), _subtract_intervals(da, db)
            if isinstance(node.op, ast.Mult): return _product(a, b), _add_intervals(_product(da, b), _product(a, db))
            return _divide(a, b), _divide(_subtract_intervals(_product(da, b), _product(a, db)), _power(b, 2))
        return evaluate
    raise ValueError('二维向量公式只接受数字、pi/tau、sin/cos/exp/sqrt/log、可证明一阶连续的分段、四则运算和有界整数幂。')


def compile_vector_component(expression, ring_index=None, function_definitions=None):
    registry = _function_registry(function_definitions)
    return _compile(_expanded_component(expression, registry, ring_index), ring_index)


def _signed_power_component(node, trig, ring_index):
    """Recognize only Sign[trig[phi]] Abs[trig[phi]]^(1/p)."""
    if not isinstance(node, ast.BinOp) or not isinstance(node.op, ast.Mult):
        return None
    for sign, power in ((node.left, node.right), (node.right, node.left)):
        if (not isinstance(sign, ast.Call) or not isinstance(sign.func, ast.Name) or
                sign.func.id != 'sign' or len(sign.args) != 1 or sign.keywords or
                not isinstance(power, ast.BinOp) or not isinstance(power.op, ast.Pow) or
                not isinstance(power.left, ast.Call) or
                not isinstance(power.left.func, ast.Name) or power.left.func.id != 'abs' or
                len(power.left.args) != 1 or power.left.keywords):
            continue
        argument = sign.args[0]
        if (not isinstance(argument, ast.Call) or not isinstance(argument.func, ast.Name) or
                argument.func.id != trig or len(argument.args) != 1 or argument.keywords or
                not isinstance(argument.args[0], ast.Name) or argument.args[0].id != 'phi' or
                ast.dump(argument) != ast.dump(power.left.args[0])):
            continue
        exponent = power.right
        if (not isinstance(exponent, ast.BinOp) or not isinstance(exponent.op, ast.Div) or
                not isinstance(exponent.left, ast.Constant) or
                type(exponent.left.value) is not int or exponent.left.value != 1):
            continue
        denominator = exponent.right
        if isinstance(denominator, ast.Constant) and type(denominator.value) is int:
            result = denominator.value
        elif (ring_index is not None and isinstance(denominator, ast.BinOp) and
              isinstance(denominator.op, ast.Add) and
              ((isinstance(denominator.left, ast.Name) and denominator.left.id == 'i' and
                isinstance(denominator.right, ast.Constant) and
                type(denominator.right.value) is int and denominator.right.value == 1) or
               (isinstance(denominator.right, ast.Name) and denominator.right.id == 'i' and
                isinstance(denominator.left, ast.Constant) and
                type(denominator.left.value) is int and denominator.left.value == 1))):
            result = ring_index + 1
        else:
            # A pure-function call with a literal ring index leaves a constant
            # expression such as 1/(1+0), rather than a literal denominator.
            # Keep indexed powers on the i+1 contract above; fold only an
            # index-independent denominator and require an exact integer.
            try:
                result = _constant(denominator)
            except _NonConstant:
                continue
            if not result.is_integer():
                continue
            result = int(result)
        if 1 <= result <= 8:
            return result
    return None


def _signed_power_pair(value, ring_index, registry):
    if not isinstance(value, list) or len(value) != 2:
        return None
    nodes = []
    for expression in value:
        if not isinstance(expression, str) or not 1 <= len(expression) <= 120:
            return None
        nodes.append(_expanded_component(expression, registry, ring_index))
    # A literal ring-zero overload can return x rather than Sign[x]Abs[x]^1.
    # The whole exact unit-circle pair is the same analytic power-one domain.
    if all(isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id==trig
           and len(node.args)==1 and not node.keywords and isinstance(node.args[0],ast.Name)
           and node.args[0].id=='phi' for node,trig in zip(nodes,('cos','sin'))):
        return 1
    x = _signed_power_component(nodes[0], 'cos', ring_index)
    y = _signed_power_component(nodes[1], 'sin', ring_index)
    return x if x is not None and x == y else None


def vector_expression_curve(value, ring_index=None, function_definitions=None):
    """Use exact radial bounds for the notebook's nonsmooth superellipse pair."""
    if ring_index is not None and (type(ring_index) is not int or not 0 <= ring_index <= 64):
        raise ValueError('二维向量公式的环索引必须是 0–64 的整数。')
    registry = _function_registry(function_definitions)
    power = _signed_power_pair(value, ring_index, registry)
    return SignedPowerSuperellipse(power) if power is not None else VectorExpressionCurve(value, ring_index, registry)


def validate_vector_expression(value, function_definitions=None):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError('二维向量公式须为 [x(phi), y(phi)]。')
    vector_expression_curve(value, function_definitions=function_definitions)
    return value.copy()


def validate_vector_template(value, count, function_definitions=None):
    """Validate the same pfn[i]/rfn[i] body at every ring index used."""
    if not isinstance(value, list) or len(value) != 2 or type(count) is not int or not 1 <= count <= 65:
        raise ValueError('索引二维向量公式须为 [x(i,phi), y(i,phi)]。')
    for index in range(count):
        vector_expression_curve(value, index, function_definitions)
    return value.copy()


class VectorExpressionCurve(FourierCurve):
    """Certified periodic numeric pfn/rfn using FourierCurve's ray machinery."""

    def __init__(self, value, ring_index=None, function_definitions=None):
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError('二维向量公式须为 [x(phi), y(phi)]。')
        if ring_index is not None and (type(ring_index) is not int or not 0 <= ring_index <= 64):
            raise ValueError('二维向量公式的环索引必须是 0–64 的整数。')
        self.expressions = tuple(value)
        self.index = ring_index
        registry = _function_registry(function_definitions)
        self._functions = tuple(compile_vector_component(item, ring_index, registry) for item in value)
        self.offset = ()
        # A template evaluated at different i is not the same radial shape.
        self.harmonics = (self.index, self.expressions, registry.source)
        self._samples = 256
        self._checks = 0
        self.min_norm, self.max_norm = math.inf, 0.
        for index in range(self._samples):
            self._certify_interval(math.tau*index/self._samples, math.tau*(index+1)/self._samples, 0)
        first = self.point(1., 0.)
        self.first_angle = math.atan2(first[1], first[0])
        self.angles = [0.]
        previous = self.first_angle
        for index in range(1, self._samples+1):
            point = self.point(1., math.tau*index/self._samples)
            angle = math.atan2(point[1], point[0])
            increment = (angle-previous+math.pi) % math.tau-math.pi
            if not 0 < increment < math.pi/2:
                raise ValueError('二维向量公式的极角未严格递增。')
            self.angles.append(self.angles[-1]+increment)
            previous = angle
        if abs(self.angles[-1]-math.tau) > 1e-9:
            raise ValueError('二维向量公式必须绕原点单圈闭合。')

    def _components(self, low, high, derivative=False):
        rows = [function(low, high) for function in self._functions]
        return [row[1 if derivative else 0] for row in rows]

    def _certify_interval(self, low, high, depth):
        self._checks += 1
        if self._checks > 16000:
            raise ValueError('二维向量公式过于复杂，无法在计算限额内认证。')
        position = self._components(low, high)
        derivative = self._components(low, high, True)
        winding = _subtract_intervals(_product(position[0], derivative[1]),
                                      _product(position[1], derivative[0]))
        closest = lambda pair: max(0., pair[0], -pair[1])
        minimum = math.hypot(*(closest(pair) for pair in position))
        maximum = math.hypot(*(max(abs(pair[0]), abs(pair[1])) for pair in position))
        if all(math.isfinite(v) and abs(v) <= 1e6 for pair in position+derivative for v in pair) and winding[0] > 1e-5 and minimum > 1e-5 and maximum < 4:
            self.min_norm = min(self.min_norm, minimum)
            self.max_norm = max(self.max_norm, maximum)
            return
        if depth == 0:
            for phi in (low, (low+high)/2, high):
                p = self._components(phi, phi)
                d = self._components(phi, phi, True)
                cross = _subtract_intervals(_product(p[0], d[1]), _product(p[1], d[0]))
                if cross[1] <= 1e-5 or math.hypot(p[0][0], p[1][0]) <= 1e-5 or math.hypot(p[0][0], p[1][0]) >= 4:
                    raise ValueError('二维向量公式须保持单圈、正向极角和有限半径。')
        if depth >= 8:
            raise ValueError('二维向量公式无法证明单圈、正向极角或有限半径。')
        middle = (low+high)/2
        self._certify_interval(low, middle, depth+1)
        self._certify_interval(middle, high, depth+1)

    def point(self, radius, phi):
        result = []
        for function in self._functions:
            value = function(phi, phi)[0][0]
            result.append(_finite(radius*value))
        return result

    def first_ray_exit(self, radius, point, direction):
        try:
            return super().first_ray_exit(radius, point, direction)
        except ValueError as error:
            raise ValueError(str(error).replace('二维傅里叶曲线', '二维向量公式')) from error


def ring_log_numeric_domain(params):
    """Parsed intrinsic presence; explicit Log/log definitions retain priority.

    Parsed but unselected branches/uncalled bodies are included in presence;
    positive-domain statements refer only to actually evaluated subexpressions.
    """
    keys=('outerVectorTemplate','creaseVectorTemplate','outerVectorExpressions','creaseVectorExpressions','vectorFunctionDefinitions')
    registry=_function_registry(params.get('vectorFunctionDefinitions'));nodes=[tree for cases in registry.values() for _,_,tree in cases]
    for key in keys[:4]:
        value=params.get(key)
        if value is None:continue
        pairs=[value] if 'Template' in key else value
        nodes.extend(_parse_numeric_tree(part,functions=registry) for pair in pairs for part in pair)
    if not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='_ring_log' for tree in nodes for n in _numeric_walk(tree)):return None
    return dict(schema='origamica-ring-log-numeric-domain-v1',function='MakeRingTessellation',definitionCell='In[2680]',
        parsedIntrinsicCalls=True,argumentPolicy='strict-positive-interval-for-evaluated-log-arguments',
        roundingModel='binary64-outward-2ulp/libm-endpoints-2ulp-assumed',machineCheckedRealArithmetic=False,wolframExecuted=False,
        rawInputBinding={key:copy.deepcopy(params[key]) for key in keys if key in params})
