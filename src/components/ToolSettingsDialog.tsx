import type {ReactNode} from 'react';
import AppDialog from './AppDialog';

export default function ToolSettingsDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  return <AppDialog title={title} onClose={onClose} size="large" className="tool-settings-dialog" closeLabel="关闭工具设置" unwrapped>
    <div className="tool-settings-content">{children}</div>
  </AppDialog>;
}
