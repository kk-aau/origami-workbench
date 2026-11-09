import {useId,useLayoutEffect,useRef,type CSSProperties,type ComponentPropsWithoutRef,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';

/** Shared lifecycle for existing geometry dialogs that keep their own layout. */
export function openAppDialog(dialog:HTMLDialogElement|null):()=>void {
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(dialog&&!dialog.open)dialog.showModal();
  return()=>{
    if(dialog?.open)dialog.close();
    if(previous?.isConnected)previous.focus();
  };
}

export interface AppDialogProps extends Omit<ComponentPropsWithoutRef<'dialog'>,'title'|'children'|'onClose'|'open'> {
  title:string;
  onClose:()=>void;
  children:ReactNode;
  footer?:ReactNode;
  size?:'small'|'medium'|'large'|'workspace';
  busy?:boolean;
  closeDisabled?:boolean;
  closeLabel?:string;
  initialFocusRef?:RefObject<HTMLElement|null>;
  bodyClassName?:string;
  bodyStyle?:CSSProperties;
  /** Keep existing workspace grids and direct-child geometry selectors intact. */
  unwrapped?:boolean;
}

/** Application window shell. Native top-layer modality also supports nested tools. */
export default function AppDialog({title,onClose,children,footer,size='medium',busy=false,closeDisabled=false,closeLabel='关闭窗口',initialFocusRef,bodyClassName='',bodyStyle,unwrapped=false,className='',onCancel,onKeyDown,...props}:AppDialogProps) {
  const element=useRef<HTMLDialogElement>(null),close=useRef(onClose),locked=useRef(closeDisabled),mounted=useRef(false);
  close.current=onClose;locked.current=closeDisabled;
  const titleId=useId();
  useLayoutEffect(()=>{
    const dialog=element.current;if(!dialog)return;
    mounted.current=true;
    const restore=openAppDialog(dialog);
    if(initialFocusRef?.current)initialFocusRef.current.focus();
    else if(!dialog.contains(document.activeElement))dialog.focus();
    return()=>{
      mounted.current=false;
      restore();
    };
  },[]);
  return createPortal(<dialog {...props} ref={element} tabIndex={-1} className={`ui-dialog ${className}`.trim()} data-ui-shell data-ui-unwrapped={unwrapped||undefined} data-size={size} aria-modal="true" aria-labelledby={props['aria-label']?props['aria-labelledby']:props['aria-labelledby']??titleId} aria-busy={busy}
    onCancel={event=>{event.preventDefault();onCancel?.(event);if(!locked.current)close.current();}}
    onClose={()=>{if(mounted.current&&!locked.current)close.current();}}
    onKeyDown={event=>{onKeyDown?.(event);event.stopPropagation();}}>
    <header className="ui-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="ui-dialog-close" aria-label={closeLabel} disabled={closeDisabled} onClick={onClose} autoFocus={!initialFocusRef}><svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
    {unwrapped?children:<div className={`ui-dialog-body ${bodyClassName}`.trim()} style={bodyStyle}>{children}</div>}
    {footer!=null&&<footer className="ui-dialog-footer">{footer}</footer>}
  </dialog>,document.body);
}
