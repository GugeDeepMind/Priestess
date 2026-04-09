"""Base agent — a persona (system prompt) paired with a provider."""

from typing import AsyncIterator

from app.providers.base import BaseProvider


class BaseAgent:
    name: str = "base"
    description: str = ""
    system_prompt: str = ""

    def __init__(self, provider: BaseProvider):
        self.provider = provider

    async def respond(self, context: list[dict], settings: dict | None = None,
                      system_prompt_override: str | None = None) -> str:
        prompt = self.system_prompt
        ctx = list(context)

        # If user provided custom [REDACTED], inject it as first user message instead of system role
        if system_prompt_override:
            ctx.insert(0, {"role": "user", "content": system_prompt_override})

        return await self.provider.generate(ctx, prompt, settings=settings)

    async def stream_response(self, context: list[dict], settings: dict | None = None,
                               system_prompt_override: str | None = None) -> AsyncIterator[str]:
        prompt = self.system_prompt
        ctx = list(context)

        # If user provided custom [REDACTED], inject it as first user message instead of system role
        if system_prompt_override:
            ctx.insert(0, {"role": "user", "content": system_prompt_override})

        async for chunk in self.provider.stream(ctx, prompt, settings=settings):
            yield chunk

    def get_model_name(self) -> str:
        return self.provider.model_name()
