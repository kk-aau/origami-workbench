"""Finite read-only reproduction of Origamica's In[3878]/In[3879] circle example.

The notebook defines tangent-line extrapolation helpers, but its FindRoot equation
uses b[ui] and l[ui], never be[ui] or le[ui].  For the saved analytic circle the
actual equation therefore continues the circle beyond the interpolation domain.
"""

import math


FAMILY = 'constant-width-circle-in3879'
END = 0.35 * math.pi
MIN_WIDTH = 0.02
MAX_WIDTH = 0.105
MIN_SEGMENTS = 16
MAX_SEGMENTS = 256


def validate_constant_width_query(data):
    if not isinstance(data, dict) or data.get('family') != FAMILY:
        raise ValueError('Expected the saved In[3879] constant-width circle family.')
    if set(data) - {'family', 'width', 'segments'}:
        raise ValueError('Constant-width query contains unsupported fields.')
    segments = data.get('segments', 80)
    if type(segments) is not int or not MIN_SEGMENTS <= segments <= MAX_SEGMENTS:
        raise ValueError('segments must be an integer in [16, 256].')
    width = data.get('width', 0.1)
    if isinstance(width, bool) or not isinstance(width, (int, float)):
        raise ValueError('width must be a finite number in [0.02, 0.105].')
    width = float(width)
    if not math.isfinite(width) or not MIN_WIDTH <= width <= MAX_WIDTH:
        raise ValueError('width must be a finite number in [0.02, 0.105].')
    return {'family': FAMILY, 'width': width, 'segments': segments}


def circle(s):
    return (math.cos(s), math.sin(s))


def actual_circle_width(s, signed_offset):
    """Solve b(s)+w(-1,0)=b(ui)+offset*l(ui), matching literal FindRoot.

    On the certified branch ui<pi/2, l(ui)=-b(ui) and l·d=cos(ui)>0.
    The point of perpendicular distance is on radius (1-offset), including
    when ui lies beyond END.  Returning ui makes that branch auditable.
    """
    if not math.isfinite(s) or not 0 <= s <= END:
        raise ValueError('s must lie in the saved domain [0, 0.35 pi].')
    if not math.isfinite(signed_offset) or not MIN_WIDTH <= abs(signed_offset) <= MAX_WIDTH:
        raise ValueError('signed offset is outside the certified width domain.')
    radius = 1 - signed_offset
    sin_s = math.sin(s)
    ratio = sin_s / radius
    if ratio > 1:
        raise ValueError('No real certified foot for this offset.')
    ui = math.asin(ratio)
    width = math.cos(s) - math.sqrt(radius * radius - sin_s * sin_s)
    return width, ui


def tangent_extended_width(s, signed_offset):
    """Diagnostic only: what the notebook prose's unused be/le would imply."""
    width, ui = actual_circle_width(s, signed_offset)
    if ui <= END:
        return width
    # b_e(ui)=(cos END,sin END)+(ui-END)*(-sin END,cos END).
    # Its unit left normal remains (-cos END,-sin END).
    radius = 1 - signed_offset
    x_foot = (radius - math.sin(END) * math.sin(s)) / math.cos(END)
    return math.cos(s) - x_foot


def query_constant_width_circle(data):
    query = validate_constant_width_query(data)
    width = query['width']
    parameters = [END * i / query['segments'] for i in range(query['segments'] + 1)]
    source, left, right, dashed_left, dashed_right = [], [], [], [], []
    left_widths, right_widths, left_feet, right_feet = [], [], [], []
    left_foot_points, right_foot_points = [], []
    for s in parameters:
        x, y = circle(s)
        wl, ul = actual_circle_width(s, width)
        wr, ur = actual_circle_width(s, -width)
        source.append([x, y])
        left.append([x - wl, y])
        right.append([x - wr, y])
        dashed_left.append([x - width, y])
        dashed_right.append([x + width, y])
        left_widths.append(wl)
        right_widths.append(wr)
        left_feet.append(ul)
        right_feet.append(ur)
        left_foot_points.append(list(circle(ul)))
        right_foot_points.append(list(circle(ur)))
    end_circle_width = left_widths[-1]
    end_tangent_width = tangent_extended_width(END, width)
    return {
        'family': 'origamica-constant-width-circle-band',
        'query': query,
        'source': {
            'definitionCell': 'In[3878]',
            'savedCell': 'In[3879]',
            'function': 'NConstantWidthScale2D',
            'actualEquationUsesUnextendedCurve': True,
            'declaredTangentExtensionUnused': True,
            'machineReadableWolframOut': False,
        },
        'domain': {'start': 0, 'end': END, 'director': [-1, 0]},
        'certification': {
            'perpendicularDistanceAnalytic': True,
            'actualFootCanExceedDomain': True,
            'endpointTangentExtrapolationImplemented': False,
            'sampledBandExactFOLD': False,
            'adoptableCreasePattern': False,
            'selfIntersectionChecked': False,
        },
        'diagnostic': {
            'leftFootLeavesDomainAt': math.asin((1-width)*math.sin(END)),
            'leftEndFootParameter': left_feet[-1],
            'rightEndFootParameter': right_feet[-1],
            'actualCircleEndpointWidth': end_circle_width,
            'unusedTangentEndpointWidth': end_tangent_width,
        },
        'sample': {
            'parameterValues': parameters,
            'sourceCurve': source,
            'leftBoundary': left,
            'rightBoundary': right,
            'dashedLeftDirector': dashed_left,
            'dashedRightDirector': dashed_right,
            'leftWidthValues': left_widths,
            'rightWidthValues': right_widths,
            'leftFootParameters': left_feet,
            'rightFootParameters': right_feet,
            'leftFootPoints': left_foot_points,
            'rightFootPoints': right_foot_points,
        },
    }
