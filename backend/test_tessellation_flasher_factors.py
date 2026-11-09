"""Original finite r/h factors and m domain, independent source invariants."""
import math
import unittest
from tessellate import generate, validate_request
from tessellation_flasher_solver import solve_flasher


def original_face_count(r,h,m):
    # In4116 major count=sum(rh-hg), minor=sum(rh-hg-1).
    # In4118 two triangles per ring; each original quad has two triangles.
    return 2*m*r*(r+1)*h+1


class FlasherFactorTests(unittest.TestCase):
    def test_every_finite_factor_combination_uses_same_radial_and_face_budget(self):
        accepted=0
        for r in range(1,10):
            for h in range(1,10):
                for m in range(3,150):
                    query={'family':'flasher','rings':r,'heightOrder':h,'rotationalOrder':m}
                    legal=r*h<=9 and original_face_count(r,h,m)<=600
                    if legal:
                        params=validate_request(query)
                        self.assertEqual((params['rings'],params['heightOrder'],params['rotationalOrder']),(r,h,m))
                        accepted+=1
                    else:
                        with self.subTest(query=query),self.assertRaises(ValueError):validate_request(query)
        self.assertGreater(accepted,100)

    def test_three_original_parameter_counterexamples_construct_and_keep_literal_fixed_xy(self):
        for r,h,m,expected in ((1,4,4,(40,104,65)),(5,1,4,(144,384,241)),(1,1,9,(36,72,37))):
            with self.subTest(r=r,h=h,m=m):
                result=generate({'family':'flasher','rings':r,'heightOrder':h,'rotationalOrder':m})
                self.assertEqual(tuple(result['stats'][key] for key in ('vertices','edges','faces')),expected)
                self.assertEqual(expected[2],original_face_count(r,h,m))
                source=result['source'];fold=result['fold']
                self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
                self.assertTrue(source['staticGlobalIsometryChecked'])
                self.assertEqual(result['stats']['checks']['layerOrder']['status'],'not_checked')
                self.assertFalse(source['continuousRigidPathChecked'])
                self.assertFalse(source['selfCollisionChecked'])
                # In4147-4153 fixes all FF XY; only z is solved by FindRoot.
                # Use literal complex multiplication rather than backend rotate.
                solved=solve_flasher(r,h,m,.05,'Y',minimum_angle_deg=10)
                self.assertEqual(solved['folded_vertices_coords'],source['foldedForm3D'])
                for (i,j,k),point in zip(solved['vertex_ijk'],source['foldedForm3D']):
                    offset=i*(i+1)+j if j<=i+1 else j*(j+1)-(i+1)
                    seed=.5*(1+.05*offset/h)*complex(1,math.tan(math.pi/m))
                    angle=2*math.pi*(k+max(i+1,j))/m
                    xy=seed*complex(math.cos(angle),math.sin(angle))
                    self.assertAlmostEqual(point[0],xy.real,places=11)
                    self.assertAlmostEqual(point[1],xy.imag,places=11)
                for face in fold['faces_vertices']:
                    for index,a in enumerate(face):
                        for b in face[index+1:]:
                            self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b]),
                                                   math.dist(source['foldedForm3D'][a],source['foldedForm3D'][b]),places=9)

    def test_new_domain_does_not_bypass_resource_or_input_gates(self):
        invalid=[dict(rings=10,heightOrder=1),dict(rings=1,heightOrder=10),dict(rings=5,heightOrder=2),
                 dict(rings=9,heightOrder=1,rotationalOrder=4),dict(rings=1,heightOrder=1,rotationalOrder=150),
                 dict(rings=True),dict(heightOrder=1.5),dict(rotationalOrder=False),dict(diagonal='Q'),
                 dict(radialIncrement=float('nan')),dict(unknown=True)]
        for patch in invalid:
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_request({'family':'flasher',**patch})


if __name__=='__main__':unittest.main()
