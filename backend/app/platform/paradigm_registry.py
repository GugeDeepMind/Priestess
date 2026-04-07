"""Paradigm Registry — discovers and loads paradigm plugins from the paradigms/ directory.

Paradigm plugins are Python packages under paradigms/ that:
1. Have a paradigm.py file
2. Contain a class that inherits from BaseParadigm
"""

import importlib
import pkgutil
from pathlib import Path

from app.paradigm_base import BaseParadigm


class ParadigmRegistry:

    def __init__(self):
        self._paradigms: dict[str, type[BaseParadigm]] = {}

    def register(self, paradigm_class: type[BaseParadigm]):
        """Manually register a paradigm class."""
        self._paradigms[paradigm_class.name] = paradigm_class

    def discover(self, paradigms_package: str = "paradigms"):
        """Auto-discover paradigm plugins by scanning the paradigms/ directory."""
        try:
            package = importlib.import_module(paradigms_package)
        except ImportError:
            return

        package_path = Path(package.__file__).parent if package.__file__ else None
        if not package_path:
            return

        for item in package_path.iterdir():
            if not item.is_dir() or item.name.startswith("_"):
                continue
            paradigm_module_path = item / "paradigm.py"
            if not paradigm_module_path.exists():
                continue

            module_name = f"{paradigms_package}.{item.name}.paradigm"
            try:
                module = importlib.import_module(module_name)
            except ImportError as e:
                print(f"Warning: Failed to import paradigm '{item.name}': {e}")
                continue

            # Find BaseParadigm subclasses in the module
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, BaseParadigm)
                    and attr is not BaseParadigm
                ):
                    self._paradigms[attr.name] = attr

    def get(self, name: str) -> type[BaseParadigm] | None:
        return self._paradigms.get(name)

    def list_all(self) -> list[dict]:
        """Return info about all registered paradigms."""
        return [
            {
                "name": cls.name,
                "description": cls.description,
                "icon": cls.icon,
            }
            for cls in self._paradigms.values()
        ]


# Singleton
paradigm_registry = ParadigmRegistry()
