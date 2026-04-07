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

    async def generate(self, messages: list[dict], system_prompt: str = "") -> str:
        msgs = list(messages)
        if system_prompt:
            msgs.insert(0, {"role": "system", "content": system_prompt})
        response = await self.client.chat.completions.create(
            model=self.model, messages=msgs,
        )
        return response.choices[0].message.content

    async def stream(self, messages: list[dict], system_prompt: str = "") -> AsyncIterator[str]:
        msgs = list(messages)
        if system_prompt:
            msgs.insert(0, {"role": "system", "content": system_prompt})
        response = await self.client.chat.completions.create(
            model=self.model, messages=msgs, stream=True,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    def model_name(self) -> str:
        return self.model
