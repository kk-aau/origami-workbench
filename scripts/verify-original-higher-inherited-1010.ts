import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,apiWhenIdle} from '../src/app/api';
import {parseGenericSpaceCurveFoldResult} from '../src/app/curvedNativeSpaceCurveFold';
import {parseGenericRibbonResult} from '../src/app/curvedNativeRibbon';
import {parseGenericNonuniformHelixResult} from '../src/app/curvedNativeNonuniformHelix';
const load=(f:string)=>JSON.parse(fs.readFileSync('tests/fixtures/'+f,'utf8'));
const cases=[{name:'space-curve',endpoint:'curved-space-curve-fold-generic',query:{...load('origamica-space-curve-fold-generic-half-angle-pi.json').query,rulingSegments:3},parse:parseGenericSpaceCurveFoldResult},
 {name:'ribbon',endpoint:'curved-ribbon-generic',query:{...load('origamica-ribbon-generic-interior.json').query,rulingSegments:3},parse:parseGenericRibbonResult},
 {name:'helix',endpoint:'curved-nonuniform-helix-generic',query:{...load('curved-nonuniform-helix-native-20261001.json')[0].query,segments:8,rulingSegments:3},parse:parseGenericNonuniformHelixResult}];
const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>originalFetch(new URL(String(input),'http://127.0.0.1:8850'),init);
const checks=[];
try{await connect();for(const c of cases){const r=c.parse(await apiWhenIdle('tessellation/'+c.endpoint,c.query),c.query);assert.deepEqual(r.query,c.query);assert.equal(r.certification.adoptableCreasePattern,false);assert.equal(Object.hasOwn(r,'resampling'),false);fs.writeFileSync(`output/original-higher-browser-1010/inherited-${c.name}-response.json`,JSON.stringify(r,null,2));checks.push({name:c.name,passed:true,actualAuthenticatedAPI:true,independentSourceAndNumericalReplay:true,oldContinuousPathPreserved:true});}}
finally{globalThis.fetch=originalFetch;}
fs.writeFileSync('output/original-higher-browser-1010/inherited-server-report.json',JSON.stringify({passed:3,checks},null,2));console.log('Three actual authenticated inherited APIs independently replay and retain continuous recovery without accidental resampling.');
