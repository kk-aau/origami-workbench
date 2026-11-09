import type {DiscretizationMultipliersQuery} from './curvedNativeDiscretization';

// Original In[4093]: ConicSection2DSystem[{-2,-1},{-3/2,1}],
// DiscretizeCurveUniformly[f,5,{0,Pi/2}]. Native coupled chord equations;
// left/right vectors are original CrossCurve - f, never normalized.
// Independent 80-digit equation oracle is delivered separately; no saved Out
// or Wolfram branch-equivalence claim is attached to these finite inputs.
export const ORIGINAL_DISCRETE_4093_SOURCE:DiscretizationMultipliersQuery={
  "family": "discretization-generic-native",
  "mode": "multipliers",
  "foldPoints": [
    [
      0.0,
      0.0
    ],
    [
      -0.10138794357831911,
      0.5111071343504472
    ],
    [
      -0.3976138372603339,
      0.9590480225260948
    ],
    [
      -0.8587834170934562,
      1.2784856645633207
    ],
    [
      -1.4229915346251882,
      1.4123486180466656
    ],
    [
      -2.0,
      1.3333333333333333
    ]
  ],
  "leftRulings": [
    [
      -1.5,
      0.0
    ],
    [
      -1.4158004971274805,
      -0.3811340670945619
    ],
    [
      -1.1733583923772413,
      -0.702269572772525
    ],
    [
      -0.8082555323934667,
      -0.9054750228368036
    ],
    [
      -0.38790837858016336,
      -0.9494866978433976
    ],
    [
      0.0,
      -0.8333333333333333
    ]
  ],
  "rightRulings": [
    [
      1.0,
      0.0
    ],
    [
      0.8398587304058717,
      0.477689772677073
    ],
    [
      0.46139481695883944,
      0.7345782725082283
    ],
    [
      0.0783602644712944,
      0.709424295192304
    ],
    [
      -0.15081675505452496,
      0.5035699727851166
    ],
    [
      -0.20000000000000018,
      0.26666666666666683
    ]
  ]
};
