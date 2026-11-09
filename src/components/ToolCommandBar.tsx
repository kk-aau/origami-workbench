import {forwardRef,useEffect,useId,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ForwardedRef,type KeyboardEvent,type PointerEvent,type ReactElement,type ReactNode,type RefAttributes} from 'react';
import type {Tool} from '../app/tools';
import {TOOL_COMMANDS,normalizeToolCommand,resolveToolCommand,searchToolCommands,type ToolCommand} from '../app/toolCommands';
import {floatingCommandPosition,type CommandPosition} from '../app/floatingCommandPosition';
import './toolCommandBar.css';

export interface ToolCommandBarProps<T extends string=Tool> {
  tool:T;
  onTool:(tool:T)=>void;
  commands?:readonly ToolCommand<T>[];
  onFocusCanvas?:()=>void;
  placeholder?:string;
  ariaLabel?:string;
  disabled?:boolean;
  /** The floating variant is mounted within the editable canvas container. */
  floating?:boolean;
  help?:ReactNode;
}
export type ToolCommandBarHandle={begin:(text:string)=>void;cancel:()=>void};

function focusCanvas(){
  document.querySelector<SVGElement>('#workspace .crease-canvas')?.focus({preventScroll:true});
}

function useFloatingCommandBar(floating:boolean){
  const element=useRef<HTMLDivElement>(null),preferred=useRef<CommandPosition|null>(null);
  const drag=useRef<{id:number;offset:CommandPosition}|null>(null),refresh=useRef(()=>{});
  const [layout,setLayout]=useState({x:16,y:0,popupDown:false,popupHeight:206});
  useLayoutEffect(()=>{
    const node=element.current,parent=node?.parentElement;
    if(!floating||!node||!parent)return;
    const controls=[...parent.querySelectorAll<HTMLElement>('.zoom-controls,.canvas-tag')];
    const measure=()=>{
      if(!parent.clientWidth||!parent.clientHeight||!node.offsetWidth)return;
      const rect=parent.getBoundingClientRect(),sx=parent.clientWidth/(rect.width||1),sy=parent.clientHeight/(rect.height||1);
      const obstacles=controls.filter(control=>control.getClientRects().length).map(control=>{
        const r=control.getBoundingClientRect();
        return {x:(r.left-rect.left)*sx,y:(r.top-rect.top)*sy,width:r.width*sx,height:r.height*sy};
      });
      const position=floatingCommandPosition({width:parent.clientWidth,height:parent.clientHeight},{width:node.offsetWidth,height:node.offsetHeight},preferred.current,obstacles);
      const above=Math.max(0,position.y-8),below=Math.max(0,parent.clientHeight-position.y-node.offsetHeight-8);
      const popupDown=above<206&&below>above,popupHeight=Math.max(32,Math.min(260,popupDown?below:above));
      setLayout(old=>old.x===position.x&&old.y===position.y&&old.popupDown===popupDown&&old.popupHeight===popupHeight?old:{...position,popupDown,popupHeight});
    };
    refresh.current=measure;measure();
    const observer=new ResizeObserver(measure);observer.observe(parent);observer.observe(node);controls.forEach(control=>observer.observe(control));
    return()=>{observer.disconnect();refresh.current=()=>{};drag.current=null;};
  },[floating]);
  const pointerDown=(event:PointerEvent<HTMLButtonElement>)=>{
    if(event.button!==0||!floating)return;
    const node=element.current,parent=node?.parentElement;if(!node||!parent)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});
    const rect=parent.getBoundingClientRect(),sx=parent.clientWidth/(rect.width||1),sy=parent.clientHeight/(rect.height||1);
    drag.current={id:event.pointerId,offset:{x:(event.clientX-rect.left)*sx-node.offsetLeft,y:(event.clientY-rect.top)*sy-node.offsetTop}};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove=(event:PointerEvent<HTMLButtonElement>)=>{
    const moving=drag.current,parent=element.current?.parentElement;if(!moving||moving.id!==event.pointerId||!parent)return;
    event.preventDefault();event.stopPropagation();
    const rect=parent.getBoundingClientRect();
    preferred.current={x:(event.clientX-rect.left)*parent.clientWidth/(rect.width||1)-moving.offset.x,y:(event.clientY-rect.top)*parent.clientHeight/(rect.height||1)-moving.offset.y};refresh.current();
  };
  const stopDrag=(event:PointerEvent<HTMLButtonElement>)=>{
    if(drag.current?.id!==event.pointerId)return;
    event.stopPropagation();drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const reset=()=>{preferred.current=null;refresh.current();};
  const keyDown=(event:KeyboardEvent<HTMLButtonElement>)=>{
    const direction:Record<string,CommandPosition>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};
    if(event.key==='Home'){event.preventDefault();event.stopPropagation();reset();return;}
    const delta=direction[event.key];if(!delta)return;
    event.preventDefault();event.stopPropagation();const step=event.shiftKey?24:8;
    preferred.current={x:layout.x+delta.x*step,y:layout.y+delta.y*step};refresh.current();
  };
  return {element,layout,pointerDown,pointerMove,stopDrag,reset,keyDown};
}

function ToolCommandBarInner<T extends string=Tool>(
  {tool,onTool,commands=TOOL_COMMANDS as readonly ToolCommand<T>[],onFocusCanvas=focusCanvas,
    placeholder='L 线段 · C 圆 · CO 复制',ariaLabel='工具命令',disabled=false,floating=false,help}:ToolCommandBarProps<T>,
  ref:ForwardedRef<ToolCommandBarHandle>,
){
  const input=useRef<HTMLInputElement>(null),composing=useRef(false),lastExecuted=useRef<ToolCommand<T>|null>(null);
  const [text,setText]=useState(''),[open,setOpen]=useState(false),[selected,setSelected]=useState<T|null>(null),[error,setError]=useState('');
  const [helpOpen,setHelpOpen]=useState(false);
  const placement=useFloatingCommandBar(floating);
  const id=useId(),listId=`tool-command-options-${id}`,errorId=`tool-command-error-${id}`,helpId=`tool-command-help-${id}`;
  const current=commands.find(command=>command.tool===tool);
  const candidates=useMemo(()=>searchToolCommands(text,6,commands),[text,commands]);
  const active=selected===null?-1:candidates.findIndex(command=>command.tool===selected);
  const showList=open&&!disabled&&!error&&candidates.length>0;

  const clear=()=>{setText('');setOpen(false);setSelected(null);setError('');setHelpOpen(false);};
  const cancel=()=>{clear();onFocusCanvas();};
  const execute=(command:ToolCommand<T>)=>{
    if(disabled)return;
    lastExecuted.current=command;clear();onTool(command.tool);onFocusCanvas();
  };
  useImperativeHandle(ref,()=>({
    begin(value){
      if(disabled)return;
      setText(value);setError('');setSelected(null);setOpen(true);setHelpOpen(false);
      // Focus synchronously: the next canvas keystroke must reach the input.
      input.current?.focus({preventScroll:true});
    },cancel,
  }));
  useEffect(()=>{if(disabled){setOpen(false);setSelected(null);setHelpOpen(false);}},[disabled]);
  useEffect(()=>{setHelpOpen(false);},[tool]);

  const keyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(composing.current||event.nativeEvent.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();cancel();return;
    }
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();event.stopPropagation();setOpen(true);setError('');
      if(candidates.length){
        const next=event.key==='ArrowDown'?(active+1)%candidates.length:(active<0?candidates.length-1:(active+candidates.length-1)%candidates.length);
        setSelected(candidates[next].tool);
      }
      return;
    }
    if(event.key==='Tab'&&!event.shiftKey&&candidates.length){
      event.preventDefault();event.stopPropagation();
      const command=candidates[active<0?0:active];
      setText(command.primary||command.aliases[0]||command.name);setSelected(command.tool);setError('');setOpen(true);return;
    }
    if(event.key!=='Enter')return;
    event.preventDefault();event.stopPropagation();
    const chosen=active>=0?candidates[active]:resolveToolCommand(text,commands);
    if(chosen){execute(chosen);return;}
    if(!normalizeToolCommand(text)){
      const previous=commands.find(command=>command.tool===lastExecuted.current?.tool);
      if(previous)execute(previous);else cancel();
      return;
    }
    setSelected(null);setError(`未找到命令“${text.trim()}”`);setOpen(true);
  };

  return <div ref={placement.element} className={`tool-command-bar${floating?' tool-command-floating':''}${help?' tool-command-with-help':''}`} aria-label={`${ariaLabel}栏`}
    data-popup-direction={floating&&placement.layout.popupDown?'down':'up'}
    style={floating?{left:placement.layout.x,top:placement.layout.y,'--tool-command-popup-height':`${placement.layout.popupHeight}px`} as CSSProperties:undefined}
    onPointerDown={floating?event=>event.stopPropagation():undefined} onPointerMove={floating?event=>event.stopPropagation():undefined}
    onPointerUp={floating?event=>event.stopPropagation():undefined} onClick={floating?event=>event.stopPropagation():undefined}
    onDoubleClick={floating?event=>event.stopPropagation():undefined} onWheel={floating?event=>event.stopPropagation():undefined}
    onKeyDown={event=>{if(helpOpen&&event.key==='Escape'){event.preventDefault();event.stopPropagation();setHelpOpen(false);}}}>
    {floating&&<button type="button" className="tool-command-grip" aria-label="移动命令框" title="拖动命令框；方向键微调，Home 或双击复位" disabled={disabled}
      onPointerDown={placement.pointerDown} onPointerMove={placement.pointerMove} onPointerUp={placement.stopDrag} onPointerCancel={placement.stopDrag}
      onLostPointerCapture={placement.stopDrag} onDoubleClick={placement.reset} onKeyDown={placement.keyDown}>
      <svg viewBox="0 0 12 20" aria-hidden="true"><path d="M3 4h.1M8 4h.1M3 10h.1M8 10h.1M3 16h.1M8 16h.1"/></svg>
    </button>}
    <span className="tool-command-current" title={current?`${current.name} · ${current.aliases.join(' / ')}`:tool}>
      <code>{current?.primary===null?'—':current?.primary??current?.aliases[0]??tool}</code><span>{current?.name??tool}</span>
    </span>
    <div className="tool-command-input-wrap">
      <span className="tool-command-prompt" aria-hidden="true">›</span>
      <input ref={input} type="text" role="combobox" aria-label={ariaLabel} aria-autocomplete="list"
        aria-expanded={showList} aria-controls={showList?listId:undefined}
        aria-activedescendant={showList&&active>=0?`${listId}-${active}`:undefined}
        aria-invalid={!!error} aria-describedby={open&&error?errorId:undefined}
        placeholder={placeholder} value={text} maxLength={64} disabled={disabled}
        autoComplete="off" autoCapitalize="off" spellCheck={false}
        onChange={event=>{setText(event.target.value);setSelected(null);setError('');setOpen(true);}}
        onFocus={()=>{setOpen(true);setHelpOpen(false);}} onBlur={()=>{setOpen(false);setSelected(null);}}
        onCompositionStart={()=>{composing.current=true;}}
        onCompositionEnd={()=>{composing.current=false;}} onKeyDown={keyDown}/>
    </div>
    {help&&<button type="button" className="tool-command-help-button" aria-label="当前工具说明" aria-expanded={helpOpen} aria-controls={helpOpen?helpId:undefined} disabled={disabled}
      onClick={()=>{setOpen(false);setHelpOpen(value=>!value);}}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1"/></svg>
    </button>}
    {helpOpen&&<div className="tool-command-help" id={helpId} role="region" aria-label="当前工具操作说明"><strong>{current?.name??tool}</strong><div>{help}</div><small>命令输入支持方向键选择、Tab 补全、Enter 执行、Esc 返回画布。</small></div>}
    {open&&!disabled&&error&&<div className="tool-command-error" id={errorId} role="alert" title={error}>{error}</div>}
    {showList&&<ul className="tool-command-options" id={listId} role="listbox" aria-label={`${ariaLabel}候选`}>
      {candidates.map((command,index)=><li key={command.tool} id={`${listId}-${index}`} role="option"
        aria-selected={index===active} aria-label={`${command.name} ${command.aliases.join(' ')}`}>
        <button type="button" tabIndex={-1} title={`${command.name} · ${command.aliases.join(' / ')}`}
          onMouseDown={event=>event.preventDefault()} onClick={()=>execute(command)}>
          <span>{command.name}</span><code>{command.aliases.join(' · ')}</code>
        </button>
      </li>)}
    </ul>}
  </div>;
}

const ToolCommandBar=forwardRef(ToolCommandBarInner) as <T extends string=Tool>(
  props:ToolCommandBarProps<T>&RefAttributes<ToolCommandBarHandle>,
)=>ReactElement;

export default ToolCommandBar;
