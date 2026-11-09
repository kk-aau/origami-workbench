"""Exact shrink/rotate coordinates for a browser frame, separate from validation."""


def shrink_rotate_preview(graph, fold):
    # A twist face owns its transformed vertices. Remaining vertices are fixed.
    coefficients = {}
    for face in graph.faces:
        if 'rotation_center' not in face.attributes:
            continue
        cx, cy = map(float, face['rotation_center'])
        for vertex in face.vertex_iter():
            x, y = map(float, vertex['base_pos'])
            coefficients[vertex] = [cx, cy, x-cx, y-cy]
    by_position = {}
    for vertex in graph.vertices:
        x, y = map(float, vertex['pos'])
        key = (round(x, 10), round(y, 10))
        if key in by_position:
            return None  # Degenerate coincident vertices have no unique mapping.
        by_position[key] = coefficients.get(vertex, [x, y, 0., 0.])
    return {'kind': 'shrink-rotate', 'vertices': [by_position[tuple(round(x, 10) for x in p)] for p in fold['vertices_coords']]}
