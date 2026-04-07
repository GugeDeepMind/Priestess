"""Base agent — a persona (system prompt) paired with a provider."""

from typing import AsyncIterator

from app.providers.base import BaseProvider


class BaseAgent:
    name: str = "base"
    description: str = ""
    system_prompt: str = ""

    def __init__(self, provider: BaseProvider):
        self.provider = provider

    async def respond(self, context: list[dict]) -> str:
        return await self.provider.generate(context, self.system_prompt)

    async def stream_response(self, context: list[dict]) -> AsyncIterator[str]:
        async for chunk in self.provider.stream(context, self.system_prompt):
            yield chunk

    def get_model_name(self) -> str:
        return self.provider.model_name()
