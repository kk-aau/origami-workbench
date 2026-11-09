import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Doc} from '../../src/core/types';
import DiagramCPWorkspace from '../../src/components/DiagramCPWorkspace';
import '../../src/styles.css';
import '../../src/components/softWorkbench.css';
import '../../src/components/DiagramWorkspace.css';

const original:Doc={name:'操作一致性',paper:{width:100,height:100},segments:[
  {id:'main',a:[10,20],b:[90,20],assignment:'M',angle:-180},
  {id:'aux',a:[10,80],b:[90,80],assignment:'A',angle:0},
],objects:[{id:'circle',kind:'circle',center:[50,50],radius:15,color:'#367d86'}]};

function Harness(){
  const [doc,setDoc]=useState(original),[visible,setVisible]=useState(false),[disabled,setDisabled]=useState(false);
  const [grid,setGrid]=useState({grid:false,snap:false,diagonalGrid:false,divisions:8});
  Object.assign(window,{cpInteractionHarness:{doc,reset(){setDoc(structuredClone(original));},showOther(value:boolean){setVisible(value);},disable(value:boolean){setDisabled(value);}}});
  const base={gridSettings:grid,onGridSettings:(patch:Partial<{grid:boolean;snap:boolean}>)=>setGrid(old=>({...old,...patch})),editable:true,reason:'',disabled:false,onReturn:()=>{},onMessage:()=>{}};
  return <div className="soft-workbench diagram-workspace" style={{height:'100vh',display:'flex',flexDirection:'column'}}>
    <div id="other-workspace" style={{display:visible?'flex':'none',height:visible?'45vh':0}}><DiagramCPWorkspace {...base} doc={original} index={0} onCommit={()=>true}/></div>
    <div id="active-workspace" style={{display:'flex',flex:1,minHeight:0}}><DiagramCPWorkspace {...base} disabled={disabled} doc={doc} index={1} onCommit={next=>{setDoc(next);return true;}}/></div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
