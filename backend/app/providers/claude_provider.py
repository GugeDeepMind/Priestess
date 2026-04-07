"""Claude API provider using the Anthropic SDK."""

from typing import AsyncIterator

import anthropic

from app.providers.base import BaseProvider


class ClaudeProvider(BaseProvider):

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def generate(self, messages: list[dict], system_prompt: str = "") -> str:
        kwargs = {"model": self.model, "max_tokens": 4096, "messages": messages}
        if system_prompt:
            kwargs["system"] = system_prompt
        response = await self.client.messages.create(**kwargs)
        return response.content[0].text

    async def stream(self, messages: list[dict], system_prompt: str = "") -> AsyncIterator[str]:
        kwargs = {"model": self.model, "max_tokens": 4096, "messages": messages}
        if system_prompt:
            kwargs["system"] = system_prompt
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    def model_name(self) -> str:
        return self.model
