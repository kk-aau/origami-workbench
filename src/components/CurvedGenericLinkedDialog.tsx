import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {fetchCurve2DSystems,parseCurve2DSystemsFile,independentConstantSystems,type Curve2DSystemsMode} from '../app/curvedCurve2DSystems';
import {fetchGenericLinked,GENERIC_LINKED_PRESET,validateGenericLinkedQuery,type GenericLinkedQuery,type GenericLinkedResult} from '../app/curvedGenericLinked';
import {TessDialog} from './TessellationEditor';
import CurvedLinkedNDSolveControls from './CurvedLinkedNDSolveControls';
import {linkedStepOptionsFromFields} from '../app/curvedLinkedNDSolveOptions';

import {LinkedCommonDrawing} from './CurvedLinkedCommonParameterDialog';
import './CurvedGenericLinkedDialog.css';

const fieldsFor=(q:GenericLinkedQuery)=>({curves:q.curves.map(c=>[c.x,c.y,c.parameterMin,c.parameterMax].join(' ; ')).join('\n'),
  systemsMode:q.curve2DSystemsMode??'verified-same-source',
  q0:q.q0Expression,q1:q.q1Expression,gamma:q.gamma0Expression,seeds:q.rootSeeds.join(', '),
  start:String(q.parameterStart),end:String(q.parameterEnd),segments:String(q.segments),
  stepMaxSteps:q.ndsolveOptions?.MaxSteps===undefined?'':String(q.ndsolveOptions.MaxSteps),stepMaxSize:q.ndsolveOptions?.MaxStepSize===undefined?'':String(q.ndsolveOptions.MaxStepSize),
  systems:q.curve2DSystems===undefined?'':JSON.stringify(q.curve2DSystems,null,2),
  cachePrefix:q.curve2DSystems===undefined?'none':q.curve2DSystems==='Automatic'?'Automatic':String(q.curve2DSystems.length)});

export default function CurvedGenericLinkedDialog({onClose,onReference,onCommon}:{onClose:()=>void;onReference:()=>void;onCommon:()=>void}){
  const [fields,setFields]=useState(()=>fieldsFor(GENERIC_LINKED_PRESET)),[result,setResult]=useState<GenericLinkedResult|null>(null),
    [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),
    [azimuth,setAzimuth]=useState(-35),[active,setActive]=useState(0),[importError,setImportError]=useState('');
  const generation=useRef(0),file=useRef<HTMLInputElement>(null),systemsFile=useRef<HTMLInputElement>(null);
  const [cacheBusy,setCacheBusy]=useState(false);
  const input=useMemo(()=>{try{
    const curves=fields.curves.split('\n').filter(x=>x.trim()).map(row=>{
      const parts=row.split(/[;；]/).map(x=>x.trim());if(parts.length!==4||parts.some(x=>!x))throw Error('每行曲线填写 x ; y ; 原生起点 ; 原生终点。');
      return {x:parts[0],y:parts[1],parameterMin:Number(parts[2]),parameterMax:Number(parts[3])};});
    if(Object.entries(fields).some(([key,x])=>!['systems','stepMaxSteps','stepMaxSize'].includes(key)&&!x.trim()))throw Error('请填写全部原生函数与根种子。');
    const seeds=fields.seeds.split(/[,，]/).map(x=>{if(!x.trim())throw Error('根种子不能有空项。');return Number(x);});
    const options=linkedStepOptionsFromFields(fields.stepMaxSteps,fields.stepMaxSize,Number(fields.end)-Number(fields.start));
    const baseQuery=validateGenericLinkedQuery({...GENERIC_LINKED_PRESET,curves,q0Expression:fields.q0,q1Expression:fields.q1,
      gamma0Expression:fields.gamma,rootSeeds:seeds,parameterStart:Number(fields.start),parameterEnd:Number(fields.end),segments:Number(fields.segments),...(options?{ndsolveOptions:options}:{})});
    try{return {baseQuery,query:validateGenericLinkedQuery({...baseQuery,
      gamma0Expression:fields.gamma,rootSeeds:seeds,parameterStart:Number(fields.start),parameterEnd:Number(fields.end),segments:Number(fields.segments),
      ...(fields.systemsMode==='independent-external'?{curve2DSystemsMode:fields.systemsMode}:{}),
      ...(fields.cachePrefix==='none'?{}:fields.cachePrefix==='Automatic'?{curve2DSystems:'Automatic'}:
       {curve2DSystems:JSON.parse(fields.systems).slice(0,Number(fields.cachePrefix))})}),error:''};}
    catch(cause){return {baseQuery,query:null,error:(cause as Error).message};}
  }catch(cause){return {baseQuery:null,query:null,error:(cause as Error).message};}},[fields]);
  useEffect(()=>{const id=++generation.current,controller=new AbortController();setResult(null);setActive(0);setError('');
    if(!input.query){setStatus('error');setError(input.error);return;}setStatus('checking');const query=input.query;
    const timer=setTimeout(async()=>{try{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]);let next:GenericLinkedResult;
      for(;;){try{next=await fetchGenericLinked(query,signal);break;}
        catch(cause){if(signal.aborted||!(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;await new Promise(r=>setTimeout(r,200));}}
      if(id!==generation.current||controller.signal.aborted)return;setResult(next!);setStatus('ready');
    }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
    return ()=>{clearTimeout(timer);controller.abort();};},[input]);
  const edit=(key:keyof typeof fields,value:string)=>{++generation.current;setResult(null);setStatus('checking');setImportError('');setFields(x=>({...x,[key]:value}));};
  const restore=()=>{++generation.current;setResult(null);setStatus('checking');setFields(fieldsFor(GENERIC_LINKED_PRESET));setActive(0);setAzimuth(-35);setImportError('');};
  const precompute=async()=>{if(!input.baseQuery||fields.systemsMode!=='verified-same-source')return;const id=generation.current,q=input.baseQuery;setCacheBusy(true);setImportError('');
    try{const prepared=await fetchCurve2DSystems(q.curves,AbortSignal.timeout(45000));if(id!==generation.current)return;
      ++generation.current;setResult(null);setStatus('checking');setFields(x=>({...x,systems:JSON.stringify(prepared.systems,null,2),
        cachePrefix:['1','2','3'].includes(x.cachePrefix)?x.cachePrefix:String(prepared.systems.length)}));
    }catch(cause){if(id===generation.current)setImportError((cause as Error).message);}finally{setCacheBusy(false);}};
  const availableSystems=(()=>{try{const parsed=JSON.parse(fields.systems);return Array.isArray(parsed)?parsed.length:0;}catch{return 0;}})();
  const independent=fields.systemsMode==='independent-external';
  const rawExample=()=>{const q={...GENERIC_LINKED_PRESET,q0Expression:'s',q1Expression:'s',gamma0Expression:'1.8',segments:8,
    curve2DSystemsMode:'independent-external' as const,curve2DSystems:independentConstantSystems([[-2,3],[-2,3],[-2,3]])};
    ++generation.current;setResult(null);setStatus('checking');setImportError('');setFields(fieldsFor(q));};
  const copyIndependent=()=>{try{if(!input.baseQuery)throw Error(input.error);const parsed=JSON.parse(fields.systems);
    if(!Array.isArray(parsed)||!parsed.length)throw Error('请先提供可复制的显式规则列表。');
    const systems=parsed.map(x=>({family:'origamica-independent-curve2d-system',
      source:{function:'Curve2DSystems',definitionCell:'In[4076]',kind:'caller-supplied-safe-rules/no-source-identity'},
      parameterDomain:x.parameterDomain,rules:x.rules}));
    parseCurve2DSystemsFile({family:'origamica-independent-curve2d-systems-file',systems},input.baseQuery.curves,'independent-external');
    ++generation.current;setResult(null);setStatus('checking');setFields(x=>({...x,systemsMode:'independent-external',systems:JSON.stringify(systems,null,2),cachePrefix:String(systems.length)}));setImportError('');
  }catch(cause){setImportError((cause as Error).message);}};
  const row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)],proof=result?.diagnostics.parameterDomain;
  const drawingRows=useMemo(()=>result?.sample.rows.map(r=>({...r,flatCurves:r.normalizedFlatCurves,flatDerivatives:r.normalizedFlatDerivatives,
    foldedCurves:r.normalizedFoldedCurves,foldedDerivatives:r.normalizedFoldedDerivatives})),[result]);
  return <TessDialog title="第 45 节 · 通用原生曲线关联多带" onClose={onClose}>
    <div className="huffman-circle4-dialog linked-common-dialog generic-linked-dialog">
      <aside className="huffman-controls">
        <div className="huffman-overline"><span>NATIVE CURVES</span><button onClick={restore}>恢复起始函数</button></div>
        <label className="huffman-field generic-wide generic-mode">构造范围<select aria-label="关联同心圆构造范围" value="generic-common-parameter"
          onChange={e=>{if(e.target.value==='common-parameter')onCommon();if(e.target.value==='saved-chain')onReference();}}>
          <option value="generic-common-parameter">通用原生曲线 · 关联多带</option><option value="common-parameter">同心曲线族 · 等距多带</option>
          <option value="saved-chain">原调用复放 · 五曲线参考</option></select></label>
        <label className="huffman-field generic-wide">每行原生曲线：x ; y ; u 起点 ; u 终点
          <textarea aria-label="通用原生曲线函数" value={fields.curves} spellCheck={false} onChange={e=>edit('curves',e.target.value)}/></label>
        <p className="generic-expression-guide">3–6 曲线；支持 Sin[u]、Pi、^ 与相邻乘法；γ 用弧度。</p>
        <div className="generic-function-fields generic-wide">
          <label className="huffman-field">q₀(s)<input aria-label="通用q0表达式" value={fields.q0} spellCheck={false} onChange={e=>edit('q0',e.target.value)}/></label>
          <label className="huffman-field">q₁(s)<input aria-label="通用q1表达式" value={fields.q1} spellCheck={false} onChange={e=>edit('q1',e.target.value)}/></label>
          <label className="huffman-field">γ₀(s) · 弧度<input aria-label="通用gamma0表达式" value={fields.gamma} spellCheck={false} onChange={e=>edit('gamma',e.target.value)}/></label>
          <label className="huffman-field">q₂… 根种子<input aria-label="通用原生根种子" value={fields.seeds} onChange={e=>edit('seeds',e.target.value)}/></label>
        </div>
        <div className="generic-range-fields generic-wide">
          <label className="huffman-field">s 起点<input aria-label="通用共同参数起点" type="number" step=".01" value={fields.start} onChange={e=>edit('start',e.target.value)}/></label>
          <label className="huffman-field">s 终点<input aria-label="通用共同参数终点" type="number" step=".01" value={fields.end} onChange={e=>edit('end',e.target.value)}/></label>
          <label className="huffman-field">显示段数<input aria-label="通用显示段数" type="number" min="8" max="128" value={fields.segments} onChange={e=>edit('segments',e.target.value)}/></label>
        </div>
        <details className="generic-cache generic-wide"><summary>Curve2DSystems · 外部预计算系统</summary>
          <label className="huffman-field">规则合同<select aria-label="通用外部系统规则模式" value={fields.systemsMode}
            onChange={e=>edit('systemsMode',e.target.value)}><option value="verified-same-source">已验证同源系统 · 默认</option>
            <option value="independent-external">独立原规则 · 等距未证</option></select></label>
          <label className="huffman-field">按原曲线顺序替换<select aria-label="通用外部系统前缀" value={fields.cachePrefix}
            onChange={e=>edit('cachePrefix',e.target.value)}><option value="none">原入口 · 未提供选项</option><option value="Automatic">原 Automatic</option><option value="0" disabled={!fields.systems.trim()||fields.systems==='"Automatic"'}>原空系统列表</option>
            {[1,2,3].map(n=><option key={n} value={String(n)} disabled={availableSystems<n}>前 {n} 项系统</option>)}</select></label>
          <div className="linked-common-storage"><button disabled={!input.baseQuery||independent||cacheBusy} onClick={precompute}>{cacheBusy?'预计算中…':'预计算原曲线系统'}</button>
            <button onClick={()=>systemsFile.current?.click()}>导入系统</button>
            <button disabled={!input.query?.curve2DSystems} onClick={()=>download(JSON.stringify({family:independent?'origamica-independent-curve2d-systems-file':'origamica-curve2d-systems-file',systems:input.query!.curve2DSystems},null,2),'原Curve2DSystems描述.json')}>导出系统</button></div>
          <div className="linked-common-storage generic-independent-actions"><button onClick={rawExample}>载入独立未归一化规则示例</button>
            <button disabled={!fields.systems.trim()} onClick={copyIndependent}>复制当前规则为独立输入</button></div>
          <label className="huffman-field">显式规则 JSON<textarea aria-label="通用外部系统规则JSON" spellCheck={false} value={fields.systems}
            onChange={e=>edit('systems',e.target.value)}/></label>
          <input ref={systemsFile} hidden type="file" accept=".json,application/json" aria-label="载入通用外部曲线系统文件"
            onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected||!input.baseQuery)return;
              const id=generation.current;try{if(selected.size>16384)throw Error('系统文件过大。');
                const systems=parseCurve2DSystemsFile(JSON.parse(await selected.text()),input.baseQuery.curves,fields.systemsMode as Curve2DSystemsMode);if(id!==generation.current)return;
                ++generation.current;setResult(null);setStatus('checking');setFields(x=>({...x,systems:JSON.stringify(systems,null,2),cachePrefix:systems==='Automatic'?'Automatic':String(systems.length)}));setImportError('');
              }catch(cause){if(id===generation.current)setImportError((cause as Error).message);}}}/>
          <p>{independent?'独立规则不要求来自输入曲线；原值、规则序及声明域均保留。有限表达式求值会报告实际度量误差，不能作为 CP 采用。':'同源白名单规则须通过全域核验。'}第三项在原 Next2D 求角／根阶段未使用；导入标架不归一化。</p>
          {result?.curve2DSystems&&<code data-testid="generic-cache-usage">实际替换 {result.curve2DSystems.replacementIndices.length} 项 · 外部规则调用 {result.curve2DSystems.evaluations.join(' / ')||'0'}</code>}
        </details>
        <CurvedLinkedNDSolveControls maxSteps={fields.stepMaxSteps} maxStepSize={fields.stepMaxSize} onChange={edit} integration={result?.first3DIntegration}/>
        <div className={`huffman-status ${status} generic-wide`} role="status" data-testid="linked-common-status">
          {status==='error'?error:status==='ready'&&result?independent?`${result.certification.bandCount} 带实际数值构形；独立规则等距未证。`:`${result.certification.bandCount} 带局部等距；${proof?.planarPaperInjective?'完整二维纸域已验证':'二维纸域整体单射尚未证明'}。`:'正在追踪连续原生根并计算全部关联带…'}</div>
        <div className="huffman-root generic-wide" data-testid="linked-common-diagnostics">
          <span>自定义原生函数 · 共同参数续接</span>
          <code>度量误差 {result?result.diagnostics.maxMetricError.toExponential(2):'—'}</code>
          {independent&&<code>原值标架误差 {result?result.diagnostics.maxFrameGramError.toExponential(2):'—'}</code>}
          <span>全区间 q′ ≥ {proof?proof.minimumSpeedLowerBound.toFixed(4):'—'}；根图 {proof?proof.verifiedCells:'—'} 段</span>
          <span>γ₁(起点) = {result?result.sample.rows[0].foldAnglesDeg[1].toFixed(6):'—'}°</span>
        </div>
        <label className="huffman-position">当前母线 <strong>{row?row.s.toFixed(4):'—'}</strong></label>
        <input aria-label="共同参数当前母线" className="huffman-range" type="range" min="0" max={result?.query.segments??32}
          disabled={!result} value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/>
        <div className="linked-common-storage generic-wide"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'通用关联曲线参数.json')}>保存参数</button>
          <button onClick={()=>file.current?.click()}>载入参数</button><input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入通用关联曲线参数文件"
            onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;
              try{if(selected.size>16384)throw Error('参数文件过大。');const query=validateGenericLinkedQuery(JSON.parse(await selected.text()));
                ++generation.current;setResult(null);setStatus('checking');setFields(fieldsFor(query));setImportError('');}
              catch(cause){setImportError((cause as Error).message);}}}/></div>
        {importError&&<span className="linked-common-import-error generic-wide" role="alert">{importError}</span>}
      </aside>
      <section className="huffman-results">
        <div className="huffman-head"><div><span>GENERIC LINKED STRIPS</span><strong>自定义原生曲线 · 全部真实关联带</strong></div><code>{result?`${result.query.curves.length} 曲线 / ${result.certification.bandCount} 带`:'等待验证'}</code></div>
        <div className="huffman-panels">
          <section className="huffman-panel"><header><span>01 / UNFOLDED</span><strong>二维共同纸域</strong></header>
            {drawingRows?<LinkedCommonDrawing rows={drawingRows} space={false} azimuth={azimuth} active={active}/>:<div className="huffman-empty">{status==='checking'?'验证中':'无有效图像'}</div>}
            <p>相邻带共享同索引曲线及同一个 s；按输入保留全部带。</p></section>
          <section className="huffman-panel"><header><span>02 / FOLDED</span><strong>{independent?'三维实际构形 · 等距未证':'三维等距构形'}</strong></header>
            {drawingRows?<LinkedCommonDrawing rows={drawingRows} space azimuth={azimuth} active={active}/>:<div className="huffman-empty">{status==='checking'?'验证中':'无有效图像'}</div>}
            <div className="huffman-azimuth">视角<input aria-label="共同参数三维视角" type="range" min="-180" max="180" value={azimuth} onChange={e=>setAzimuth(Number(e.target.value))}/><b>{azimuth}°</b></div></section>
        </div>
        <div className="huffman-cert"><strong>验证边界</strong><span>{independent?'独立原规则实际驱动连续根与三维恢复；未证明来源恒等、单位标架或等距材料。':'连续曲折数值构形。简单根与局部正则覆盖全部 s；纸域整体状态单独报告。'}三维碰撞、运动路径、积分全区间误差及精确直线 FOLD 未认证。</span></div>
        <div className="huffman-footer"><span>{independent?'独立四规则 · 原值标架 · 等距未证':'白名单函数 · 连续根支 · 同一纸域'}</span><button disabled={!result} onClick={()=>download(JSON.stringify(result,null,2),'关联首First3D完整结果.json')}>导出完整结果</button><button onClick={onReference}>查看原式参考</button><button onClick={onClose}>关闭</button></div>
      </section>
    </div>
  </TessDialog>;
}
