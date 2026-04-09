"""Chat routes — core user interaction path."""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models.conversation import Conversation
from app.platform.tree_engine import tree_engine
from app.platform.paradigm_registry import paradigm_registry
from app.providers.claude_provider import ClaudeProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.ollama_provider import OllamaProvider

router = APIRouter(tags=["chat"])


def _get_provider():
    """Pick the first available provider based on configured API keys."""
    if settings.anthropic_api_key:
        return ClaudeProvider(api_key=settings.anthropic_api_key)
    if settings.openai_api_key:
        return OpenAIProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            base_url=settings.openai_base_url or None,
        )
    return OllamaProvider(base_url=settings.ollama_base_url)


def _get_paradigm(paradigm_name: str = "layered_teaching"):
    """Get paradigm instance by name from registry."""
    paradigm_class = paradigm_registry.get(paradigm_name)
    if not paradigm_class:
        # Fallback: import directly
        from paradigms.layered_teaching.paradigm import LayeredTeachingParadigm
        paradigm_class = LayeredTeachingParadigm
    return paradigm_class(provider=_get_provider())


class ChatSettings(BaseModel):
    temperature: float | None = None
    max_tokens: int | None = None
    thinking: str | None = None  # "none", "low", "medium", "high"


class Attachment(BaseModel):
    type: str          # "image" | "document"
    media_type: str    # "image/png", "text/plain", etc.
    data: str          # base64 encoded
    filename: str | None = None


class ChatMessage(BaseModel):
    content: str
    parent_id: str | None = None
    settings: ChatSettings | None = None
    attachments: list[Attachment] | None = None
    system_prompt: str | None = None


@router.post("/chat/{conversation_id}")
async def send_message(conversation_id: str, body: ChatMessage,
                       db: Session = Depends(get_db)):
    # Look up conversation to get its paradigm
    conv = db.query(Conversation).get(conversation_id)
    paradigm_name = conv.paradigm if conv else "layered_teaching"
    paradigm = _get_paradigm(paradigm_name)

    async def event_stream():
        # Build settings dict for providers
        gen_settings = None
        if body.settings:
            gen_settings = body.settings.model_dump(exclude_none=True) or None

        # Build attachments list
        att_list = None
        if body.attachments:
            att_list = [a.model_dump() for a in body.attachments]

        async for event in paradigm.on_user_message(
            user_content=body.content,
            context=[],
            tree_engine=tree_engine,
            db=db,
            conversation_id=conversation_id,
            parent_id=body.parent_id,
            settings=gen_settings,
            attachments=att_list,
            system_prompt=body.system_prompt,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class RegenerateBody(BaseModel):
    settings: ChatSettings | None = None
    system_prompt: str | None = None


@router.post("/chat/{conversation_id}/regenerate/{message_id}")
async def regenerate_message(conversation_id: str, message_id: str,
                             body: RegenerateBody | None = None,
                             db: Session = Depends(get_db)):
    """Regenerate: create a new assistant response under an existing user message."""
    conv = db.query(Conversation).get(conversation_id)
    paradigm_name = conv.paradigm if conv else "layered_teaching"
    paradigm = _get_paradigm(paradigm_name)

    async def event_stream():
        gen_settings = None
        if body and body.settings:
            gen_settings = body.settings.model_dump(exclude_none=True) or None

        async for event in paradigm.on_regenerate(
            user_message_id=message_id,
            tree_engine=tree_engine,
            db=db,
            conversation_id=conversation_id,
            settings=gen_settings,
            system_prompt=body.system_prompt if body else None,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/chat/{conversation_id}/tree")
def get_tree(conversation_id: str, db: Session = Depends(get_db)):
    return tree_engine.get_tree(db, conversation_id)


@router.get("/chat/{conversation_id}/path/{message_id}")
def get_path(conversation_id: str, message_id: str, db: Session = Depends(get_db)):
    path = tree_engine.get_branch_path(db, message_id)
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "agent_name": m.agent_name,
            "content_type": m.content_type,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in path
    ]


@router.get("/paradigms")
def list_paradigms():
    return paradigm_registry.list_all()


# === Temporary test page for Phase 2 ===

TEST_PAGE_HTML = """
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>Priestess - Phase 2 Test</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
        .header { padding: 16px 24px; background: #16213e; border-bottom: 1px solid #0f3460; }
        .header h1 { font-size: 20px; color: #e94560; }
        .messages { flex: 1; overflow-y: auto; padding: 24px; }
        .message { margin-bottom: 16px; padding: 12px 16px; border-radius: 8px; max-width: 80%; white-space: pre-wrap; }
        .message.user { background: #0f3460; margin-left: auto; }
        .message.assistant { background: #16213e; border: 1px solid #0f3460; }
        .message.agent-call { background: #1a3a2e; border: 1px solid #2e7d5b; font-size: 13px; }
        .message .label { font-size: 11px; color: #e94560; margin-bottom: 4px; }
        .message .label.agent { color: #2ecc71; }
        .input-area { padding: 16px 24px; background: #16213e; border-top: 1px solid #0f3460; display: flex; gap: 12px; }
        .input-area input { flex: 1; padding: 12px; border: 1px solid #0f3460; border-radius: 8px; background: #1a1a2e; color: #e0e0e0; font-size: 14px; outline: none; }
        .input-area input:focus { border-color: #e94560; }
        .input-area button { padding: 12px 24px; background: #e94560; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .input-area button:hover { background: #c73e54; }
        .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
        #status { padding: 8px 24px; font-size: 12px; color: #888; }
    </style>
</head>
<body>
    <div class="header"><h1>Priestess - Phase 2 Test (Stream Pipeline)</h1></div>
    <div id="status"></div>
    <div class="messages" id="messages"></div>
    <div class="input-area">
        <input type="text" id="input" placeholder="Type a message... (try asking it to use [CALL:echo:test])" autofocus />
        <button id="send" onclick="sendMessage()">Send</button>
    </div>
    <script>
        let conversationId = null;
        let lastMessageId = null;

        async function initConversation() {
            const res = await fetch('/api/conversations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({title: 'Phase 2 Test'}),
            });
            const data = await res.json();
            conversationId = data.id;
            document.getElementById('status').textContent = 'Conversation: ' + conversationId;
        }

        async function sendMessage() {
            const input = document.getElementById('input');
            const content = input.value.trim();
            if (!content || !conversationId) return;

            input.value = '';
            document.getElementById('send').disabled = true;
            addMessage('user', content);
            const assistantDiv = addMessage('assistant', '');

            const res = await fetch('/api/chat/' + conversationId, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({content: content, parent_id: lastMessageId}),
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                const lines = buffer.split('\\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const event = JSON.parse(line.slice(6));
                        handleEvent(event, assistantDiv);
                    }
                }
            }
            document.getElementById('send').disabled = false;
            input.focus();
        }

        function handleEvent(event, assistantDiv) {
            const contentEl = assistantDiv.querySelector('.content');
            switch (event.type) {
                case 'text':
                    contentEl.textContent += event.content;
                    break;
                case 'call_start':
                    const callDiv = addMessage('agent-call', '');
                    callDiv.querySelector('.label').className = 'label agent';
                    callDiv.querySelector('.label').textContent = 'CALLING: ' + event.agent_name;
                    callDiv.querySelector('.content').textContent = event.instruction;
                    break;
                case 'call_result':
                    contentEl.textContent += event.content || '';
                    break;
                case 'async_started':
                    const asyncDiv = addMessage('agent-call', '');
                    asyncDiv.querySelector('.label').className = 'label agent';
                    asyncDiv.querySelector('.label').textContent = 'ASYNC: ' + event.agent_name;
                    asyncDiv.querySelector('.content').textContent = event.instruction + ' (running in background...)';
                    break;
                case 'error':
                    contentEl.textContent += '\\n[ERROR: ' + event.content + ']';
                    break;
                case 'done':
                    lastMessageId = event.message_id;
                    break;
            }
            assistantDiv.scrollIntoView({behavior: 'smooth', block: 'end'});
        }

        function addMessage(role, content) {
            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.innerHTML = '<div class="label">' + role.toUpperCase() + '</div><div class="content"></div>';
            div.querySelector('.content').textContent = content;
            document.getElementById('messages').appendChild(div);
            div.scrollIntoView({behavior: 'smooth', block: 'end'});
            return div;
        }

        document.getElementById('input').addEventListener('keydown', e => {
            if (e.key === 'Enter') sendMessage();
        });

        initConversation();
    </script>
</body>
</html>
"""


@router.get("/test", response_class=HTMLResponse)
def test_page():
    return TEST_PAGE_HTML
