import os
import tempfile
from pathlib import Path

import bpy
from bpy.props import EnumProperty, IntProperty, StringProperty
from bpy_extras.io_utils import ExportHelper


class _PaperRenderJob:
    """Use Blender's renderer and cancel operation; publish only a complete file."""

    def __init__(self, scene, destination, kind, frame):
        self.scene = None
        self.outcome = None
        self.destination = destination
        self.kind = kind
        self.folder = tempfile.TemporaryDirectory(prefix=".zhezhi-render-", dir=destination.parent)
        try:
            self.scene = scene.copy()
            self.scene.name = "折纸 · 输出"
            render = self.scene.render
            render.filepath = str(Path(self.folder.name) / ("paper." + kind))
            render.use_file_extension = True
            render.use_multiview = False
            render.save_output = True
            image = render.image_settings
            if hasattr(image, "media_type"):
                image.media_type = "VIDEO" if kind == "mp4" else "IMAGE"
            if kind == "mp4":
                image.file_format = "FFMPEG"
                render.ffmpeg.format = "MPEG4"
                render.ffmpeg.codec = "H264"
                render.ffmpeg.constant_rate_factor = "HIGH"
                render.ffmpeg.use_autosplit = False
            else:
                image.file_format = "PNG"
                if render.film_transparent:
                    image.color_mode = "RGBA"
                if frame is not None:
                    self.scene.frame_set(min(max(frame, self.scene.frame_start), self.scene.frame_end))
        except Exception:
            self.cleanup()
            raise

    def complete(self, scene, *_):
        if self.scene == scene:
            self.outcome = "complete"

    def cancel(self, scene, *_):
        if self.scene == scene:
            self.outcome = "cancel"

    def cleanup(self):
        for handlers, callback in ((bpy.app.handlers.render_complete, self.complete),
                                   (bpy.app.handlers.render_cancel, self.cancel)):
            if callback in handlers:
                handlers.remove(callback)
        if self.scene is not None:
            bpy.data.scenes.remove(self.scene)
            self.scene = None
        self.folder.cleanup()

    def finish(self):
        try:
            if self.outcome != "complete":
                return False
            # Blender can include a frame range in video filenames.
            files = list(Path(self.folder.name).glob("*." + self.kind))
            if len(files) != 1 or files[0].stat().st_size == 0:
                raise RuntimeError("Blender 没有生成完整的输出文件。")
            os.replace(files[0], self.destination)
            return True
        finally:
            self.cleanup()


_paper_render_job = None


def _paper_render_notice(message, error=False):
    if bpy.app.background:
        print(message, flush=True)
    else:
        bpy.context.window_manager.popup_menu(
            lambda self, _ctx: self.layout.label(text=message),
            title="折纸最终渲染", icon="ERROR" if error else "INFO")


def _finish_paper_render():
    global _paper_render_job
    job = _paper_render_job
    if bpy.app.is_job_running("RENDER"):
        return 0.25
    # Render handlers fire before the native renderer closes its movie stream.
    # Only the main-thread timer may publish the file and free the scene.
    try:
        if job.finish():
            _paper_render_notice("已保存 " + str(job.destination))
        elif job.outcome != "cancel":
            _paper_render_notice("渲染未完成，请检查 Blender 的渲染报告。", True)
    except Exception as error:
        _paper_render_notice(str(error), True)
    finally:
        _paper_render_job = None
    return None


class RENDER_OT_zhezhi_output(bpy.types.Operator, ExportHelper):
    bl_idname = "render.zhezhi_output"
    bl_label = "折纸最终渲染"
    kind: EnumProperty(items=[("png", "当前帧 PNG", ""), ("mp4", "动画 MP4", "")], options={"HIDDEN"})
    requested_frame: IntProperty(default=0, options={"HIDDEN", "SKIP_SAVE"})
    filter_glob: StringProperty(options={"HIDDEN"})

    @property
    def filename_ext(self):
        return "." + self.kind

    @classmethod
    def poll(cls, context):
        return context.scene and context.scene.camera and not _paper_render_job and not bpy.app.is_job_running("RENDER")

    def invoke(self, context, event):
        self._source_scene_uid = context.scene.session_uid
        self.filter_glob = "*" + self.filename_ext
        base = Path(bpy.data.filepath) if bpy.data.filepath else Path("折纸")
        frame = self.requested_frame or context.scene.frame_current
        name = base.stem + (f" - 第 {frame} 帧" if self.kind == "png" else " - 动画") + self.filename_ext
        self.filepath = str(base.parent / name)
        return ExportHelper.invoke(self, context, event)

    def execute(self, context):
        global _paper_render_job
        if _paper_render_job is not None:
            self.report({"ERROR"}, "已有渲染正在进行。")
            return {"CANCELLED"}
        target = Path(bpy.path.abspath(bpy.path.ensure_ext(self.filepath, self.filename_ext)))
        if not target.is_absolute() or not target.parent.is_dir():
            self.report({"ERROR"}, "请选择有效的输出目录。")
            return {"CANCELLED"}
        try:
            source = context.scene
            scene_id = getattr(self, "_source_scene_uid", source.session_uid)
            if source.session_uid != scene_id:
                source = next((s for s in bpy.data.scenes if s.session_uid == scene_id), None)
                if source is None:
                    raise RuntimeError("选择的折纸场景已关闭。")
            job = _PaperRenderJob(source, target, self.kind, self.requested_frame or None)
            _paper_render_job = job
            bpy.app.handlers.render_complete.append(job.complete)
            bpy.app.handlers.render_cancel.append(job.cancel)
            result = bpy.ops.render.render("EXEC_DEFAULT" if bpy.app.background else "INVOKE_DEFAULT",
                                           scene=job.scene.name, animation=self.kind == "mp4", write_still=self.kind == "png")
            if bpy.app.background:
                _paper_render_job = None
                if not job.finish():
                    return {"CANCELLED"}
            elif "CANCELLED" in result:
                job.cleanup()
                _paper_render_job = None
                return {"CANCELLED"}
            else:
                bpy.app.timers.register(_finish_paper_render, first_interval=0.25)
        except Exception as error:
            if _paper_render_job:
                _paper_render_job.cleanup()
                _paper_render_job = None
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        return {"FINISHED"}


def _paper_render_menu(self, context):
    self.layout.separator()
    for kind, label in (("png", "折纸 · 当前帧 PNG…"), ("mp4", "折纸 · 动画 MP4…")):
        self.layout.operator(RENDER_OT_zhezhi_output.bl_idname, text=label).kind = kind


def register_render_outputs():
    bpy.utils.register_class(RENDER_OT_zhezhi_output)
    bpy.types.TOPBAR_MT_render.append(_paper_render_menu)


def request_render_output(kind, frame=None, scene=None):
    """Open a native file selector after import, once the main window is ready."""
    if kind not in ("png", "mp4"):
        raise ValueError("未知的渲染格式。")
    scene = bpy.context.scene if scene is None else scene
    scene_id, scene_name = scene.session_uid, scene.name

    def show():
        for window in bpy.context.window_manager.windows:
            if window.scene.session_uid != scene_id:
                continue
            for area in window.screen.areas:
                if area.type != "VIEW_3D":
                    continue
                region = next((r for r in area.regions if r.type == "WINDOW"), None)
                if region is None:
                    continue
                with bpy.context.temp_override(window=window, area=area, region=region):
                    if bpy.ops.render.zhezhi_output.poll():
                        bpy.ops.render.zhezhi_output("INVOKE_DEFAULT", kind=kind, requested_frame=frame or 0)
                    else:
                        _paper_render_notice("请先结束当前渲染，并确认场景已设置相机。", True)
                return None
        _paper_render_notice(f"请在三维视图中打开联动场景「{scene_name}」，再从顶栏「渲染」菜单选择折纸输出。", True)
        return None

    bpy.app.timers.register(show, first_interval=0.15)
