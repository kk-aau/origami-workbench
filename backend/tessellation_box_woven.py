"""Orthogonal ribbon layouts unfolded through the section-42 woven engine.

The three product modes describe line placement, not arbitrary textile
over/under sequences. Every layout uses the same alternating ribbon topology.
"""


def box_woven_layout(params):
    width = params['width']
    delta = (1-width)/4
    kind = params['weave']
    xs = [i+.5+(0 if kind == 'plain' else delta*(1 if i % 2 == 0 else -1)
                if kind == 'basket' else delta*(i % 3-1))
          for i in range(params['columns'])]
    ys = [j+.5 for j in range(params['rows'])]
    # Adjacent centres are at least 1-2*delta=(1+width)/2 apart.
    # Subtract the full width for a clear gap >=(1-width)/2.
    # At either outer edge the clear gap is >=(1-width)/4.
    return xs, ys


def construct_box_woven(params):
    from tessellation_woven import construct_woven

    width = params['width']
    xs, ys = box_woven_layout(params)
    # The product width is the entire folded ribbon, not its one-sided inset.
    # Reuse the public line-group representation: global half-width times
    # ratio two gives the requested full width on every mother edge.
    internal = dict(family='woven-lines',mode='lines',width=width/2,
                    lines=[[0.,y,2.] for y in ys]+[[90.,-x,2.] for x in xs],
                    boundary=[[0.,0.],[float(params['columns']),0.],
                              [float(params['columns']),float(params['rows'])],
                              [0.,float(params['rows'])]],
                    parity=1,minPleat=1.,minBorderPleat=.01,
                    borderInset='none',stationaryFace=0)
    # A narrow grouped grid couples many interior and boundary lengths. The
    # original engine's third deterministic seed starts these closer together
    # and avoids a long flat least-squares valley. Retain all original fallback
    # seeds, equations, limits and geometry checks; line-group defaults stay as-is.
    fold, mother, dual, _, source = construct_woven(internal,initial_lengths=((1.6,1.),))
    if params['phase']:
        # A back-side view reverses all signs and layer order while retaining
        # the same isometric geometry and the same stationary face.
        reverse={'M':'V','V':'M'}
        fold['edges_assignment']=[reverse.get(kind,kind) for kind in fold['edges_assignment']]
        fold['edges_foldAngle']=[{'M':-180,'V':180}.get(kind) for kind in fold['edges_assignment']]
    source.update(algorithm='orthogonal-ribbon-layout / inverse-isometry',version=2,
                  ribbonLayout=params['weave'],stripWidth=width,singleSideInset=width/2,
                  columnPositions=xs,rowPositions=ys,
                  layoutMinimumClearance=(1-width)/2,
                  layoutBorderClearance=(1-width)/4,
                  foldedFormMethod='woven ribbon inverse isometry constraints',
                  foldedFormMaxIsometryError=source['closureError'])
    return fold,mother,dual,params['rows']*params['columns'],source
