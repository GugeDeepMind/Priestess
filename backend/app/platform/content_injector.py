"""Content Injector — converts agent outputs into SSE-compatible events.

Different agents produce different types of content:
- Text agents → plain text chunks
- Chart agents → base64 images
- Project agents → UI component descriptors
- etc.

The injector normalizes these into a standard event format
that the frontend can render.
"""

import base64
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class InjectedContent:
    """A piece of content to inject into the stream."""
    type: str           # "text", "image", "ui", "code", "file"
    data: dict          # type-specific payload

    def to_sse_event(self) -> dict:
        """Convert to a dict suitable for SSE transmission."""
        return {"type": self.type, **self.data}


class ContentInjector:
    """Creates InjectedContent from various agent outputs."""

    @staticmethod
    def text(content: str) -> InjectedContent:
        return InjectedContent(type="text", data={"content": content})

    @staticmethod
    def image_from_bytes(image_bytes: bytes, format: str = "png",
                         caption: str = "") -> InjectedContent:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        return InjectedContent(
            type="image",
            data={
                "data": b64,
                "format": format,
                "caption": caption,
            },
        )

    @staticmethod
    def image_from_file(file_path: str | Path, caption: str = "") -> InjectedContent:
        path = Path(file_path)
        suffix = path.suffix.lstrip(".").lower()
        format_map = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "svg": "svg+xml"}
        fmt = format_map.get(suffix, "png")
        image_bytes = path.read_bytes()
        return ContentInjector.image_from_bytes(image_bytes, fmt, caption)

    @staticmethod
    def ui_component(component_name: str, props: dict | None = None) -> InjectedContent:
        """Inject a UI component (e.g., a button, interactive widget)."""
        return InjectedContent(
            type="ui",
            data={
                "component": component_name,
                "props": props or {},
            },
        )

    @staticmethod
    def code_block(code: str, language: str = "python",
                   executable: bool = False) -> InjectedContent:
        return InjectedContent(
            type="code",
            data={
                "code": code,
                "language": language,
                "executable": executable,
            },
        )

    @staticmethod
    def project_link(project_path: str, title: str = "",
                     description: str = "") -> InjectedContent:
        """Inject a link/button to open a generated project."""
        return InjectedContent(
            type="ui",
            data={
                "component": "ProjectLink",
                "props": {
                    "path": project_path,
                    "title": title,
                    "description": description,
                },
            },
        )

    @staticmethod
    def review_mark(section_text: str, review_notes: str,
                    severity: str = "info") -> InjectedContent:
        """Inject a review mark from the teaching reviewer agent."""
        return InjectedContent(
            type="ui",
            data={
                "component": "ReviewMark",
                "props": {
                    "section_text": section_text,
                    "review_notes": review_notes,
                    "severity": severity,  # "info", "warning", "expand"
                },
            },
        )

    @staticmethod
    def branch_suggestions(suggestions: list[dict]) -> InjectedContent:
        """Inject end-of-conversation branch suggestions.

        Each suggestion: {"title": "...", "description": "..."}
        """
        return InjectedContent(
            type="ui",
            data={
                "component": "BranchSuggestions",
                "props": {"suggestions": suggestions},
            },
        )
