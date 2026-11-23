import os
import json
import struct
import tempfile
from array import array
from pathlib import Path
from uuid import UUID

import bpy
import numpy as np
from mathutils import Matrix, Vector

# The desktop host ships this module and the output operators in one script.
# Direct Blender --python invocations load the same operators from the source tree.
if "register_render_outputs" not in globals():
    import runpy
    output_module = runpy.run_path(str(Path(__file__).with_name("blender_render_output.py")))
    register_render_outputs = output_module["register_render_outputs"]
    request_render_output = output_module["request_render_output"]

def open_requested_output(header, scene):
    request = header.get("finalRender")
    if request:
        request_render_output(request["kind"], request.get("frame"), scene=scene)

def read_values(stream, kind, count):
    values = array(kind)
    values.fromfile(stream, count)
    return values


def write_crease_distances(mesh, ink, uv, indices):
    # Across each triangle, distance to its opposite edge is affine in
    # material space. Interpolate the three distances independently so even
    # folded or overlapping sheets carry ink only on their visible surface.
    from math import hypot, isfinite
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    masks, aspect = ink["masks"], ink["aspect"]
    if len(masks) != len(mesh.polygons) or not isfinite(aspect) or aspect <= 0:
        raise ValueError("折线渲染数据无效")
    xscale, yscale = max(1, aspect), max(1, 1 / aspect)
    distances = array("f")
    widths = (0, 0.0004, 0.00065, 0.0016)  # half stroke / shorter material side
    for i, mask in enumerate(masks):
        bits = alphabet.index(mask)
        v = indices[3*i:3*i+3]
        a, b, c = points = [(uv[2*j]*xscale, uv[2*j+1]*yscale) for j in v]
        area2 = abs((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]))
        corners = [[2.0]*3 for _ in range(3)]
        for edge in range(3):
            width = widths[(bits >> (edge*2)) & 3]
            u, v = points[(edge+1)%3], points[(edge+2)%3]
            length = hypot(u[0]-v[0], u[1]-v[1])
            if width and length and area2:
                for k in range(3):
                    corners[k][edge] = area2 / (length*width) if k == edge else 0.0
        for corner in corners:
            distances.extend(corner)
    attr = mesh.attributes.new("crease_distance", "FLOAT_VECTOR", "CORNER")
    attr.data.foreach_set("vector", distances)


def paper_rgb(hex_color):
    def linear(c):
        x = c / 255
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    return (*map(linear, bytes.fromhex(hex_color.lstrip("#"))), 1.0)


def printed_crease_color(tree, base, color):
    attribute = tree.nodes.new("ShaderNodeAttribute")
    attribute.attribute_name = "crease_distance"
    channels = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(attribute.outputs["Vector"], channels.inputs[0])
    distance = channels.outputs[0]
    for channel in (channels.outputs[1], channels.outputs[2]):
        minimum = tree.nodes.new("ShaderNodeMath")
        minimum.operation = "MINIMUM"
        tree.links.new(distance, minimum.inputs[0])
        tree.links.new(channel, minimum.inputs[1])
        distance = minimum.outputs[0]
    edge = tree.nodes.new("ShaderNodeMapRange")
    tree.links.new(distance, edge.inputs["Value"])
    edge.inputs["From Min"].default_value = 0.7
    edge.inputs["From Max"].default_value = 1.3
    edge.inputs["To Min"].default_value = 0.88
    edge.inputs["To Max"].default_value = 0.0
    ink = tree.nodes.new("ShaderNodeMixRGB")
    ink.label = "折线油墨"
    tree.links.new(edge.outputs[0], ink.inputs[0])
    tree.links.new(base, ink.inputs[1])
    ink.inputs[2].default_value = paper_rgb(color)
    return ink.outputs[0]


def paper_material(step, images, resources):
    mat = bpy.data.materials.new(step["title"])
    resources.materials.add(mat.session_uid)
    mat.use_nodes = True
    tree = mat.node_tree
    mix = tree.nodes.new("ShaderNodeMixRGB")
    geometry = tree.nodes.new("ShaderNodeNewGeometry")
    tree.links.new(geometry.outputs["Backfacing"], mix.inputs[0])
    for index, side in enumerate(("front", "back"), 1):
        color = paper_rgb(step[side])
        mix.inputs[index].default_value = color
        if index == 1:
            mat.diffuse_color = color
        image_index = step[side + "Image"]
        if image_index is not None:
            tex = tree.nodes.new("ShaderNodeTexImage")
            tex.image = images[image_index]
            uv = tree.nodes.new("ShaderNodeUVMap")
            uv.uv_map = side
            tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
            tint = tree.nodes.new("ShaderNodeMixRGB")
            tint.inputs[1].default_value = color
            tree.links.new(tex.outputs["Alpha"], tint.inputs[0])
            tree.links.new(tex.outputs["Color"], tint.inputs[2])
            tree.links.new(tint.outputs[0], mix.inputs[index])
    paper = tree.nodes.get("Principled BSDF")
    paper.inputs["Roughness"].default_value = 0.86
    paper.inputs["Specular IOR Level"].default_value = 0.18
    base = printed_crease_color(tree, mix.outputs[0], step["ink"]["color"]) if step.get("ink") else mix.outputs[0]
    tree.links.new(base, paper.inputs["Base Color"])
    return mat


class AnimationResources:
    """Blender-owned data created by one import. Shared or user-owned data survives replacement."""
    def __init__(self):
        self.papers = []
        # Session IDs survive undo while Blender replaces RNA wrappers.
        self.meshes = set()
        self.materials = set()
        self.images = set()
        self.actions = set()

    def discard_objects(self):
        for paper in self.papers:
            bpy.data.objects.remove(paper, do_unlink=True)
        self.papers.clear()

    def release_unused(self):
        for library, items in ((bpy.data.meshes, self.meshes), (bpy.data.actions, self.actions),
                               (bpy.data.materials, self.materials), (bpy.data.images, self.images)):
            for item in list(library):
                if item.session_uid in items and not item.users:
                    library.remove(item)


def read_animation(snapshot, resources, single_step=False):
    start = 1
    with snapshot.open("rb") as stream:
        if stream.read(8) != b"ZZANIM01":
            raise ValueError("未知的折纸动画格式")
        header_size, = struct.unpack("<I", stream.read(4))
        header = json.loads(stream.read(header_size))
        if not header["steps"] or (single_step and len(header["steps"]) != 1):
            raise ValueError("动画步骤数量不正确")
        if not isinstance(header["fps"], int) or header["fps"] < 1:
            raise ValueError("动画帧率无效")
        length = os.fstat(stream.fileno()).st_size
        images = []
        for item in header["images"]:
            suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[item["mime"]]
            with tempfile.TemporaryDirectory(dir=snapshot.parent) as folder:
                path = Path(folder) / ("paper" + suffix)
                size = item["bytes"]
                if not 0 < size <= length - stream.tell():
                    raise ValueError("动画图像数据不完整")
                path.write_bytes(stream.read(size))
                image = bpy.data.images.load(str(path))
                images.append(image)
                resources.images.add(image.session_uid)
                image.pack()
        for index, step in enumerate(header["steps"]):
            n, triangles, frames = step["vertices"], step["triangles"], step["frames"]
            if min(n, triangles) <= 0 or frames < 2 or 12*triangles + 8*n + 12*frames*n > length - stream.tell():
                raise ValueError("动画网格或帧数据不完整")
            indices = read_values(stream, "I", 3 * triangles)
            if max(indices) >= n:
                raise ValueError("动画网格索引超出范围")
            uv = read_values(stream, "f", n * 2)
            coords = read_values(stream, "f", n * 3)
            mesh = bpy.data.meshes.new(step["title"])
            resources.meshes.add(mesh.session_uid)
            mesh.from_pydata(list(zip(*[iter(coords)] * 3)), [], list(zip(*[iter(indices)] * 3)))
            mesh.update()
            paper = bpy.data.objects.new(step["title"], mesh)
            resources.papers.append(paper)
            mesh.materials.append(paper_material(step, images, resources))
            if step.get("ink"):
                write_crease_distances(mesh, step["ink"], uv, indices)
            for side in ("front", "back"):
                layer = mesh.uv_layers.new(name=side)
                values = array("f")
                for vertex in indices:
                    u, v = uv[2*vertex:2*vertex+2]
                    values.extend((u if side == "front" else 1-u, 1-v))
                layer.data.foreach_set("uv", values)
            # Absolute shape keys embed the sampled mesh in the .blend file.
            # One linear eval_time curve drives every sample, including scrubbing.
            basis = paper.shape_key_add(name="起态", from_mix=False)
            keys = mesh.shape_keys
            keys.use_relative = False
            basis.interpolation = "KEY_LINEAR"
            keys.eval_time = 0
            keys.keyframe_insert(data_path="eval_time", frame=start)
            resources.actions.add(keys.animation_data.action.session_uid)
            for frame in range(1, frames):
                key = paper.shape_key_add(name=str(frame+1), from_mix=False)
                key.data.foreach_set("co", read_values(stream, "f", n * 3))
                key.interpolation = "KEY_LINEAR"
            end = start + frames - 1
            keys.eval_time = key.frame
            keys.keyframe_insert(data_path="eval_time", frame=end)
            action = keys.animation_data.action
            if hasattr(action, "layers"):
                bag = action.layers[0].strips[0].channelbag(keys.animation_data.action_slot)
                curves = bag.fcurves
            else:
                curves = action.fcurves
            for point in curves.find("eval_time").keyframe_points:
                point.interpolation = "LINEAR"
            if len(header["steps"]) > 1:
                for prop in ("hide_viewport", "hide_render"):
                    if index:
                        setattr(paper, prop, True)
                        paper.keyframe_insert(data_path=prop, frame=1)
                    setattr(paper, prop, False)
                    paper.keyframe_insert(data_path=prop, frame=start)
                    if index + 1 < len(header["steps"]):
                        setattr(paper, prop, True)
                        paper.keyframe_insert(data_path=prop, frame=end + step["hold"])
            start = end + step["hold"]
        if stream.read(1):
            raise ValueError("动画数据长度不匹配")
    return header, end


def paper_view_rotation(initial_view):
    if initial_view is None:
        return Vector((3, -6, 4)).to_track_quat("Z", "Y")
    axes = [(initial_view[i], initial_view[i+2], initial_view[i+1]) for i in (0, 3, 6)]
    return Matrix(axes).transposed().to_quaternion()


def animation_camera_bounds(papers, rotation, slopes, paper_world=None):
    # For each axis the near frustum wall gives a lower limit on the camera
    # offset and the far wall an upper one. The narrowest legal viewing
    # distance is exactly where those limits meet. Since the walls are
    # linear, the same bounds enclose every interpolated shape-key pose.
    to_view = np.array(rotation.to_matrix(), dtype=np.float64)
    offset = None
    if paper_world is not None:
        offset = np.array(paper_world.translation) @ to_view
        to_view = np.array(paper_world.to_3x3()).T @ to_view
    upper = np.full(2, -np.inf)
    lower = np.full(2, np.inf)
    near_z, far_z = -np.inf, np.inf
    for paper in papers:
        coords = np.empty(3 * len(paper.data.vertices), dtype=np.float32)
        for key in paper.data.shape_keys.key_blocks:
            key.data.foreach_get("co", coords)
            points = coords.reshape(-1, 3) @ to_view
            if offset is not None:
                points += offset
            depth = points[:, 2:3]
            upper = np.maximum(upper, np.max(points[:, :2] + depth * slopes, axis=0))
            lower = np.minimum(lower, np.min(points[:, :2] - depth * slopes, axis=0))
            near_z = max(near_z, depth.max())
            far_z = min(far_z, depth.min())
    return upper, lower, near_z, far_z


def camera_slopes(scene, camera):
    # Leave 7% of the image on each side for the silhouette and linework.
    slope_x = 0.86 * camera.data.sensor_width / (2 * camera.data.lens)
    return np.array([slope_x, slope_x * scene.render.resolution_y / scene.render.resolution_x])


def fit_animation_camera(papers, rotation, slopes):
    upper, lower, near_z, far_z = animation_camera_bounds(papers, rotation, slopes)
    eye_z = max(np.max((upper-lower) / (2 * slopes)), near_z + 0.001)
    x, y = (upper + lower) / 2
    target_z = (near_z + far_z) / 2
    target = rotation @ Vector((x, y, target_z))
    return target, float(eye_z-target_z), float(eye_z-near_z), float(eye_z-far_z)


def setup_final_scene(scene, papers, initial_view):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.cycles.diffuse_bounces = 2
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    scene.view_settings.view_transform = "Standard"

    rotation = paper_view_rotation(initial_view)
    camera = scene.camera
    if camera is None:
        camera = bpy.data.objects.new("折纸镜头", bpy.data.cameras.new("折纸镜头"))
        scene.collection.objects.link(camera)
        scene.camera = camera
    camera.data.type = "PERSP"
    camera.data.lens, camera.data.sensor_width = 50, 36
    camera.data.sensor_fit = "HORIZONTAL"
    slopes = camera_slopes(scene, camera)
    target, distance, nearest, farthest = fit_animation_camera(papers, rotation, slopes)
    camera.rotation_mode = "QUATERNION"
    camera.rotation_quaternion = rotation
    camera.location = target + rotation @ Vector((0, 0, distance))
    camera.data.clip_start = max(0.00001, min(0.01, nearest * 0.25))
    camera.data.clip_end = max(100, farthest * 3)

    # Keep illumination neutral so the two printed sides retain their hues.
    # Camera rays see a separate warm off-white background. The lights stay
    # outside the entire animation and can be edited like any Blender light.
    world = scene.world
    world.use_nodes = True
    tree = world.node_tree
    ambient = tree.nodes.get("Background")
    ambient.inputs["Color"].default_value = (1, 1, 1, 1)
    ambient.inputs["Strength"].default_value = 0.50
    backdrop = tree.nodes.new("ShaderNodeBackground")
    backdrop.inputs["Color"].default_value = (0.89, 0.89, 0.86, 1)
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(tree.nodes.new("ShaderNodeLightPath").outputs["Is Camera Ray"], mix.inputs[0])
    tree.links.new(ambient.outputs[0], mix.inputs[1])
    tree.links.new(backdrop.outputs[0], mix.inputs[2])
    tree.links.new(mix.outputs[0], tree.nodes.get("World Output").inputs["Surface"])
    size = max(distance * slopes[0] * 2, farthest - nearest, 0.001)
    lamp = next((obj for obj in scene.objects if obj.type == "LIGHT"), None)
    if lamp is None:
        lamp = bpy.data.objects.new("主柔光", bpy.data.lights.new("主柔光", "AREA"))
        scene.collection.objects.link(lamp)
    lamp.data.type = "AREA"
    lamp.data.shape = "DISK"
    lamp.data.size = 1.7 * size
    lamp.data.energy = 70 * size * size
    lamp.location = target + rotation @ Vector((-1.7*size, 1.9*size, 2.3*size))
    lamp.rotation_euler = (target - lamp.location).to_track_quat("-Z", "Y").to_euler()


def install_animation(scene, resources, header, end):
    start = 1
    for step, paper in zip(header["steps"], resources.papers):
        scene.collection.objects.link(paper)
        scene.timeline_markers.new(step["title"], frame=start)
        start += step["frames"] - 1 + step["hold"]
    scene.render.fps = header["fps"]
    scene.frame_start, scene.frame_end = 1, end
    scene.frame_set(1)
    setup_final_scene(scene, resources.papers, header.get("initialView"))
    bpy.context.view_layer.objects.active = resources.papers[0]
    resources.papers[0].select_set(True)


def import_snapshot(snapshot):
    # OBJ itself has no units. Current exports declare their source unit;
    # historical snapshots without that header retain Blender's existing scale.
    meters = {"mm": 0.001, "cm": 0.01, "m": 1, "in": 0.0254, "inch": 0.0254, "pt": 0.0254 / 72}
    with snapshot.open("rb") as source:
        header = source.read(512).decode("ascii", errors="ignore").splitlines()
    unit = next((line.removeprefix("# zhezhi-coordinate-unit ") for line in header
                 if line.startswith("# zhezhi-coordinate-unit ")), "")
    imported = bpy.ops.wm.obj_import(filepath=str(snapshot), global_scale=meters.get(unit, 1),
                                     forward_axis="NEGATIVE_Y", up_axis="Z")
    if "FINISHED" not in imported or not bpy.context.selected_objects:
        raise RuntimeError("Blender 未能导入折纸网格")
    paper = bpy.context.selected_objects[0]
    paper.name = "折纸工坊 · 当前折态"
    return paper


def frame_paper(paper, initial_view, animation):
    corners = [paper.matrix_world @ Vector(p) for p in paper.bound_box]
    center = sum(corners, Vector()) / len(corners)
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            view = area.spaces.active
            view.region_3d.view_location = center
            view.region_3d.view_distance = max(0.01, 3.5 * max((p-center).length for p in corners))
            if initial_view is not None:
                view.region_3d.view_rotation = paper_view_rotation(initial_view)
                view.region_3d.view_perspective = "PERSP"
            view.overlay.show_floor = False
            if animation:
                view.shading.type = "MATERIAL"


def open_once(snapshot):
    try:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete()
        if snapshot.suffix == ".zzanim":
            resources = AnimationResources()
            header, end = read_animation(snapshot, resources)
            install_animation(bpy.context.scene, resources, header, end)
            frame_paper(resources.papers[0], header.get("initialView"), True)
            open_requested_output(header, bpy.context.scene)
        else:
            frame_paper(import_snapshot(snapshot), None, False)
    finally:
        snapshot.unlink(missing_ok=True)


class LinkedStep:
    def __init__(self, folder):
        self.folder = folder
        # RNA handles can become stale after undo/redo. Blender's session IDs
        # survive renaming and undo but distinguish even identically named copies.
        self.scene_id = bpy.context.scene.session_uid
        self._scene = bpy.context.scene
        self.paper_id = None
        self._paper = None
        self.resources = None
        self.last_end = None
        self.auto_camera = None
        # Loading any file (including a Save As copy of the same scene) ends
        # this link. Save and Save As themselves keep the live object.
        bpy.app.handlers.load_pre.append(self.detach)

    def detach(self, *_):
        if self.folder.is_dir():
            (self.folder / "detached").touch()

    @property
    def scene(self):
        try:
            if self._scene and self._scene.session_uid == self.scene_id:
                return self._scene
        except ReferenceError:
            pass
        self._scene = next((s for s in bpy.data.scenes if s.session_uid == self.scene_id), None)
        return self._scene

    @property
    def paper(self):
        scene = self.scene
        if self.paper_id is not None and scene:
            try:
                if self._paper and scene.objects.get(self._paper.name) == self._paper:
                    return self._paper
            except ReferenceError:
                pass
            self._paper = next((obj for obj in scene.objects if obj.session_uid == self.paper_id), None)
            return self._paper
        return None

    def document_exists(self):
        return self.scene is not None and (self.paper_id is None or self.paper is not None)

    def camera_signature(self):
        camera = self.scene.camera
        if (not camera or camera.parent or camera.constraints or camera.animation_data
                or camera.data.animation_data or camera.rotation_mode != "QUATERNION"):
            return None
        lens, render = camera.data, self.scene.render
        return (camera.session_uid, lens.session_uid, tuple(n for row in camera.matrix_basis for n in row),
                lens.type, lens.lens, lens.sensor_fit, lens.sensor_width, lens.shift_x, lens.shift_y,
                lens.clip_start, lens.clip_end, render.resolution_x, render.resolution_y,
                render.pixel_aspect_x, render.pixel_aspect_y, render.use_border)

    def camera_extension(self, new_paper):
        if self.auto_camera is None or self.camera_signature() != self.auto_camera:
            return None
        camera = self.scene.camera
        rotation = camera.rotation_quaternion
        slopes = camera_slopes(self.scene, camera)
        upper, lower, near_z, far_z = animation_camera_bounds([new_paper], rotation, slopes, self.paper.matrix_world)
        eye = rotation.inverted() @ camera.location
        required = max(np.max((upper-eye[:2])/slopes), np.max((eye[:2]-lower)/slopes),
                       near_z + camera.data.clip_start * 2)
        # Float32 storage of the original camera transform can undershoot the
        # planned margin by a few ULPs even on a byte-identical update.
        retreat = max(0.0, float(required-eye.z))
        if retreat <= 1e-6 * max(1,abs(eye.z)):
            retreat = 0.0
        far = max(camera.data.clip_end, (eye.z+retreat-far_z)*1.01)
        if retreat or far > camera.data.clip_end:
            return camera.location + rotation @ Vector((0, 0, retreat)), far
        return None

    def apply(self, snapshot, first):
        if first != (self.paper is None):
            raise ValueError("Blender 联动步骤已失效。")
        if self.paper is not None and (self.paper.mode != "OBJECT" or bpy.app.is_job_running("RENDER")):
            raise ValueError("请先完成 Blender 中的纸面编辑或渲染，再更新此步骤。")
        resources = AnimationResources()
        try:
            header, end = read_animation(snapshot, resources, single_step=True)
            if first:
                # The host starts a dedicated process with --factory-startup.
                cube = self.scene.objects.get("Cube")
                if cube is not None:
                    bpy.data.objects.remove(cube, do_unlink=True)
                install_animation(self.scene, resources, header, end)
                frame_paper(resources.papers[0], header.get("initialView"), True)
                self._paper = resources.papers[0]
                self.paper_id = self._paper.session_uid
                self.auto_camera = self.camera_signature()
            else:
                # Prepare the entire mesh, prints and animation off-scene.
                # Swapping the data keeps object transforms, parenting,
                # collections, selection, cameras and viewports intact.
                frame = self.scene.frame_current
                subframe = self.scene.frame_subframe
                previous_mesh = self.paper.data
                previous_end = self.scene.frame_end
                extension = self.camera_extension(resources.papers[0])
                try:
                    self.paper.data = resources.papers[0].data
                    if self.scene.frame_end == self.last_end:
                        self.scene.frame_end = max(self.scene.frame_start, end)
                    current = min(max(frame, self.scene.frame_start), self.scene.frame_end)
                    self.scene.frame_set(current, subframe=subframe if current == frame else 0)
                    if extension:
                        self.scene.camera.location, self.scene.camera.data.clip_end = extension
                        self.auto_camera = self.camera_signature()
                except Exception:
                    self.paper.data = previous_mesh
                    self.scene.frame_end = previous_end
                    self.scene.frame_set(frame, subframe=subframe)
                    raise
                resources.discard_objects()
                self.resources.release_unused()
        except Exception:
            resources.discard_objects()
            resources.release_unused()
            raise
        resources.papers.clear()
        self.resources = resources
        self.last_end = end
        open_requested_output(header, self.scene)

    def poll(self):
        if not self.folder.is_dir() or (self.folder / "detached").exists() or (self.folder / "closed").exists():
            return None
        if not self.document_exists():
            self.detach()
            return None
        request = self.folder / "request.json"
        if not request.is_file():
            return 0.25
        try:
            message = json.loads(request.read_text(encoding="utf-8"))
            request_id = str(UUID(message["id"]))
            try:
                self.apply(self.folder / (request_id + ".zzanim"), message["first"])
                result = {"ok": True}
            except Exception as reason:
                result = {"ok": False, "error": "载入折纸步骤失败：" + str(reason)}
            temporary = self.folder / (request_id + ".done.tmp")
            temporary.write_text(json.dumps(result), encoding="utf-8")
            request.unlink()
            temporary.replace(self.folder / (request_id + ".done.json"))
            if self.paper is None:
                self.detach()
                return None
        except (OSError, KeyError, ValueError):
            self.detach()
            return None
        return 0.25


session_folder = os.environ.pop("ZHEZHI_BLENDER_SESSION", None)
if session_folder:
    register_render_outputs()
    linked_step = LinkedStep(Path(session_folder))
    bpy.app.timers.register(linked_step.poll, first_interval=0.1)
else:
    snapshot = Path(os.environ.pop("ZHEZHI_BLENDER_OBJ"))
    if snapshot.suffix == ".zzanim":
        register_render_outputs()
    open_once(snapshot)
