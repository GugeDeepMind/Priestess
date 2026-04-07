"""Simple Chat — minimal paradigm for testing. Just a single agent, no pipeline."""

from typing import AsyncIterator

from app.agent_base import BaseAgent
from app.paradigm_base import BaseParadigm
from app.platform.tree_engine import TreeEngine
from app.providers.base import BaseProvider


class ChatAgent(BaseAgent):
    name = "chat"
    description = "A simple conversational assistant"
    system_prompt = "You are a helpful assistant. Be concise and friendly."


class SimpleChatParadigm(BaseParadigm):
    name = "simple_chat"
    description = "Simple single-agent chat without teaching features"
    icon = ""

    def __init__(self, provider: BaseProvider):
        self.agent = ChatAgent(provider)

    def register_agents(self) -> dict[str, BaseAgent]:
        return {"chat": self.agent}

    async def on_user_message(
        self,
        user_content: str,
        context: list[dict],
        tree_engine: TreeEngine,
        db,
        conversation_id: str,
        parent_id: str | None,
    ) -> AsyncIterator[dict]:
        user_msg = tree_engine.create_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=user_content,
            parent_id=parent_id,
        )

        ctx = tree_engine.get_context_dicts(db, user_msg.id)

        full_response = []
        async for chunk in self.agent.stream_response(ctx):
            full_response.append(chunk)
            yield {"type": "text", "content": chunk}

        assistant_msg = tree_engine.create_message(
            db=db,
            conversation_id=conversation_id,
            role="assistant",
            content="".join(full_response),
            parent_id=user_msg.id,
            agent_name=self.agent.name,
            model_used=self.agent.get_model_name(),
        )

        yield {"type": "done", "message_id": assistant_msg.id, "user_message_id": user_msg.id}
