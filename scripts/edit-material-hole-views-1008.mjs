import fs from 'node:fs';
const edits=new Map();
function edit(file,replacements){let s=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');for(const [from,to]of replacements){if(!s.includes(from))throw Error(file+': missing marker '+from.slice(0,90));s=s.replace(from,to);}edits.set(file,s);}
edit('src/components/MaterialTopologyPlot.tsx',[
 ["import type {FoldGraph,Point}","import IndexedFaceShape from './IndexedFaceShape';\nimport type {FoldGraph,Point}"],
 ['<polygon key={`f${f}`} points={row.map(v=>plot(graph.vertices_coords[v]).join(\',\')).join(\' \')}','<IndexedFaceShape key={`f${f}`} outer={row} holes={graph.faces_holes?.[f]} coords={graph.vertices_coords} map={plot}'],
 ['<title>F{f+1}</title></polygon>','<title>F{f+1}</title></IndexedFaceShape>']
]);
edit('src/components/FlatView.tsx',[
 ["import {Fragment", "import IndexedFaceShape from './IndexedFaceShape';\nimport {Fragment"],
 ["<polygon points={faces[i].map(v=>vertices[v].join(',')).join(' ')} data-face-id={i}","<IndexedFaceShape outer={faces[i]} holes={result.geometry.graph?.faces_holes?.[i]} coords={vertices} data-face-id={i}"],
 ["<polygon points={input.faces_vertices[face].map(i=>input.vertices_coords[i].join(',')).join(' ')}", "<IndexedFaceShape outer={input.faces_vertices[face]} holes={input.faces_holes?.[face]} coords={input.vertices_coords}"]
]);
edit('src/components/ModelComparisonPane.tsx',[
 ["import {Fragment", "import IndexedFaceShape from './IndexedFaceShape';\nimport {Fragment"],
 ["<polygon data-face-id={i} points={result.geometry.faces[i].map(v=>display.vertices[v].join(',')).join(' ')}","<IndexedFaceShape data-face-id={i} outer={result.geometry.faces[i]} holes={result.geometry.graph?.faces_holes?.[i]} coords={display.vertices}"]
]);
edit('src/app/foldedModelSVG.ts',[
 ['import type {', "import {modelFacePath} from './modelRings';\nimport type {"],
 ['return `<polygon data-face-id="${i}" points="${facePoints.map(v=>v.join(\',\')).join(\' \')}"','return `${result.geometry.graph?.faces_holes?.[i]?.length?`<path data-face-holes="${result.geometry.graph.faces_holes[i].length}" fill-rule="evenodd" d="${modelFacePath(result,i,points)}"`:`<polygon points="${facePoints.map(v=>v.join(\',\')).join(\' \')}"`} data-face-id="${i}"']
]);
for(const [file,text]of edits)fs.writeFileSync(file,text);
console.log('Updated material, single/comparison model and SVG face drawing without changing ordinary polygon markup.');
