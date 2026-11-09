import type {ModelWireframe} from '../app/modelWireframe';
export default function ModelWireLines({wire}:{wire:ModelWireframe}){
 return <g data-model-wireframe="true" pointerEvents="none">{wire.edges.map(e=><line key={e.index} data-edge-id={e.index} data-assignment={e.assignment} x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} stroke={e.color} strokeWidth={1} vectorEffect="non-scaling-stroke"/>)}</g>;
}
