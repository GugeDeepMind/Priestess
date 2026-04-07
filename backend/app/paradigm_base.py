"""Base paradigm — the contract for paradigm plugins.

A paradigm defines:
- Which agents exist and how they collaborate
- Which agents monitor the main agent's output
- How to handle a user message
- What frontend components are needed
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator

from app.agent_base import BaseAgent
from app.platform.tree_engine import TreeEngine


class BaseParadigm(ABC):
    name: str = "base"
    description: str = ""
    icon: str = ""  # Path to icon image for paradigm selection screen

    @abstractmethod
    def register_agents(self) -> dict[str, BaseAgent]:
        """Return a dict of agent_name -> BaseAgent instances."""

    def register_monitors(self) -> list[BaseAgent]:
        """Return agents that run in parallel to monitor the main agent output.
        Override this to add parallel monitoring agents (e.g., teaching reviewer).
        """
        return []

    @abstractmethod
    async def on_user_message(
        self,
        user_content: str,
        context: list[dict],
        tree_engine: TreeEngine,
        db,
        conversation_id: str,
        parent_id: str | None,
    ) -> AsyncIterator[dict]:
        """Handle a user message and yield stream events.

        Each event is a dict with at least a "type" field:
          {"type": "text", "content": "..."} — text chunk
          {"type": "image", "data": "base64...", "format": "png"} — inline image
          {"type": "ui", "component": "...", "props": {...}} — UI component
          {"type": "done", "message_id": "..."} — stream complete
        """

    def get_frontend_manifest(self) -> dict:
        """Declare frontend component requirements for this paradigm.
        Override to request specific UI components.
        """
        return {"components": []}
