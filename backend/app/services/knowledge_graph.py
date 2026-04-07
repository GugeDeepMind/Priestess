"""Knowledge Graph — recursive fractal milestone structure.

Each node has a status (completed/in_progress/untouched) and can have
arbitrarily nested children, providing fine-grained tracking at any depth.

Storage: JSON file per user (or per conversation for Phase 6).
"""

import json
import os
from pathlib import Path
from copy import deepcopy

# Default "high school student" knowledge graph
DEFAULT_GRAPH = {
    "Mathematics": {
        "status": "in_progress",
        "children": {
            "Algebra": {
                "status": "completed",
                "children": {
                    "Linear equations": {"status": "completed", "children": {}},
                    "Quadratic equations": {"status": "completed", "children": {}},
                    "Polynomials": {"status": "completed", "children": {}},
                }
            },
            "Geometry": {
                "status": "completed",
                "children": {
                    "Triangles & circles": {"status": "completed", "children": {}},
                    "Coordinate geometry": {"status": "completed", "children": {}},
                }
            },
            "Trigonometry": {
                "status": "in_progress",
                "children": {
                    "Basic trig functions": {"status": "completed", "children": {}},
                    "Trig identities": {"status": "in_progress", "children": {}},
                    "Inverse trig": {"status": "untouched", "children": {}},
                }
            },
            "Calculus": {
                "status": "untouched",
                "children": {}
            },
            "Linear Algebra": {
                "status": "untouched",
                "children": {}
            },
        }
    },
    "Physics": {
        "status": "in_progress",
        "children": {
            "Classical Mechanics": {
                "status": "in_progress",
                "children": {
                    "Newton's Laws": {"status": "completed", "children": {}},
                    "Energy & Work": {"status": "in_progress", "children": {}},
                    "Momentum": {"status": "untouched", "children": {}},
                }
            },
            "Thermodynamics": {
                "status": "untouched",
                "children": {}
            },
            "Fluid Mechanics": {
                "status": "untouched",
                "children": {}
            },
        }
    },
}

STORAGE_DIR = Path("data/knowledge_graphs")


class KnowledgeGraph:
    """Manages a user's knowledge graph."""

    def __init__(self, user_id: str = "default"):
        self.user_id = user_id
        self._ensure_storage()

    def _ensure_storage(self):
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    def _file_path(self) -> Path:
        return STORAGE_DIR / f"{self.user_id}.json"

    def get(self) -> dict:
        """Get the user's knowledge graph. Creates default if none exists."""
        path = self._file_path()
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return deepcopy(DEFAULT_GRAPH)

    def save(self, graph: dict):
        """Save the entire knowledge graph."""
        with open(self._file_path(), "w", encoding="utf-8") as f:
            json.dump(graph, f, ensure_ascii=False, indent=2)

    def reset_to_default(self):
        """Reset to the default high school student graph."""
        self.save(deepcopy(DEFAULT_GRAPH))

    def update_node(self, path: list[str], status: str | None = None,
                    new_children: dict | None = None):
        """Update a node at the given path.

        path: ["Mathematics", "Calculus", "Limits"] — nested keys
        status: new status string, or None to keep existing
        new_children: dict of children to add/merge, or None
        """
        graph = self.get()
        node = graph
        for key in path:
            if key in node:
                node = node[key]
            elif "children" in node and key in node["children"]:
                node = node["children"][key]
            else:
                # Path doesn't exist — create it
                if "children" not in node:
                    node["children"] = {}
                node["children"][key] = {"status": "untouched", "children": {}}
                node = node["children"][key]

        if status:
            node["status"] = status
        if new_children:
            if "children" not in node:
                node["children"] = {}
            for k, v in new_children.items():
                if k not in node["children"]:
                    node["children"][k] = v

        self.save(graph)

    def expand_node(self, path: list[str], children: dict[str, str]):
        """Expand a node by adding children with given statuses.

        children: {"Limits": "untouched", "Derivatives": "untouched"}
        """
        new_children = {
            name: {"status": status, "children": {}}
            for name, status in children.items()
        }
        self.update_node(path, new_children=new_children)

    def to_context_string(self) -> str:
        """Convert graph to a readable string for including in AI context."""
        graph = self.get()
        lines = ["Student's Knowledge Graph:"]
        self._format_node(graph, lines, indent=0)
        return "\n".join(lines)

    def _format_node(self, node: dict, lines: list[str], indent: int):
        for key, value in node.items():
            if not isinstance(value, dict) or "status" not in value:
                continue
            status_icon = {
                "completed": "[done]",
                "in_progress": "[learning]",
                "untouched": "[not started]",
            }.get(value.get("status", ""), "[?]")
            lines.append(f"{'  ' * indent}{status_icon} {key}")
            if value.get("children"):
                self._format_node(value["children"], lines, indent + 1)
