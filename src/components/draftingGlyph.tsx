// Icon colors describe geometry roles, independent of the active mountain/valley type.
const EXISTING = '#202124';
const GUIDE = '#8b4bc0';
const RESULT = '#009eae';
const guide = (d:string) => <path d={d} stroke={GUIDE} strokeWidth="1.5"/>;
const result = (d:string) => <path d={d} stroke={RESULT} strokeWidth="2"/>;
const point = (x:number,y:number,color=GUIDE) => <circle cx={x} cy={y} r="1.5" fill={color} stroke="none"/>;
const circle = (x:number,y:number,r:number,color=RESULT) => <circle cx={x} cy={y} r={r} stroke={color}/>;

/** Keep reference, temporary and output geometry separate even at 18 px. */
function constructionGlyph(name:string){
 switch(name){
 case 'line':return <>{result('M4 20 20 4')}{point(4,20)}{point(20,4)}</>;
 case 'restrictedline':return <><path d="M20 3v18"/>{guide('M4 17 11 13')}{result('M4 17 20 8M15.5 8.3 20 8 17.8 12')}{point(4,17)}{point(11,13)}</>;
 case 'perpendicular':return <><path d="M3 19h18"/>{guide('M11 14h5v5')}{result('M11 19V4')}{point(11,4)}</>;
 case 'parallel':return <><path d="m3 10 18-6"/>{result('m3 20 18-6')}{point(9,18)}</>;
 case 'offsetparallel':return <><path d="M3 5h18"/>{guide('M12 6v12m-3-9 3-3 3 3m-6 6 3 3 3-3')}{result('M3 19h18')}</>;
 // Both angle legs and the perpendicular-bisector baseline join clicked points.
 case 'bisect':return <>{guide('M3 3v18h18M3 15a6 6 0 0 1 6 6')}{result('M3 21 20 4')}</>;
 case 'bisectlines':return <><path d="M3 3v18h18"/>{guide('M3 15a6 6 0 0 1 6 6')}{result('M3 21 20 4')}</>;
 case 'midperp':return <>{guide('M3 16h18M12 12h4v4')}{result('M12 3v18')}{point(3,16)}{point(21,16)}</>;
 case 'rabbitear':return <>{guide('M3 20 12 3 21 20Z')}{result('M3 20 12 14 21 20M12 3v11')}</>;
 case 'fishbone':return <>{guide('M3 18 21 6')}{result('M3 10 9 19M9 6l6 9M15 2l6 9')}</>;
 case 'polygon':return <>{result('M6 20 2 9 12 2 22 9 18 20H6')}{guide('M6 20h12')}{point(6,20)}{point(18,20)}</>;
 case 'foldableinput':return <><path d="M3 19 12 10 21 19"/>{guide('M4 4l4 4m8 0 4-4')}{result('M12 10V2')}{point(12,10)}</>;
 case 'foldabledraw':return <><path d="M3 19 12 10"/>{guide('M4 4l4 4m8 4 5 5')}{result('M12 10 20 2')}{point(12,10)}</>;
 case 'localflat':return <><path d="M3 4 12 12 21 4M12 12v10"/>{result('M12 12h10')}{point(12,12)}</>;
 case 'angleconverge':return <>{guide('M3 20h18')}{result('M3 20 12 4 21 20')}{point(3,20)}{point(21,20)}</>;
 case 'angleproject':return <>{guide('M3 20h18M15 8h6v12')}{result('M3 20 15 8')}{point(21,8)}</>;
 case 'angledrag':return <>{guide('M3 20h18M9 20a6 6 0 0 0-1.76-4.24')}{result('M3 20 20 3')}{point(3,20)}</>;
 case 'angledirection':return <><path d="M18 3v18"/>{guide('M3 20h10')}{result('M3 20 18 5')}{point(3,20)}</>;
 // Mapping paths are guides; the cyan crease is the fold that performs the mapping.
 case 'axiom5':return <><path d="M3 4h18"/>{guide('M8 4v14')}{result('M3 11h18')}{point(8,18)}{point(17,11)}</>;
 case 'axiom7':return <><path d="M3 4h18M19 10v12"/>{guide('M7 4v16M15 10v4h4')}{result('M3 10h18')}{point(7,16)}</>;
 case 'mirrorline':return <><path d="M12 2v20M3 5l5 14"/>{result('M21 5 16 19')}</>;
 case 'mirrorselection':return <><path d="M3 6 8 12 3 18Z"/>{guide('M12 2v20')}{result('M21 6 16 12 21 18Z')}</>;
 case 'reflection':return <>{guide('M12 2v20M3 4l9 12')}{result('M12 16 21 4')}</>;
 case 'reflectionlines':return <><path d="M12 2v20M3 4l9 12"/>{result('M12 16 21 4')}</>;
 case 'continuous':return <><path d="M8 3v18M16 3v18" strokeWidth="1.3"/>{result('M2 19 8 13 16 11 22 4M18.5 4.7 22 4 21.3 7.5')}{point(8,13)}{point(16,11)}</>;
 case 'transverse':return <><path d="M3 5 12 9M3 17h9"/>{guide('M12 2v20')}{result('M12 9 21 5M12 17h9')}</>;
 case 'moveselection':return <><path d="M2 7h7v10H2Z"/>{guide('M10 12h4m-2-2 2 2-2 2')}{result('M15 7h7v10h-7Z')}</>;
 case 'copyselection':return <><path d="M3 3h11v11H3Z"/>{result('M10 10h11v11H10Z')}</>;
 case 'movefour':case 'copyfour':return <><path d="M3 13h7v8H3Z"/>{guide('M3 10 14 3M10 21l11-9')}{result('M14 3h7v9h-7Z')}{name==='copyfour'&&guide('M16 18h6m-3-3v6')}</>;
 case 'extend':case 'lengthen':return <><path d="M3 17h8M21 3v18"/>{result('M11 17h10')}{point(11,17)}</>;
 case 'trim':return <><path d="M13 15h9"/>{guide('M13 5v15')}{result('M2 15h11')}</>;
 case 'divide':return <><path d="M3 12h18"/>{result('M9 8v8M15 8v8')}{point(3,12,EXISTING)}{point(21,12,EXISTING)}</>;
 case 'ratio':return <><path d="M3 13h18"/>{guide('M3 5h5m4 0h9')}{result('M9 9v8')}{point(3,13,EXISTING)}{point(21,13,EXISTING)}</>;
 case 'drawdivide':return <>{result('M3 18 21 6M9 10v8M15 6v8')}{point(3,18)}{point(21,6)}</>;
 case 'drawratio':return <>{guide('M3 5h4l3 4 3-7h8')}{result('M3 17h18M10 13v8')}{point(3,17)}{point(21,17)}</>;
 case 'addvertex':return <><path d="M3 15h18"/>{result('M10 4h6m-3-3v6')}{point(13,15,RESULT)}</>;
 case 'circle':return <>{circle(12,12,8)}{guide('m12 12 6-5')}{point(12,12)}{point(18,7)}</>;
 case 'circleradius':return <>{circle(12,12,8)}{guide('M12 12h8M17 9v6')}{point(12,12)}</>;
 case 'restrictedcircle':return <>{circle(12,12,9)}{guide('M12 12h9M10 10h4v4h-4Z')}</>;
 case 'circle3':return <>{circle(12,12,8)}{point(12,4)}{point(5.07,16)}{point(18.93,16)}</>;
 case 'circleseparate':return <>{circle(8,8,6)}{point(8,8)}{guide('M13 19h8M13 16v6M21 16v6')}</>;
 case 'circleconcentric':return <>{circle(12,12,5,EXISTING)}{circle(12,12,9)}{guide('M17 12h4')}{point(12,12)}</>;
 case 'circleequal':return <>{circle(6,8,5,EXISTING)}{circle(18,16,5)}{guide('M14 3h7M14 6h7')}{point(18,16)}</>;
 case 'circlepair':return <>{circle(7,12,3,EXISTING)}{circle(17,12,3,EXISTING)}{circle(7,12,5)}{circle(17,12,5)}</>;
 case 'tangentpoint':return <>{circle(16,12,5,EXISTING)}{guide('M3 12 14.08 16.62')}{result('M3 12 14.08 7.38')}{point(3,12)}</>;
 case 'tangentcircles':return <>{circle(6,13,4,EXISTING)}{circle(18,13,4,EXISTING)}{guide('M6 17h12')}{result('M6 9h12')}</>;
 case 'circledifference':return <>{circle(8,12,6,EXISTING)}{circle(8,12,3)}{guide('M17 4v6M14 7h6M14 17h6')}</>;
 case 'circleinvert':return <>{circle(16,12,5,EXISTING)}{guide('M3 12h13')}{circle(10.8,12,3)}{point(3,12)}</>;
 case 'lineinvert':return <><path d="M3 3v18"/>{guide('M3 12h12')}{circle(15,12,7)}{point(22,12)}</>;
 // Voronoi is a temporary construction overlay, not committed crease geometry.
 case 'voronoi':return <>{guide('M3 9l8 3 4-9M11 12l-2 9M11 12l10 4')}{point(7,5)}{point(18,9)}{point(16,20)}</>;
 default:return null;
 }
}

export function draftingGlyph(name:string){
 const construction=constructionGlyph(name);
 if(construction)return <g stroke={EXISTING}>
  <rect className="construction-icon-backdrop" x="0" y="0" width="24" height="24" rx="2" fill="#fafaf7" stroke="none"/>
  {construction}
 </g>;
 switch(name){
 // Three long, unadorned segments in a wider viewBox remain readable in the dock.
 case 'alternatecollinear':return <><path d="M1.5 4h11m11 0h11" stroke="#e55365" strokeWidth="3" strokeLinecap="butt" vectorEffect="non-scaling-stroke"/><path d="M12.5 4h11" stroke="#6670ee" strokeWidth="3" strokeLinecap="butt" vectorEffect="non-scaling-stroke"/></>;
 case 'select':return <><path strokeDasharray="2 3" d="M3 3h15v15H3Z"/><path d="m13 12 8 5-4 1-1 4Z"/></>;
 case 'unselect':return <><path strokeDasharray="2 3" d="M3 3h15v15H3Z"/><path d="M12 20h10"/></>;
 case 'erase':case 'erasemark':return <path d="m3 14 10-11 8 7-10 11H8ZM8 9l8 7M11 21h10"/>;
 default:return null;
 }
}
