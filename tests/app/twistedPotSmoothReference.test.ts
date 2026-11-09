import test from 'node:test';
import assert from 'node:assert/strict';
import {twistedPotPreset} from '../../src/app/twistedPotParams';
import {parseSmoothPotReference} from '../../src/app/twistedPotSmoothReference';

const params=twistedPotPreset();
const sample=()=>({
  family:'twisted-pot-smooth-reference',
  query:{...params,flatFlanges:'smooth'},
  paper:{vertices:[[0,0],[1,0],[1,1],[0,1]],
    edges:[[0,1],[1,2],[2,3],[0,3]],faces:[[0,1,2,3]]},
  reference3D:{vertices:[[0,0,0],[1,0,0],[1,1,.1],[0,1,0]],
    displayVertices:[[0,0,0],[1,0,0],[1,1,.1],[0,1,0]]},
  diagnostics:{paperGeometryPassed:true,maximumFaceDistanceError:.005,
    maximumFacePlaneError:.1,maximumGoreEquationResidual:1e-12},
  certification:{metricPreserving:false,adoptableCreasePattern:false,
    continuousFoldChecked:false,savedNumericalOut:false},
  source:{notebookRows:[268886,271306],note:'原版非等距示意'},
});

test('smooth pot reference accepts only read-only nonmetric geometry',()=>{
  assert.equal(parseSmoothPotReference(sample(),params).paper.edges.length,4);
  const falseCertificate=sample();
  falseCertificate.certification.adoptableCreasePattern=true;
  assert.throws(()=>parseSmoothPotReference(falseCertificate,params));
  const wrongVertex=sample();
  wrongVertex.paper.edges[0][1]=4;
  assert.throws(()=>parseSmoothPotReference(wrongVertex,params));
  assert.throws(()=>parseSmoothPotReference(sample(),{...params,sectors:8}));
});
