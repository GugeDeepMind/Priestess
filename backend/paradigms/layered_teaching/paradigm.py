"""Layered Teaching Paradigm — full implementation with streaming interleave.

Agents:
  - main_teacher — streams teaching content
  - chart — sync injection, generates matplotlib charts
  - project cluster — async background, builds runnable projects
"""

import asyncio
import json
from typing import AsyncIterator

from app.agent_base import BaseAgent
from app.paradigm_base import BaseParadigm
from app.platform.tree_engine import TreeEngine
from app.platform.stream_pipeline import StreamPipeline, StreamEvent
from app.platform.content_injector import ContentInjector
from app.providers.base import BaseProvider
from paradigms.layered_teaching.agents.main_teacher import MainTeacherAgent
from paradigms.layered_teaching.agents.chart_agent import ChartAgent
from paradigms.layered_teaching.agents.project_cluster.cluster import ProjectCluster


class LayeredTeachingParadigm(BaseParadigm):
    name = "layered_teaching"
    description = "Multi-agent teaching with streaming interleave"
    icon = ""

    def __init__(self, provider: BaseProvider):
        self.provider = provider

        self.teacher = MainTeacherAgent(provider)

        # Helper agents
        self.chart = ChartAgent(provider)
        self.project_cluster = ProjectCluster(provider)

        self._agents = {
            "main_teacher": self.teacher,
            "chart": self.chart,
        }

    def register_agents(self) -> dict[str, BaseAgent]:
        return self._agents

    def register_monitors(self) -> list[BaseAgent]:
        return []

    async def _handle_sync_call(self, agent_name: str,
                                instruction: str) -> list[StreamEvent]:
        if agent_name == "chart":
            return await self._handle_chart_call(instruction)

        agent = self._agents.get(agent_name)
        if not agent:
            return [StreamEvent(
                type="error",
                agent_name=agent_name,
                content=f"Unknown agent: {agent_name}",
            )]

        result = await agent.respond([{"role": "user", "content": instruction}])
        injected = ContentInjector.text(f"\n\n> **{agent_name}**: {result}\n\n")
        return [StreamEvent(
            type="call_result",
            agent_name=agent_name,
            content=result,
            data=injected.to_sse_event(),
        )]

    async def _handle_chart_call(self, instruction: str) -> list[StreamEvent]:
        png_bytes, caption = await self.chart.generate_chart(instruction)

        if png_bytes is None:
            return [StreamEvent(
                type="call_result",
                agent_name="chart",
                content=f"\n\n> [Chart generation failed: {caption}]\n\n",
                data=ContentInjector.text(
                    f"\n\n> [Chart generation failed: {caption}]\n\n"
                ).to_sse_event(),
            )]

        injected = ContentInjector.image_from_bytes(png_bytes, "png", caption)
        return [StreamEvent(
            type="call_result",
            agent_name="chart",
            content="",
            data=injected.to_sse_event(),
        )]

    async def _handle_async_call(self, agent_name: str, instruction: str):
        if agent_name == "project":
            result = await self.project_cluster.build_project(instruction)
            print(f"[Project Complete] {json.dumps(result, indent=2, default=str)}")
            return result
        else:
            print(f"[ASYNC] Unknown agent: {agent_name}")

    async def on_user_message(
        self,
        user_content: str,
        context: list[dict],
        tree_engine: TreeEngine,
        db,
        conversation_id: str,
        parent_id: str | None,
        settings: dict | None = None,
        attachments: list | None = None,
        system_prompt: str | None = None,
    ) -> AsyncIterator[dict]:
        # Save user message
        user_msg = tree_engine.create_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=user_content,
            parent_id=parent_id,
        )

        # Build context from tree path
        ctx = tree_engine.get_context_dicts(db, user_msg.id)

        # Knowledge graph disabled — pass context through directly
        ctx_with_kg = list(ctx)

        # If attachments present, convert last user message to multimodal format
        if attachments:
            import base64
            for i in range(len(ctx_with_kg) - 1, -1, -1):
                if ctx_with_kg[i].get("role") == "user":
                    content_parts = [{"type": "text", "text": ctx_with_kg[i]["content"]}]
                    for att in attachments:
                        if att.get("type") == "image":
                            content_parts.append({
                                "type": "image_url",
                                "image_url": {"url": f"data:{att['media_type']};base64,{att['data']}"}
                            })
                        elif att.get("type") == "document":
                            try:
                                text = base64.b64decode(att["data"]).decode("utf-8", errors="replace")
                                content_parts.append({
                                    "type": "text",
                                    "text": f"\n[Attached: {att.get('filename', 'file')}]\n{text}"
                                })
                            except Exception:
                                pass
                    ctx_with_kg[i]["content"] = content_parts
                    break

        # Create stream pipeline
        pipeline = StreamPipeline(
            call_handler=self._handle_sync_call,
            async_call_handler=self._handle_async_call,
        )

        # Stream from active teacher through the pipeline
        full_response_parts = []
        pending_images = []  # collect image data during stream, persist after assistant msg
        raw_stream = self.teacher.stream_response(
            ctx_with_kg, settings=settings, system_prompt_override=system_prompt,
        )

        # Wrap stream to separate thinking markers from content
        THINKING_MARKER = "\x00THINKING\x00"

        async def filtered_stream():
            async for chunk in raw_stream:
                if THINKING_MARKER in chunk:
                    # This chunk is thinking content — yield as-is (with marker)
                    yield chunk
                else:
                    yield chunk

        async for event in pipeline.process(filtered_stream()):
            if event.type == "text":
                # Check if text contains thinking markers
                content = event.content
                if THINKING_MARKER in content:
                    parts = content.split(THINKING_MARKER)
                    for i, part in enumerate(parts):
                        if i == 0 and part:
                            # Regular text before first marker
                            full_response_parts.append(part)
                            yield {"type": "text", "content": part}
                        elif i > 0 and part:
                            # Thinking content (after marker)
                            yield {"type": "thinking", "content": part}
                else:
                    full_response_parts.append(content)
                    yield {"type": "text", "content": content}

            elif event.type == "call_start":
                yield {
                    "type": "call_start",
                    "agent_name": event.agent_name,
                    "call_type": event.call_type,
                    "instruction": event.content,
                }

            elif event.type == "call_result":
                if event.data.get("type") == "image":
                    # Collect image for saving after assistant msg is created
                    pending_images.append({
                        "data": event.data.get("data", ""),
                        "format": event.data.get("format", "png"),
                        "caption": event.data.get("caption", ""),
                    })
                    yield event.data
                else:
                    text_content = event.data.get("content", event.content or "")
                    if text_content:
                        full_response_parts.append(text_content)
                    yield event.data

            elif event.type == "async_started":
                # Async tasks run silently in background — don't report to frontend
                pass

            elif event.type == "error":
                yield {
                    "type": "error",
                    "agent_name": event.agent_name,
                    "content": event.content,
                }

        # Save complete assistant message
        full_text = "".join(full_response_parts)
        assistant_msg = tree_engine.create_message(
            db=db,
            conversation_id=conversation_id,
            role="assistant",
            content=full_text,
            parent_id=user_msg.id,
            agent_name=self.teacher.name,
            model_used=self.teacher.get_model_name(),
        )

        # Persist pending images as children of assistant message
        import json as json_mod
        for img in pending_images:
            try:
                tree_engine.create_message(
                    db=db,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=json_mod.dumps(img),
                    parent_id=assistant_msg.id,
                    agent_name="chart",
                    content_type="image",
                )
            except Exception:
                pass  # image save failure is non-critical

        yield {
            "type": "done",
            "message_id": assistant_msg.id,
            "user_message_id": user_msg.id,
        }

    async def on_regenerate(
        self,
        user_message_id: str,
        tree_engine: TreeEngine,
        db,
        conversation_id: str,
        settings: dict | None = None,
        system_prompt: str | None = None,
    ) -> AsyncIterator[dict]:
        """Regenerate: create a new assistant response under the existing user message."""
        # Build context from the existing user message (tree path up to it)
        ctx = tree_engine.get_context_dicts(db, user_message_id)

        # Create stream pipeline
        pipeline = StreamPipeline(
            call_handler=self._handle_sync_call,
            async_call_handler=self._handle_async_call,
        )

        full_response_parts = []
        pending_images = []
        raw_stream = self.teacher.stream_response(
            ctx, settings=settings, system_prompt_override=system_prompt,
        )

        THINKING_MARKER = "\x00THINKING\x00"

        async def filtered_stream():
            async for chunk in raw_stream:
                yield chunk

        async for event in pipeline.process(filtered_stream()):
            if event.type == "text":
                content = event.content
                if THINKING_MARKER in content:
                    parts = content.split(THINKING_MARKER)
                    for i, part in enumerate(parts):
                        if i == 0 and part:
                            full_response_parts.append(part)
                            yield {"type": "text", "content": part}
                        elif i > 0 and part:
                            yield {"type": "thinking", "content": part}
                else:
                    full_response_parts.append(content)
                    yield {"type": "text", "content": content}

            elif event.type == "call_start":
                yield {
                    "type": "call_start",
                    "agent_name": event.agent_name,
                    "call_type": event.call_type,
                    "instruction": event.content,
                }

            elif event.type == "call_result":
                if event.data.get("type") == "image":
                    pending_images.append({
                        "data": event.data.get("data", ""),
                        "format": event.data.get("format", "png"),
                        "caption": event.data.get("caption", ""),
                    })
                    yield event.data
                else:
                    text_content = event.data.get("content", event.content or "")
                    if text_content:
                        full_response_parts.append(text_content)
                    yield event.data

            elif event.type == "error":
                yield {
                    "type": "error",
                    "agent_name": event.agent_name,
                    "content": event.content,
                }

        # Save new assistant message as child of the existing user message
        full_text = "".join(full_response_parts)
        assistant_msg = tree_engine.create_message(
            db=db,
            conversation_id=conversation_id,
            role="assistant",
            content=full_text,
            parent_id=user_message_id,
            agent_name=self.teacher.name,
            model_used=self.teacher.get_model_name(),
        )

        import json as json_mod
        for img in pending_images:
            try:
                tree_engine.create_message(
                    db=db,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=json_mod.dumps(img),
                    parent_id=assistant_msg.id,
                    agent_name="chart",
                    content_type="image",
                )
            except Exception:
                pass

        yield {
            "type": "done",
            "message_id": assistant_msg.id,
            "user_message_id": user_message_id,
        }
