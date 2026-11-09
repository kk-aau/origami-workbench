/** Literal-only subset of PolygonTile's TileIndex -> ToString[ci] in In[2860].
 * Symbols are unassigned label atoms. This parser never evaluates definitions,
 * functions, assignments, boxes or Mathematica programs. */
export type TileLabelAtom={kind:'symbol'|'string'|'integer'|'real'|'none';label:string|null};
export const MAX_TILE_LABEL_SOURCE=128;
const GREEK:Record<string,string>={
  Alpha:'α',Beta:'β',Gamma:'γ',Delta:'δ',Epsilon:'ϵ',Zeta:'ζ',Eta:'η',Theta:'θ',
  Iota:'ι',Kappa:'κ',Lambda:'λ',Mu:'μ',Nu:'ν',Xi:'ξ',Omicron:'ο',Pi:'π',Rho:'ρ',
  Sigma:'σ',Tau:'τ',Upsilon:'υ',Phi:'ϕ',Chi:'χ',Psi:'ψ',Omega:'ω',
  CapitalAlpha:'Α',CapitalBeta:'Β',CapitalGamma:'Γ',CapitalDelta:'Δ',CapitalEpsilon:'Ε',
  CapitalZeta:'Ζ',CapitalEta:'Η',CapitalTheta:'Θ',CapitalIota:'Ι',CapitalKappa:'Κ',
  CapitalLambda:'Λ',CapitalMu:'Μ',CapitalNu:'Ν',CapitalXi:'Ξ',CapitalOmicron:'Ο',
  CapitalPi:'Π',CapitalRho:'Ρ',CapitalSigma:'Σ',CapitalTau:'Τ',CapitalUpsilon:'Υ',
  CapitalPhi:'Φ',CapitalChi:'Χ',CapitalPsi:'Ψ',CapitalOmega:'Ω',
  CurlyEpsilon:'ε',CurlyTheta:'ϑ',CurlyKappa:'ϰ',CurlyPhi:'φ',CurlyPi:'ϖ',CurlyRho:'ϱ',FinalSigma:'ς',
};
const validLabel=(label:string)=>label.length<=32&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(label);

function decodeLiteral(source:string,quoted:boolean):string|null{
  let output='';
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(char==='"')return null;
    if(char!=='\\'){output+=char;continue;}
    const next=source[i+1];
    if(quoted&&(next==='\\'||next==='"')){output+=next;i++;continue;}
    const escape=/^\\\[([A-Za-z]+)\]/.exec(source.slice(i));
    if(!escape||!Object.hasOwn(GREEK,escape[1]))return null;
    output+=GREEK[escape[1]];i+=escape[0].length-1;
  }
  return validLabel(output)?output:null;
}

export function parseTileLabelExpression(source:string):TileLabelAtom|null{
  if(typeof source!=='string'||!source.length||source.length>MAX_TILE_LABEL_SOURCE)return null;
  const atom=source.trim();
  if(atom==='None')return {kind:'none',label:null};
  if(atom.startsWith('"')&&atom.endsWith('"')&&atom.length>=2){
    const label=decodeLiteral(atom.slice(1,-1),true);
    return label===null?null:{kind:'string',label:label||null};
  }
  if(/^[+-]?\d+$/.test(atom)){
    const value=Number(atom);
    return Number.isSafeInteger(value)&&Math.abs(value)<=9_999_999_999?
      {kind:'integer',label:String(value)}:null;
  }
  if(/^[+-]?(?:\d+\.\d*|\.\d+)$/.test(atom)){
    const value=Number(atom),absolute=Math.abs(value),text=String(value);
    // OutputForm prints machine numbers to six significant digits. Keep only
    // short decimal atoms that require neither rounding nor scientific layout.
    const significant=text.replace(/[-.]/g,'').replace(/^0+/,'').length;
    if(!Number.isFinite(value)||absolute!==0&&(absolute<.001||absolute>999999)||significant>6)return null;
    return {kind:'real',label:Number.isInteger(value)?`${value}.`:text};
  }
  const label=decodeLiteral(atom,false);
  // Constants with special OutputForm/evaluation semantics are outside the
  // unassigned-symbol contract; quoted versions remain ordinary text.
  if(label===null||!label||!/^\p{L}[\p{L}\p{N}]*$/u.test(label)||
    ['Pi','π','E','I','Infinity','Indeterminate','Null'].includes(label))return null;
  return {kind:'symbol',label};
}
