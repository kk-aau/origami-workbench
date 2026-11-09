import fs from 'node:fs';
const edits=new Map();function edit(file,pairs){let s=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');for(const [from,to]of pairs){if(!s.includes(from))throw Error(file+': missing '+from.slice(0,80));s=s.replace(from,to);}edits.set(file,s);}
edit('src/app/modelRegionBoundaries.ts',[
 ['import type {',"import {modelFaceRings,modelFaceContains} from './modelRings';\nimport type {"],
 ['faces.forEach(f=>f.forEach((a,i)=>{const b=f[(i+1)%f.length],key=a<b?`${a},${b}`:`${b},${a}`;if(!seen.has(key)){seen.add(key);pairs.push([a,b]);}}));','faces.forEach((_,f)=>modelFaceRings(result,f).forEach(r=>r.forEach((a,i)=>{const b=r[(i+1)%r.length],key=a<b?`${a},${b}`:`${b},${a}`;if(!seen.has(key)){seen.add(key);pairs.push([a,b]);}})));'],
 ['polygons.some(poly=>inside(p,poly))','polygons.some((_,f)=>modelFaceContains(result,f,p))']
]);
edit('src/app/modelShadowBoundaries.ts',[
 ['import type {',"import {modelFaceRings,modelFaceContains} from './modelRings';\nimport type {"],
 ["faces.forEach(face=>face.forEach((a,i)=>{const b=face[(i+1)%face.length],key=a<b?a+','+b:b+','+a;if(!seen.has(key)){seen.add(key);edges.push([a,b]);}}));","faces.forEach((_,f)=>modelFaceRings(result,f).forEach(face=>face.forEach((a,i)=>{const b=face[(i+1)%face.length],key=a<b?a+','+b:b+','+a;if(!seen.has(key)){seen.add(key);edges.push([a,b]);}})));"],
 ['display.order.filter(f=>inside(p,polygons[f]))','display.order.filter(f=>modelFaceContains(result,f,p,vertices))']
]);
edit('src/components/ModelShadows.tsx',[
 ['{boundaries,polygon}:{boundaries:ModelShadowBoundary[];polygon:Point[]}', '{boundaries,polygon,holes=[]}:{boundaries:ModelShadowBoundary[];polygon:Point[];holes?:Point[][]}'],
 ["<polygon points={polygon.map(p=>p.join(',')).join(' ')}/>","{holes.length?<path d={[polygon,...holes].map(r=>r.map((p,i)=>`${i?'L':'M'}${p.join(',')}`).join(' ')+' Z').join(' ')} fillRule=\"evenodd\" clipRule=\"evenodd\"/>:<polygon points={polygon.map(p=>p.join(',')).join(' ')}/>}"],
]);
edit('src/components/FlatView.tsx',[["<ModelShadows boundaries={shadowMap.get(i)!} polygon={faces[i].map(v=>vertices[v])}","<ModelShadows boundaries={shadowMap.get(i)!} holes={(result.geometry.graph?.faces_holes?.[i]??[]).map(r=>r.map(v=>vertices[v]))} polygon={faces[i].map(v=>vertices[v])}"]]);
edit('src/components/ModelComparisonPane.tsx',[["<ModelShadows boundaries={groups.get(i)!} polygon={result.geometry.faces[i].map(v=>display.vertices[v])}","<ModelShadows boundaries={groups.get(i)!} holes={(result.geometry.graph?.faces_holes?.[i]??[]).map(r=>r.map(v=>display.vertices[v]))} polygon={result.geometry.faces[i].map(v=>display.vertices[v])}"]]);
edit('src/app/foldedModelSVG.ts',[["<polygon points=\"${faces[s.lowerFace].map(v=>points[v].join(',')).join(' ')}\"/>","${result.geometry.graph?.faces_holes?.[s.lowerFace]?.length?`<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"${modelFacePath(result,s.lowerFace,points)}\"/>`:`<polygon points=\"${faces[s.lowerFace].map(v=>points[v].join(',')).join(' ')}\"/>`}"]]);
for(const [file,text]of edits)fs.writeFileSync(file,text);console.log('Updated ring-aware local boundaries, shadow coverage and SVG/DOM clipping.');
