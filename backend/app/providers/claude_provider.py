"""Claude API provider using the Anthropic SDK."""

from typing import AsyncIterator

import anthropic

from app.providers.base import BaseProvider

_THINKING_BUDGET = {"low": 2048, "medium": 8192, "high": 32768}


class ClaudeProvider(BaseProvider):

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    def _apply_settings(self, kwargs: dict, settings: dict | None):
        if not settings:
            return
        if settings.get("temperature") is not None:
            kwargs["temperature"] = settings["temperature"]
        if settings.get("max_tokens") is not None:
            kwargs["max_tokens"] = settings["max_tokens"]
        thinking = settings.get("thinking")
        if thinking and thinking != "none":
            budget = _THINKING_BUDGET.get(thinking, 8192)
            kwargs["thinking"] = {"type": "enabled", "budget_tokens": budget}
            # max_tokens must exceed budget_tokens
            if kwargs.get("max_tokens", 4096) <= budget:
                kwargs["max_tokens"] = budget + 1024

    async def generate(self, messages: list[dict], system_prompt: str = "",
                       settings: dict | None = None) -> str:
        kwargs = {"model": self.model, "max_tokens": 4096, "messages": messages}
        if system_prompt:
            kwargs["system"] = system_prompt
        self._apply_settings(kwargs, settings)
        response = await self.client.messages.create(**kwargs)
        return response.content[0].text

    async def stream(self, messages: list[dict], system_prompt: str = "",
                     settings: dict | None = None) -> AsyncIterator[str]:
        kwargs = {"model": self.model, "max_tokens": 4096, "messages": messages}
        if system_prompt:
            kwargs["system"] = system_prompt
        self._apply_settings(kwargs, settings)
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    def model_name(self) -> str:
        return self.model
