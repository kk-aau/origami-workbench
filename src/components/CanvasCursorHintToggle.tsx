import './CanvasCursorHintToggle.css';

/** The parent owns the existing shared display preference and its persistence. */
export default function CanvasCursorHintToggle({checked,onChange,disabled=false}:{checked:boolean;onChange:(enabled:boolean)=>void;disabled?:boolean}){
 return <label className="canvas-cursor-hint-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.currentTarget.checked)}/><span>悬浮提示</span></label>;
}
