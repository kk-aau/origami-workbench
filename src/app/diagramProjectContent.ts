import type {DiagramProject} from './diagramProject';
import {defaultModelView} from './modelViewState';

type Scope='project'|'steps'|'step'|'paperStates'|'pose'|'view'|'result'|'layers'|'value';
const defaultView=defaultModelView(),empty:unknown[]=[];
// Edit/history snapshots are immutable. Remember only proven equal pairs;
// weak keys do not retain an old project or its large geometry bank.
const equalPairs=new WeakMap<object,WeakMap<object,Set<Scope>>>();
const childScope=(scope:Scope,key:string):Scope=>scope==='project'&&key==='steps'?'steps':scope==='steps'?'step':
  scope==='step'&&key==='pose'||scope==='paperStates'&&['flat','spatial','pulled'].includes(key)?'pose':
  scope==='step'&&key==='paperStates'?'paperStates':scope==='pose'&&key==='view'?'view':
  scope==='pose'&&key==='result'?'result':scope==='result'&&key==='layers'?'layers':'value';
const ignored=(scope:Scope,key:string)=>scope==='project'&&key==='activeStepId'||scope==='view'&&key==='cameras'||
  scope==='result'&&key==='warnings'||scope==='layers'&&key!=='constraints'&&key!=='relativeConstraints';

function equal(left:unknown,right:unknown,scope:Scope):boolean {
  if(Object.is(left,right))return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object')return false;
  if(equalPairs.get(left)?.get(right)?.has(scope))return true;
  if(Array.isArray(left)!==Array.isArray(right)||Object.getPrototypeOf(left)!==Object.getPrototypeOf(right))return false;
  if(Array.isArray(left)&&Array.isArray(right)&&left.length!==right.length)return false;
  // Project data is JSON-like; an unfamiliar host object is never declared
  // equal merely because it has no enumerable properties.
  if(!Array.isArray(left)&&Object.getPrototypeOf(left)!==Object.prototype&&Object.getPrototypeOf(left)!==null)return false;
  const a=left as Record<string,unknown>,b=right as Record<string,unknown>;
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  for(const key of keys){
    if(ignored(scope,key))continue;
    let x=a[key],y=b[key];
    if(scope==='pose'&&key==='view'){x??=defaultView;y??=defaultView;}
    if(scope==='layers'){x??=empty;y??=empty;}
    if(!equal(x,y,childScope(scope,key)))return false;
  }
  let byRight=equalPairs.get(left);if(!byRight){byRight=new WeakMap();equalPairs.set(left,byRight);}
  let scopes=byRight.get(right);if(!scopes){scopes=new Set();byRight.set(right,scopes);}scopes.add(scope);
  return true;
}

/** Content that needs a new persisted drawing. Panning/zooming and the selected
 * step are browsing state; paper side/rotation/colors remain authored content.
 * Runtime layer certificates/diagnostics are excluded just as the model codec
 * excludes them. Explicit layer constraints and selected solutions remain. */
export function sameDiagramProjectContent(a:DiagramProject,b:DiagramProject):boolean {return equal(a,b,'project');}

/** A library landing page is not an open editing draft. Recovered documents
 * there are already retained in storage; only an open, unsaved project needs
 * the replacement prompt. Use the pending-caption snapshot supplied by UI. */
export function diagramProjectNeedsReplacementConfirmation(current:DiagramProject,saved:DiagramProject|null,documentOpen:boolean):boolean {
  return documentOpen&&(!saved||!sameDiagramProjectContent(current,saved));
}
