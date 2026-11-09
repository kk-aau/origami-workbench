import math
import unittest
from collections import defaultdict

from tessellation_uniform import uniform_cell, uniform_mesh
from tessellation_uniform_data import CATALOG
from tessellation_meshes import polygon_mesh
from tessellate import check_geometry


def word(sequence):
    sequence=tuple(sequence)
    return min(p[i:]+p[:i] for p in (sequence,sequence[::-1]) for i in range(len(p)))


def interior_words(mesh):
    coords=mesh['vertices_coords']; faces=mesh['faces_vertices']
    edges=defaultdict(int); incident=defaultdict(list)
    for face in faces:
        center=[sum(coords[i][k] for i in face)/len(face) for k in (0,1)]
        for a,b in zip(face,face[1:]+face[:1]):edges[tuple(sorted((a,b)))]+=1
        for i in face:
            incident[i].append((math.atan2(center[1]-coords[i][1],center[0]-coords[i][0]),len(face)))
    boundary={i for edge,count in edges.items() if count==1 for i in edge}
    return {word([n for _,n in sorted(values)]) for i,values in incident.items() if i not in boundary}


class UniformTests(unittest.TestCase):
    def test_all_twenty_have_exact_vertex_words_and_regular_edges(self):
        for record in CATALOG:
            with self.subTest(index=record['index']):
                mesh=uniform_mesh(record['index'],3)
                self.assertEqual(interior_words(mesh),{word(w) for w in record['vertexTypes']})
                for a,b in mesh['edges_vertices']:
                    self.assertAlmostEqual(math.dist(mesh['vertices_coords'][a],mesh['vertices_coords'][b]),1,places=7)

    def test_periodic_cell_closes_without_holes_or_overlap(self):
        for index in range(1,21):
            with self.subTest(index=index):
                cell=uniform_cell(index);u,v=cell['lattice']
                polygons=[[[x+i*u[0]+j*v[0],y+i*u[1]+j*v[1]] for x,y in p]
                          for i in range(-1,2) for j in range(-1,2) for p in cell['polygons']]
                mesh=polygon_mesh(polygons)
                self.assertEqual(interior_words(mesh),{word(w) for w in cell['vertexTypes']})
                self.assertEqual(len(mesh['vertices_coords'])-len(mesh['edges_vertices'])+len(mesh['faces_vertices']),1)
                self.assertEqual(check_geometry(mesh)['status'],'passed')

    def test_workspace_patches_are_disks(self):
        for index in range(1,21):
            for rings in (1,2):
                with self.subTest(index=index,rings=rings):
                    mesh=uniform_mesh(index,rings)
                    self.assertEqual(len(mesh['vertices_coords'])-len(mesh['edges_vertices'])+len(mesh['faces_vertices']),1)
                    self.assertEqual(check_geometry(mesh)['status'],'passed')


if __name__=='__main__':unittest.main()
