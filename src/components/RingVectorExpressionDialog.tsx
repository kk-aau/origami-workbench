import {useState} from 'react';
import {readTessParams,type TessParams} from '../app/tessellation';
import {ringIndexConditionalPreset} from '../app/ringIndexConditionalPreset';
import {ringAngularIfPreset} from '../app/ringAngularIfPreset';
import {TessDialog} from './TessellationEditor';
import './RingVectorExpressionDialog.css';

type RingParams=Extract<TessParams,{family:'ring'}>;
type Pair=[string,string];
type Mode='indexed'|'per-ring';
const example:Pair=['cos(phi)/(1+0.06*cos(3*phi))','sin(phi)/(1+0.06*cos(3*phi))'];
const indexedExample:Pair=['cos(phi)/(1+0.015*i*cos(3*phi))','sin(phi)/(1+0.015*i*cos(3*phi))'];
const smoothExample:Pair=[
  'sqrt(1+0.08*cos(2*phi))*exp(0.015*i*cos(3*phi))*cos(phi)',
  'sqrt(1+0.08*cos(2*phi))*exp(0.015*i*cos(3*phi))*sin(phi)',
];
const piecewiseExample:Pair=[
  'piecewise(cos(phi),1+(.04+.004*i)*cos(phi)**2,1+(.02+.002*i)*cos(phi)**2)*cos(phi)',
  'piecewise(cos(phi),1+(.04+.004*i)*cos(phi)**2,1+(.02+.002*i)*cos(phi)**2)*sin(phi)',
];
const squaringCircle:Pair=[
  'Sign[Cos[φ]] Abs[Cos[φ]]^(1/(i+1))',
  'Sign[Sin[φ]] Abs[Sin[φ]]^(1/(i+1))',
];
const originalFunctionDefinitions=['F[x_,i_]:=Sign[x] Abs[x]^(1/(1+i))','F[0,i_]:=0','F[x_,0]:=x'];
const originalFunctionCalls:Pair=['F[Cos[φ],i]','F[Sin[φ],i]'];
const moduleDefinitions=['Component[t_,c_,k_]:=Module[{r,g},r=1+.015 k Cos[3t];g[x_]:=r x;g[c]]','Component[t_,c_,0]:=c'];
const moduleCalls:Pair=['Component[φ,Cos[φ],i]','Component[φ,Sin[φ],i]'];
const wolframPiecewiseExample:Pair=[
  'Piecewise[{{1+.04 Cos[φ]^2,Cos[φ]>=0}},1+.02 Cos[φ]^2] Cos[φ]',
  'Piecewise[{{1+.04 Cos[φ]^2,Cos[φ]>=0}},1+.02 Cos[φ]^2] Sin[φ]',
];
const perRingExample=(rings:number)=>({
  outerVectorExpressions:Array.from({length:rings+1},()=>example),
  creaseVectorExpressions:Array.from({length:rings},()=>example),
});
const templateExample=()=>({outerVectorTemplate:indexedExample,creaseVectorTemplate:indexedExample});

/** A numeric pfn[i]/rfn[i] subset; the server certifies every ring and angle interval. */
export default function RingVectorExpressionDialog({params,onApply,onClose}:{params:RingParams;onApply:(next:RingParams)=>void;onClose:()=>void}){
  const [mode,setMode]=useState<Mode>(params.outerVectorTemplate?'indexed':'per-ring');
  const [listText,setListText]=useState(()=>JSON.stringify({
    outerVectorExpressions:params.outerVectorExpressions??perRingExample(params.rings).outerVectorExpressions,
    creaseVectorExpressions:params.creaseVectorExpressions??perRingExample(params.rings).creaseVectorExpressions,
    vectorFunctionDefinitions:params.vectorFunctionDefinitions,
  },null,2));
  const [templateText,setTemplateText]=useState(()=>JSON.stringify({
    outerVectorTemplate:params.outerVectorTemplate??templateExample().outerVectorTemplate,
    creaseVectorTemplate:params.creaseVectorTemplate??templateExample().creaseVectorTemplate,
    vectorFunctionDefinitions:params.vectorFunctionDefinitions,
  },null,2));
  const [error,setError]=useState('');
  function applySquaringCircle(withDefinitions=false){
    const next=readTessParams({...params,
      sides:20,rings:3,angle:45,offsetAngle:6,
      outerRadii:[.75,1.75,2.75,3.75],creaseRadii:[1,2,3],
      outerProfiles:undefined,creaseProfiles:undefined,
      outerExpressions:undefined,creaseExpressions:undefined,
      outerVectors:undefined,creaseVectors:undefined,
      outerLinearMaps:undefined,creaseLinearMaps:undefined,
      outerFourierCurves:undefined,creaseFourierCurves:undefined,
      outerSignedPowers:undefined,creaseSignedPowers:undefined,
      outerVectorExpressions:undefined,creaseVectorExpressions:undefined,
      outerVectorTemplate:withDefinitions?originalFunctionCalls:squaringCircle,
      creaseVectorTemplate:withDefinitions?originalFunctionCalls:squaringCircle,
      vectorFunctionDefinitions:withDefinitions?originalFunctionDefinitions:undefined});
    if(next?.family==='ring')onApply(next);
    else setError('原版圆到方形参数无效。');
  }
  function apply(){
    try{
      const keys=mode==='indexed'?['outerVectorTemplate','creaseVectorTemplate']:['outerVectorExpressions','creaseVectorExpressions'];
      const parsed:unknown=JSON.parse(mode==='indexed'?templateText:listText);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
        keys.some(key=>!Object.hasOwn(parsed,key))||Object.keys(parsed).some(key=>!keys.includes(key)&&key!=='vectorFunctionDefinitions'))
        throw Error('须提供两组二维公式；可附 vectorFunctionDefinitions 局部纯函数定义。');
      const curves=parsed as Record<string,unknown>;
      const next=readTessParams({...params,
        outerProfiles:undefined,creaseProfiles:undefined,
        outerExpressions:undefined,creaseExpressions:undefined,
        outerVectors:undefined,creaseVectors:undefined,
        outerLinearMaps:undefined,creaseLinearMaps:undefined,
        outerFourierCurves:undefined,creaseFourierCurves:undefined,
        outerSignedPowers:undefined,creaseSignedPowers:undefined,
        outerVectorExpressions:mode==='per-ring'?curves.outerVectorExpressions:undefined,
        creaseVectorExpressions:mode==='per-ring'?curves.creaseVectorExpressions:undefined,
        outerVectorTemplate:mode==='indexed'?curves.outerVectorTemplate:undefined,
        creaseVectorTemplate:mode==='indexed'?curves.creaseVectorTemplate:undefined,
        vectorFunctionDefinitions:curves.vectorFunctionDefinitions});
      if(!next||next.family!=='ring')throw Error('二维公式或局部纯函数定义无效。每个分量须有 1–120 字符，逐环组数须一致；有限模式不能重复，函数不能循环或引用自由变量。');
      onApply(next);
    }catch(cause){setError((cause as Error).message);}
  }
  return <TessDialog title="pfn/rfn 二维数值公式" onClose={onClose}>
    <div className="ring-vector-formula-dialog">
    <div className="tess-actions"><button aria-pressed={mode==='indexed'} onClick={()=>{setMode('indexed');setError('');}}>按环索引 i</button><button aria-pressed={mode==='per-ring'} onClick={()=>{setMode('per-ring');setError('');}}>逐环单独输入</button></div>
    <p className="note">{mode==='indexed'?'pfn[i] 和 rfn[i] 各输入一对 [x(i,phi), y(i,phi)]；i 从 0 起。':'pfn/rfn 的每一环分别输入一对 [x(phi), y(phi)]。'} 坐标乘各环半径；支持小写数值式与 Mathematica 写法。</p>
    <details className="ring-vector-formula-help"><summary>支持的语法与曲线条件</summary><p>可用 Cos[φ]、Sin[φ]、Exp、Sqrt、Log、Pi、E、Degree、^、2 Cos[φ] 和 1.5*^-2。光滑公式使用四则运算及 0–4 次整数幂；phi 的三角频率为 1–8 的整数，平方根在全角域须严格为正。常数运算须为有限实数。</p><p>vectorFunctionDefinitions 最多 8 条纯定义，每条 1–4 个 name_／有限数字参数。同名模式须同元数、有默认 name_ 定义且不重复。环索引按精确值匹配；角度相关字面量特例须能证明匹配处与默认同值。完整原 F 可含 F[0,i_]:=0 与 F[x_,0]:=x。定义可无环相互调用，不能引用自由变量或执行副作用。</p><p>数值 Module 可写 {"Module[{r,g},r=数值式;g[x_]:=r x;g[c]]"}：声明最多 32 个局部名，允许局部赋值、局部纯函数及有界嵌套。初始化读取外层；嵌套可改写外层 Module 局部。局部函数 = 在定义时取值，:= 在调用时读取捕获局部；函数的捕获状态只读。未初始化名须先赋值再读取，末项须为数值式。所有执行的赋值仍检查数值域，展开后须通过既有曲线证书。</p><p>If[k&lt;1,圆式,其它环式] 的条件须由环索引或常量确定，可用 &gt;、&gt;=、&lt;、&lt;=；只计算选中的分支。按环恒定的 Piecewise 保留首个成立分支。phi 相关的 If 复用 Piecewise 的全部接缝一阶连续证明，未能证明的分支拒绝。If 的分支 Module 仅可写分支内独立局部，不能改写外层状态。</p><p>支持 Piecewise[{'{{正支,g>=0}}'},负支] 和小写三／四参数 piecewise。列表最多 4 个按顺序判断的比较分支；所有分支在每个切换条件处的差异须含条件函数的平方因子，证明一阶连续。整对原版圆→方 Sign/Abs 使用解析超椭圆界。一般模式、条件定义和符号求值仍不支持；服务端验证单圈、方向、嵌套和首次交点。</p></details>
    <textarea className="tess-json" aria-label="pfn/rfn 二维数值公式 JSON" value={mode==='indexed'?templateText:listText} onChange={event=>{(mode==='indexed'?setTemplateText:setListText)(event.target.value);setError('');}}/>
    {error&&<p role="alert">{error}</p>}
    <p className="note">Log／log 是自然对数；参数须在整圈角度严格为正。零、负值或区间无法证明正域均拒绝。光滑参数式按 binary64／libm 端点误差≤2 ULP 的工程假设逐操作包围值与导数，不是 Wolfram 或实数机器证明；分支需置于 Log 外部。原表达式保留，采用仍需完整 CP 和层序检查。</p><footer><button onClick={()=>{(mode==='indexed'?setTemplateText:setListText)(JSON.stringify(mode==='indexed'?templateExample():perRingExample(params.rings),null,2));setError('');}}>填入有理曲线示例</button><button onClick={()=>{const pair=mode==='indexed'?smoothExample:smoothExample.map(item=>item.replace('0.015*i','0.03')) as Pair;(mode==='indexed'?setTemplateText:setListText)(JSON.stringify(mode==='indexed'?{outerVectorTemplate:pair,creaseVectorTemplate:pair}:{outerVectorExpressions:Array.from({length:params.rings+1},()=>pair),creaseVectorExpressions:Array.from({length:params.rings},()=>pair)},null,2));setError('');}}>填入指数/平方根示例</button><button onClick={()=>{const rows=(count:number)=>Array.from({length:count},(_,index)=>piecewiseExample.map(item=>item.replace(/\bi\b/g,String(index))) as Pair);(mode==='indexed'?setTemplateText:setListText)(JSON.stringify(mode==='indexed'?{outerVectorTemplate:piecewiseExample,creaseVectorTemplate:piecewiseExample}:{outerVectorExpressions:rows(params.rings+1),creaseVectorExpressions:rows(params.rings)},null,2));setError('');}}>填入三参数分段示例</button><button onClick={()=>{(mode==='indexed'?setTemplateText:setListText)(JSON.stringify(mode==='indexed'?{outerVectorTemplate:wolframPiecewiseExample,creaseVectorTemplate:wolframPiecewiseExample}:{outerVectorExpressions:Array.from({length:params.rings+1},()=>wolframPiecewiseExample),creaseVectorExpressions:Array.from({length:params.rings},()=>wolframPiecewiseExample)},null,2));setError('');}}>填入 Mathematica 分段</button><button onClick={()=>{const rows=(count:number)=>Array.from({length:count},(_,index)=>moduleCalls.map(item=>item.replace(/,i\]/g,`,${index}]`)) as Pair);(mode==='indexed'?setTemplateText:setListText)(JSON.stringify({...mode==='indexed'?{outerVectorTemplate:moduleCalls,creaseVectorTemplate:moduleCalls}:{outerVectorExpressions:rows(params.rings+1),creaseVectorExpressions:rows(params.rings)},vectorFunctionDefinitions:moduleDefinitions},null,2));setError('');}}>填入 Module／模式示例</button>{mode==='indexed'&&<><button onClick={()=>applySquaringCircle()}>采用原版圆→方函数</button><button onClick={()=>applySquaringCircle(true)}>采用原F圆→方</button></>}<button onClick={()=>onApply(ringIndexConditionalPreset())}>采用索引条件预设</button><button onClick={()=>onApply(ringAngularIfPreset())}>采用 C1 角度条件预设</button><button className="primary" onClick={apply}>采用二维公式</button></footer>
    </div>
  </TessDialog>;
}
