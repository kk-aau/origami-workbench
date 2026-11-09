import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './ColorPicker.css';

const COMMON_COLORS=[
  ['白色','#FFFFFF'],['纸背米色','#F3E6CE'],['奶油色','#FFF4D9'],['浅灰','#E6E8E6'],
  ['纸面浅绿','#C5DAC2'],['鼠尾草绿','#8FAE9A'],['深绿','#41634E'],['墨绿','#293D35'],
  ['黑色','#000000'],['灰色','#666666'],['银灰','#A7ADB0'],['棕色','#6F5D50'],
  ['红色','#C43C3C'],['珊瑚色','#E78866'],['金黄','#E6AD32'],['浅黄','#F2D973'],
  ['蓝色','#2F68C9'],['浅蓝','#8CB8DD'],['青色','#3A9BA5'],['薄荷绿','#97C9BC'],
  ['紫色','#7858A6'],['淡紫','#B6A1CC'],['粉色','#DB7A9B'],['浅粉','#F2C7D6'],
] as const;

interface Props {
  value:string;
  onChange:(color:string)=>void;
  'aria-label':string;
  disabled?:boolean;
  title?:string;
}

/** Keep native custom selection alongside a shared, one-click preset palette.
 * A top-layer popover escapes scrolling toolbars, sidebars and dialog edges. */
export default function ColorPicker({value,onChange,'aria-label':label,disabled=false,title}:Props){
  const id=useId(),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
  const [host,setHost]=useState<HTMLElement|null>(null);
  const color=value.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i,'#$1$1$2$2$3$3').toUpperCase();
  const selected=COMMON_COLORS.findIndex(([,hex])=>hex===color);
  useLayoutEffect(()=>{setHost(trigger.current?.closest('dialog')??document.body);},[]);
  const position=()=>{
    const popup=panel.current,button=trigger.current;if(!popup||!button)return;
    const anchor=button.getBoundingClientRect(),width=popup.offsetWidth,height=popup.offsetHeight;
    popup.style.left=`${Math.max(8,Math.min(anchor.right-width,window.innerWidth-width-8))}px`;
    popup.style.top=`${anchor.bottom+height+6<=window.innerHeight-8?anchor.bottom+6:Math.max(8,anchor.top-height-6)}px`;
  };
  useLayoutEffect(()=>{
    if(!open)return;
    position();
    panel.current?.querySelector<HTMLButtonElement>('[data-color-swatch][tabindex="0"]')?.focus();
    window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
    return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
  },[open]);
  useEffect(()=>{if(disabled)panel.current?.hidePopover();},[disabled]);
  const choose=(hex:string)=>{if(disabled)return;onChange(hex);panel.current?.hidePopover();trigger.current?.focus();};
  return <span className="color-picker">
    <input type="color" aria-label={label} title={title??color} value={color} disabled={disabled} onChange={event=>onChange(event.currentTarget.value)}/>
    <button ref={trigger} type="button" className="color-picker-trigger" aria-label={`${label}常用色`} title="常用色 · 点击色块即用" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={event=>{event.preventDefault();const popup=panel.current;if(popup){popup.togglePopover();setOpen(popup.matches(':popover-open'));}}}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="4" height="4" rx=".6"/><rect x="10" y="2" width="4" height="4" rx=".6"/><rect x="2" y="10" width="4" height="4" rx=".6"/><rect x="10" y="10" width="4" height="4" rx=".6"/></svg>
    </button>
    {host&&createPortal(<div ref={panel} id={id} popover="auto" className="color-picker-panel" role="dialog" aria-label={`${label}常用色面板`} onToggle={event=>setOpen(event.currentTarget.matches(':popover-open'))} onKeyDown={event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();panel.current?.hidePopover();trigger.current?.focus();return;}
      const move={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8}[event.key];
      const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[data-color-swatch]')??[]),index=buttons.indexOf(event.target as HTMLButtonElement);
      if(move!==undefined&&index>=0){event.preventDefault();buttons[(index+move+buttons.length)%buttons.length]?.focus();}
      if(event.key==='Tab'&&(event.shiftKey&&index>=0||!event.shiftKey&&(event.target as HTMLElement).tagName==='INPUT')){panel.current?.hidePopover();trigger.current?.focus();}
    }}>
      <div className="color-picker-caption"><strong>常用色</strong><code>{color}</code></div>
      <div className="color-picker-swatches" role="group" aria-label={`${label}常用颜色`}>
        {COMMON_COLORS.map(([name,hex],index)=><button key={hex} type="button" data-color-swatch={hex} className="color-picker-swatch" style={{backgroundColor:hex}} aria-label={`${name} ${hex}`} title={`${name} · ${hex}`} aria-pressed={color===hex} tabIndex={index===(selected<0?0:selected)?0:-1} onClick={()=>choose(hex)}>
          {color===hex&&<svg viewBox="0 0 16 16" aria-hidden="true" style={{color:['#000000','#293D35','#41634E','#666666','#6F5D50','#C43C3C','#2F68C9','#7858A6'].includes(hex)?'#FFFFFF':'#293D35'}}><path d="m3.5 8 3 3 6-6"/></svg>}
        </button>)}
      </div>
      <label className="color-picker-custom"><span>自定义颜色</span><input type="color" aria-label={`${label}自定义颜色`} value={color} disabled={disabled} onChange={event=>onChange(event.currentTarget.value)}/></label>
    </div>,host)}
  </span>;
}

export {ColorPicker};
