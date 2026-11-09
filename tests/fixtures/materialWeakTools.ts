import assert from 'node:assert/strict';
import type {Doc,Point} from '../../src/core/types';
import type {MaterialCurveIntent} from '../../src/core/materialCurves';
import {materialDoc} from './materialModel';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
export const weakToolMaterial=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
export const weakToolSheet=(hole=false)=>{const p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[40,40],[60,40],[60,60],[40,60]] as Point[]:[])],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])];return materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);};
export const weakToolLine=(a:Point,b:Point,assignment:'F'|'M'='F',cpOnly=true):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves:[{kind:'bezier-path',assignment,nodes:[{point:a,incoming:a,outgoing:a},{point:b,incoming:b,outgoing:b}]}],deviation:1,fixedPoint:[10,10],cpOnly});
export function weakToolSource(name:string){const request=name==='boundary'?weakToolLine([0,50],[50,50]):name==='hole'?weakToolLine([0,50],[40,50]):weakToolLine([25,50],[75,50]);if(name==='cross')request.curves.push(...weakToolLine([50,25],[50,75]).curves);const built=editMaterialFaces(weakToolSheet(name==='hole'),request);return cutMaterialEdges(built.doc,{kind:'material-cut',segmentIds:built.insertedIds!}).doc;}
export function weakToolAnchor(doc:Doc,p:Point,edge?:number){const m=weakToolMaterial(doc),g=m.graph;const e=edge??g.edges_vertices.findIndex(([a,b],i)=>{if(g.edges_assignment[i]!=='B')return false;const x=g.vertices_coords[a],y=g.vertices_coords[b];return (y[0]-x[0])*(p[1]-x[1])===(y[1]-x[1])*(p[0]-x[0])&&p[0]>=Math.min(x[0],y[0])&&p[0]<=Math.max(x[0],y[0])&&p[1]>=Math.min(x[1],y[1])&&p[1]<=Math.max(x[1],y[1]);});assert.ok(e>=0);const [a,b]=g.edges_vertices[e].map(v=>g.vertices_coords[v]),k=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])?0:1;return {edgeId:m.edgeSegmentIds[e],fraction:(p[k]-a[k])/(b[k]-a[k])};}
