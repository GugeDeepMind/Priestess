"""Base provider — the contract all AI providers must implement."""

from abc import ABC, abstractmethod
from typing import AsyncIterator


class BaseProvider(ABC):

    @abstractmethod
    async def generate(self, messages: list[dict], system_prompt: str = "") -> str:
        """Send messages, return complete response text."""

    @abstractmethod
    async def stream(self, messages: list[dict], system_prompt: str = "") -> AsyncIterator[str]:
        """Send messages, yield response text chunks."""

    @abstractmethod
    def model_name(self) -> str:
        """Return the model identifier string."""
