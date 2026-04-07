"""Layered Teaching Paradigm — full implementation with review + knowledge graph.

Agents:
  - main_teacher (beginner/intermediate/advanced) — streams teaching content
  - chart — sync injection, generates matplotlib charts
  - project cluster — async background, builds runnable projects
  - reviewer — parallel monitor, reviews teaching quality after response
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
from app.services.knowledge_graph import KnowledgeGraph

from paradigms.layered_teaching.agents.main_teacher import (
    BeginnerAgent, IntermediateAgent, AdvancedAgent,
)
from paradigms.layered_teaching.agents.chart_agent import ChartAgent
from paradigms.layered_teaching.agents.reviewer_agent import ReviewerAgent
from paradigms.layered_teaching.agents.project_cluster.cluster import ProjectCluster


class LayeredTeachingParadigm(BaseParadigm):
    name = "layered_teaching"
    description = "Multi-agent layered teaching with streaming interleave"
    icon = ""

    def __init__(self, provider: BaseProvider):
        self.provider = provider

        # Teaching agents at different levels
        self.beginner = BeginnerAgent(provider)
        self.intermediate = IntermediateAgent(provider)
        self.advanced = AdvancedAgent(provider)

        # Helper agents
        self.chart = ChartAgent(provider)
        self.reviewer = ReviewerAgent(provider)
        self.project_cluster = ProjectCluster(provider)

        # Currently active teacher (default: beginner)
        self.active_teacher = self.beginner

        self._agents = {
            "beginner": self.beginner,
            "intermediate": self.intermediate,
            "advanced": self.advanced,
            "chart": self.chart,
        }

    def register_agents(self) -> dict[str, BaseAgent]:
        return self._agents

    def register_monitors(self) -> list[BaseAgent]:
        return [self.reviewer]

    def set_level(self, level: str):
        level_map = {
            "beginner": self.beginner,
            "intermediate": self.intermediate,
            "advanced": self.advanced,
        }
        self.active_teacher = level_map.get(level, self.beginner)

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

        # Prepend knowledge graph to context
        kg = KnowledgeGraph("default")
        kg_context = kg.to_context_string()
        ctx_with_kg = [{"role": "system", "content": kg_context}] + ctx

        # Create stream pipeline
        pipeline = StreamPipeline(
            call_handler=self._handle_sync_call,
            async_call_handler=self._handle_async_call,
        )

        # Stream from active teacher through the pipeline
        full_response_parts = []
        pending_images = []  # collect image data during stream, persist after assistant msg
        raw_stream = self.active_teacher.stream_response(ctx_with_kg)

        async for event in pipeline.process(raw_stream):
            if event.type == "text":
                full_response_parts.append(event.content)
                yield {"type": "text", "content": event.content}

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
                yield {
                    "type": "async_started",
                    "agent_name": event.agent_name,
                    "instruction": event.content,
                }

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
            agent_name=self.active_teacher.name,
            model_used=self.active_teacher.get_model_name(),
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

        # === Parallel monitor: Teaching Review ===
        # Run reviewer AFTER the main response is done (non-blocking for the user)
        if full_text and len(full_text) > 100:
            try:
                review_marks = await self.reviewer.review(full_text)
                if review_marks:
                    yield {
                        "type": "ui",
                        "component": "ReviewMarks",
                        "props": {"marks": review_marks},
                    }
            except Exception as e:
                print(f"[Reviewer Error] {e}")
