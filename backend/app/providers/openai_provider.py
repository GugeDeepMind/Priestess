"""OpenAI API provider."""

from typing import AsyncIterator

from openai import AsyncOpenAI

from app.providers.base import BaseProvider


class OpenAIProvider(BaseProvider):

    def __init__(self, api_key: str, model: str = "gpt-4o", base_url: str | None = None):
        kwargs = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self.client = AsyncOpenAI(**kwargs)
        self.model = model

    async def generate(self, messages: list[dict], system_prompt: str = "",
                       settings: dict | None = None) -> str:
        msgs = list(messages)
        if system_prompt:
            msgs.insert(0, {"role": "system", "content": system_prompt})
        kwargs = {"model": self.model, "messages": msgs}
        if settings:
            if settings.get("temperature") is not None:
                kwargs["temperature"] = settings["temperature"]
            if settings.get("max_tokens") is not None:
                kwargs["max_tokens"] = settings["max_tokens"]
            thinking = settings.get("thinking")
            if thinking and thinking != "none":
                kwargs["reasoning_effort"] = thinking
        response = await self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    async def stream(self, messages: list[dict], system_prompt: str = "",
                     settings: dict | None = None) -> AsyncIterator[str]:
        msgs = list(messages)
        if system_prompt:
            msgs.insert(0, {"role": "system", "content": system_prompt})
        kwargs = {"model": self.model, "messages": msgs, "stream": True}
        if settings:
            if settings.get("temperature") is not None:
                kwargs["temperature"] = settings["temperature"]
            if settings.get("max_tokens") is not None:
                kwargs["max_tokens"] = settings["max_tokens"]
            thinking = settings.get("thinking")
            if thinking and thinking != "none":
                kwargs["reasoning_effort"] = thinking
        response = await self.client.chat.completions.create(**kwargs)
        async for chunk in response:
            delta = chunk.choices[0].delta
            # Thinking/reasoning content (for thinking models)
            reasoning = getattr(delta, 'reasoning_content', None) or getattr(delta, 'reasoning', None)
            if reasoning:
                yield f"\x00THINKING\x00{reasoning}"
            if delta.content:
                yield delta.content

    def model_name(self) -> str:
        return self.model
