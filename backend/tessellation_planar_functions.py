"""In[3844]/In[3849]: transform a vector-valued safe function body.

The discarded Planarize component is parsed for safety but never evaluated.
This endpoint returns the transformed function, preserving slot/parameter form;
it does not add a vector overload or return a crease pattern.
"""
import ast,math,re
from tessellation_curved_generic_linked_expression import Expression,GenericLinkedError,normalize_expression

FAMILY='planar-functions-native'
RESULT_FAMILY='origamica-planar-functions'
RESERVED=Expression.FUNCTIONS|{'pi','e','Sin','Cos','Tan','ArcTan','Sqrt','Exp','Log','Pi','E'}
PRESET={'family':FAMILY,'mode':'planarize','input':{'form':'slots','arity':1,'body':['Cos[#]','Sin[#]','Tan[#]']},'arguments':[[i/16] for i in range(17)]}

class PlanarFunctionError(GenericLinkedError):pass
def bad(message):raise PlanarFunctionError('planar-function-contract',message)
def finite(value):return type(value) in (int,float) and math.isfinite(value) and abs(value)<=1e12

def function_parameters(fn):
 if fn['form']=='slots':return [f'zzslot{i+1}' for i in range(fn['arity'])]
 return fn['parameters']

def scalar_source(source,fn):
 if fn['form']=='parameters':return source
 if re.search(r'\bzzslot\d+\b',source):bad('Slot 函数请使用 # 或 #n，不能写入内部参数名称。')
 def slot(match):
  index=int(match.group(1) or '1')
  if not 1<=index<=fn['arity']:bad('Slot 编号必须在声明的参数个数内。')
  return f'zzslot{index}'
 if '##' in source:bad('此数值入口不接受 SlotSequence。')
 return re.sub(r'#(\d*)',slot,source)

class ComponentExpression(Expression):
 def __init__(self,source,parameters):
  self.parameters=set(parameters)
  self.source=source;self.variable='__unused_parameter__'
  try:self.tree=ast.parse(normalize_expression(source),mode='eval').body
  except (SyntaxError,ValueError,RecursionError) as error:raise PlanarFunctionError('expression-contract','函数分量语法无效。') from error
  if len(list(ast.walk(self.tree)))>96:raise PlanarFunctionError('expression-budget','函数分量的AST节点超过96。')
  self._check(self.tree)
 def _check(self,node):
  if isinstance(node,ast.Name):
   if node.id in self.parameters or node.id in ('pi','e'):return
   bad('函数分量引用了未声明的参数。')
  return super()._check(node)
 def value(self,values):
  def visit(node):
   if isinstance(node,ast.Constant):return float(node.value)
   if isinstance(node,ast.Name):return values[node.id] if node.id in values else math.pi if node.id=='pi' else math.e
   if isinstance(node,ast.UnaryOp):
    value=visit(node.operand);return -value if isinstance(node.op,ast.USub) else value
   if isinstance(node,ast.BinOp):
    a=visit(node.left)
    if isinstance(node.op,ast.Pow):return a**self._integer(node.right)
    b=visit(node.right)
    if isinstance(node.op,ast.Add):return a+b
    if isinstance(node.op,ast.Sub):return a-b
    if isinstance(node.op,ast.Mult):return a*b
    return a/b
   value=visit(node.args[0]);name=node.func.id
   if name=='tan' and abs(math.cos(value))<=4*math.ulp(1.):raise ValueError('Tan 参数位于数值不可分辨的极点。')
   return getattr(math,name)(value)
  try:
   value=visit(self.tree)
   if not math.isfinite(value):raise ValueError('函数分量产生非有限数。')
   return value
  except (ValueError,OverflowError,ZeroDivisionError) as error:
   raise PlanarFunctionError('point-domain','当前参数点的保留分量不在有限实数域。') from error

def validate_planar_function_query(data):
 if not isinstance(data,dict) or set(data)!={'family','mode','input','arguments'} or data['family']!=FAMILY or data['mode'] not in ('planarize','unplanarize'):bad('需要完整的平面函数转换请求。')
 fn=data['input']
 if not isinstance(fn,dict) or fn.get('form') not in ('slots','parameters'):bad('只接受纯 Slot 函数或显式参数函数。')
 if set(fn)!=({'form','arity','body'} if fn['form']=='slots' else {'form','parameters','body'}):bad('函数描述字段不完整或含多余字段。')
 if fn['form']=='slots':
  if type(fn['arity']) is not int or not 1<=fn['arity']<=8:bad('Slot 参数个数须为1–8。')
 else:
  names=fn['parameters']
  if not isinstance(names,list) or len(names)>8 or any(not isinstance(name,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,15}',name) or name in RESERVED or name.startswith('zzslot') for name in names) or len(set(names))!=len(names):bad('显式参数须为0–8个独立名称，不能覆盖常数或标量函数。')
 dimension=3 if data['mode']=='planarize' else 2
 if not isinstance(fn['body'],list) or len(fn['body'])!=dimension:bad(f'函数返回列表必须恰好有{dimension}个分量。')
 parameters=function_parameters(fn)
 for source in fn['body']:
  if not isinstance(source,str) or not 1<=len(source)<=240:bad('函数分量须为1–240字符的安全标量表达式。')
  ComponentExpression(scalar_source(source,fn),parameters)
 arguments=data['arguments']
 if not isinstance(arguments,list) or not 1<=len(arguments)<=129 or any(not isinstance(row,list) or len(row)!=len(parameters) or any(not finite(value) for value in row) for row in arguments):bad('求值点须有1–129行，每行匹配原参数个数并使用±10¹²内有限数。')
 return {'family':FAMILY,'mode':data['mode'],'input':{**fn,'body':list(fn['body']),**({'parameters':list(parameters)} if fn['form']=='parameters' else {})},'arguments':[[float(value) for value in row] for row in arguments]}

def query_planar_functions(data):
 q=validate_planar_function_query(data);fn=q['input'];parameters=function_parameters(fn)
 body=fn['body'][:2] if q['mode']=='planarize' else fn['body']+['0']
 converted={**fn,'body':body};expressions=[ComponentExpression(scalar_source(source,converted),parameters) for source in body]
 rows=[]
 for arguments in q['arguments']:
  try:values=[expression.value(dict(zip(parameters,arguments))) for expression in expressions];error=None
  except PlanarFunctionError as failure:values=None;error=str(failure)
  rows.append({'arguments':arguments,'values':values,'error':error})
 planar=q['mode']=='planarize'
 return {'family':RESULT_FAMILY,'query':q,'source':{'function':'Planarize' if planar else 'Unplanarize','definitionCell':'In[3844]' if planar else 'In[3849]','definitionLines':[307285,307365] if planar else [307500,307578],'operation':'take-first-two-components' if planar else 'append-zero-component','inputKind':'safe-function-body','originalDirectVectorOverload':False},'convertedFunction':converted,'sample':{'rows':rows},'certification':{'functionBodyTransformedExactly':True,'retainedComponentsOnlyEvaluated':True,'pointwiseValuesVerified':True,'symbolicWolframFunctionObjectReproduced':False,'interpolationObjectReproduced':False,'continuousDomainCertified':False}}
