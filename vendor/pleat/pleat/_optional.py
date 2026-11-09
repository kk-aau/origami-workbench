"""Load visualization dependencies only when a visualization is requested."""

from importlib import import_module


def require_matplotlib(submodule: str = ""):
    name = "matplotlib" + (f".{submodule}" if submodule else "")
    try:
        return import_module(name)
    except ImportError as exc:
        raise ImportError(
            "This Pleat visualization requires the optional Matplotlib/Pillow "
            "dependencies. Install them to use plotting; geometry and JSON "
            "generation do not require them."
        ) from exc
