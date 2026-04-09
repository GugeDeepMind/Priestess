"""Ollama local model provider via HTTP API."""

from typing import AsyncIterator
import json

import httpx

from app.providers.base import BaseProvider


class OllamaProvider(BaseProvider):

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3"):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def generate(self, messages: list[dict], system_prompt: str = "",
                       settings: dict | None = None) -> str:
        msgs = list(messages)
        if system_prompt:
            msgs.insert(0, {"role": "system", "content": system_prompt})
        body: dict = {"model": self.model, "messages": msgs, "stream": False}
        options = {}
        if settings:
            if settings.get("temperature") is not None:
                options["temperature"] = settings["temperature"]
            if settings.get("max_tokens") is not None:
                options["num_predict"] = settings["max_tokens"]
        if options:
            body["options"] = options
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json=body,
                timeout=120,
            )
            response.raise_for_status()
            return response.json()["message"]["content"]

    async def stream(self, messages: list[dict], system_prompt: str = "",
                     settings: dict | None = None) -> AsyncIterator[str]:
        msgs = list(messages)
        if system_prompt:
            msgs.insert(0, {"role": "system", "content": system_prompt})
        body: dict = {"model": self.model, "messages": msgs, "stream": True}
        options = {}
        if settings:
            if settings.get("temperature") is not None:
                options["temperature"] = settings["temperature"]
            if settings.get("max_tokens") is not None:
                options["num_predict"] = settings["max_tokens"]
        if options:
            body["options"] = options
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json=body,
                timeout=120,
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        data = json.loads(line)
                        if content := data.get("message", {}).get("content"):
                            yield content

    def model_name(self) -> str:
        return self.model
