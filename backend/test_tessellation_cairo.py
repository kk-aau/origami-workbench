import math
import unittest
from tessellation_cairo import cairo_vertices,cairo_cell,cairo_mesh
from tessellate import check_geometry,generate,validate_request


def area(ps):
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(ps,ps[1:]+ps[:1])))/2


class CairoTests(unittest.TestCase):
    def test_unit_polygon_closure_original_angle_equations_and_mirror(self):
        for d in (60.1,61,70,80,90,98.707370271,105,110,119.9):
            p=cairo_vertices(d)
            angles=[]
            for i,a in enumerate(p):
                u,v=p[i-1]-a,p[(i+1)%5]-a
                self.assertAlmostEqual(abs(v),1,places=11)
                angles.append(math.acos(max(-1,min(1,(u.conjugate()*v).real/(abs(u)*abs(v))))))
            self.assertAlmostEqual(sum(angles),3*math.pi,places=10)
            self.assertAlmostEqual(angles[0],math.radians(d),places=10)
            self.assertAlmostEqual(angles[3],math.pi-angles[0],places=10)
            # Independent original CairoPentagonAngles closure equations.
            a,b,c=angles[:3]
            self.assertAlmostEqual(1+math.cos(a)-math.cos(a-c)+math.cos(a-b-c)-math.cos(b+c),0,places=10)
            self.assertAlmostEqual(-math.sin(a)+math.sin(a-c)-math.sin(a-b-c)-math.sin(b+c),0,places=10)
            mirror=cairo_vertices(180-d)
            distances=lambda q:sorted(round(abs(x-y),9) for i,x in enumerate(q) for y in q[:i])
            self.assertEqual(distances(p),distances(mirror))

    def test_notebook_saved_double_cairo_90_coordinates(self):
        # Origamica 15.0.nb Out[3294], stored output (not re-executed Wolfram).
        origins=[(0,0),(-.9114378277661471,2.4114378277661483),(-.9114378277661471,2.4114378277661483),(0,0),(-.9114378277661471,2.4114378277661483),(-1.8228756555322927,4.822875655532298),(-1.8228756555322927,4.822875655532298),(-.9114378277661471,2.4114378277661483)]
        rotations=[0,-90,-180,90,0,-90,180,90]
        cell=cairo_cell(90,True)
        for spec,rotation in zip(cell['tileSpecs'],rotations):
            self.assertAlmostEqual(spec['rotation'],rotation,places=11)
        for tile,spec,origin,rotation in zip(cell['tiles'],cell['tileSpecs'],origins,rotations):
            self.assertEqual(spec['tiletype'],'UnitCairoPentagonTile')
            self.assertEqual(spec['cairoAngle'],90)
            for x,y in zip(tile[0],origin):self.assertAlmostEqual(x,y,places=12)
            for x,y in zip(spec['offset'],origin):self.assertAlmostEqual(x,y,places=12)
            e=complex(tile[1][0]-tile[0][0],tile[1][1]-tile[0][1])
            self.assertAlmostEqual(abs(e-complex(math.cos(math.radians(rotation)),math.sin(math.radians(rotation)))),0,places=12)

    def test_notebook_patch_tile_sources_and_period_vectors(self):
        # In[3285]/[3293]: alternating δ and π-δ in JoinTiling order.
        # In[3289]/[3296]: the two PatchVector vertex pairs are ordered.
        for angle in (70,90,98.707370271,105):
            for double in (False,True):
                cell=cairo_cell(angle,double)
                specs=cell['tileSpecs'];tiles=cell['tiles']
                expected_angles=([angle,180-angle,angle,180-angle]+
                                 ([180-angle,angle,180-angle,angle] if double else []))
                self.assertEqual([s['cairoAngle'] for s in specs],expected_angles)
                for spec,polygon in zip(specs,tiles):
                    theta=math.radians(spec['rotation'])
                    turn=complex(math.cos(theta),math.sin(theta))
                    origin=complex(*spec['offset'])
                    self.assertAlmostEqual(spec['scale'],1,places=12)
                    for unit,embedded in zip(spec['vertices'],polygon):
                        self.assertAlmostEqual(abs(origin+turn*complex(*unit)-complex(*embedded)),0,places=10)
                if double:
                    expected=((0,2,2,1),(4,2,3,4))
                else:
                    expected=((0,2,3,4),(2,1,3,4))
                for lattice,(tile_a,point_a,tile_b,point_b) in zip(cell['lattice'],expected):
                    self.assertAlmostEqual(lattice[0],tiles[tile_a][point_a][0]-tiles[tile_b][point_b][0],places=11)
                    self.assertAlmostEqual(lattice[1],tiles[tile_a][point_a][1]-tiles[tile_b][point_b][1],places=11)
        result=generate(dict(family='archimedean',tiling='double-cairo',cairoAngle=95))
        self.assertEqual(result['source']['periodicCell']['tileSpecs'],cairo_cell(95,True)['tileSpecs'])

    def test_periodic_cells_cover_the_plane_without_crossings(self):
        for d in (60.1,70,90,98.7074,105,119.9):
            for double in (False,True):
                cell=cairo_cell(d,double);u,v=cell['lattice']
                self.assertEqual(len(cell['tiles']),8 if double else 4)
                self.assertAlmostEqual(sum(area(p) for p in cell['tiles']),abs(u[0]*v[1]-u[1]*v[0]),places=9)
                mesh=cairo_mesh(d,double,3,2)
                self.assertEqual(check_geometry(mesh)['status'],'passed')
                self.assertEqual(len(mesh['vertices_coords'])-len(mesh['edges_vertices'])+len(mesh['faces_vertices']),1)
                self.assertEqual(len(mesh['faces_vertices']),6*(8 if double else 4))
                self.assertTrue(all(len(f)==5 for f in mesh['faces_vertices']))
        self.assertNotEqual(cairo_cell(90)['lattice'],cairo_cell(105)['lattice'])

    def test_output_contract_and_reject_inapplicable_twist(self):
        for kind in ('cairo','double-cairo'):
            for angle in (70,90,105):
                p=dict(family='archimedean',tiling=kind,cairoAngle=angle)
                result=generate(p)
                self.assertEqual(result['stats']['foldability'],'not_applicable')
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],'not_applicable')
                self.assertEqual(set(result['fold']['edges_assignment']),{'F','B'})
                self.assertEqual(result['source']['output'],'tiling')
                if kind=='cairo' or angle==90:
                    cp=generate({**p,'cairoOutput':'twist'})
                    self.assertEqual(cp['stats']['checks']['geometry']['status'],'passed')
                    self.assertEqual(cp['stats']['checks']['local']['status'],'passed')
                    self.assertIn('M',cp['fold']['edges_assignment'])
                else:
                    with self.assertRaises(ValueError):generate({**p,'cairoOutput':'twist'})
        for patch in ({'cairoAngle':60},{'cairoAngle':120},{'repeatX':5},{'repeatY':1.5},{'cairoOutput':'bad'}):
            with self.assertRaises(ValueError):validate_request(dict(family='archimedean',tiling='cairo',**patch))
        with self.assertRaises(ValueError):validate_request(dict(family='archimedean',tiling='3.6.3.6',cairoAngle=90))


if __name__=='__main__':unittest.main()
