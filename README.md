# Priestess

A multi-agent collaborative teaching platform with tree-structured conversations. Built with Electron + React + Python FastAPI.

Priestess allows you to learn complex subjects through AI-powered teaching agents that collaborate in real-time — generating explanations, inline charts, runnable projects, and quality reviews — all within a branching conversation tree where each branch maintains its own isolated context.

## Core Features

### Tree-Structured Dialogue
Every conversation is a tree, not a linear chat. You can branch from any message to explore different directions. Each branch maintains its own context — sibling branches never pollute each other.

```
"What is calculus?" → AI explains...
    ├─ "Tell me about limits" → AI explains limits...
    │     └─ "What about continuity?" → ...
    └─ "Show me derivatives" → AI explains derivatives...
          └─ "Draw the tangent line" → [chart injected]
```

### Multi-Agent Streaming Interleave
The main teaching agent can call helper agents mid-stream. Charts, projects, and other content are injected directly into the response flow:

- **Sync Injection** — Main agent pauses, helper executes (e.g., chart generation), result appears inline, main agent continues
- **Async Background** — Main agent continues teaching while a project is built in the background
- **Parallel Monitoring** — A reviewer agent watches the teaching output and marks weak sections

### Paradigm Plugin System
Priestess is not just one app — it's a platform. The entire agent collaboration pattern is encapsulated in a "paradigm" that can be swapped:

```python
class MyParadigm(BaseParadigm):
    name = "my_custom_paradigm"

    def register_agents(self) -> dict[str, BaseAgent]:
        return {"agent_a": ..., "agent_b": ...}

    async def on_user_message(self, ...):
        # Define your own agent collaboration logic
        ...
```

Drop your paradigm into `backend/paradigms/` and it auto-discovers on startup.

### Built-in: Layered Teaching Paradigm
The default paradigm includes:

| Agent | Role | Mode |
|---|---|---|
| Main Teacher | Beginner / Intermediate / Advanced levels | Streaming |
| Chart Agent | Generates matplotlib charts from descriptions | Sync injection |
| Project Cluster | Plans, codes, and tests runnable projects | Async background |
| Teaching Reviewer | Reviews teaching quality, marks weak sections | Parallel monitor |

### Knowledge Graph
A recursive fractal milestone structure tracks what you know:

```
Mathematics
  ├─ [done] Algebra
  ├─ [learning] Trigonometry
  │     ├─ [done] Basic trig functions
  │     └─ [not started] Inverse trig
  └─ [not started] Calculus
```

- Sent to the AI before each conversation so it adapts to your level
- Editable at any time, or reset to "high school student" default
- Nodes expand recursively — as granular as you need

### Branch Suggestions
At the end of each response, the teaching agent suggests next topics. Click one to create a new branch and explore that direction.

### Teaching Quality Review
After each response, a reviewer agent evaluates whether concepts were explained thoroughly enough (Princeton Calculus standard). Weak sections are marked with expandable "needs expansion" indicators — the original content is never modified.

## Architecture

```
┌─ Electron (TypeScript + React) ─────────────────┐
│  Paradigm selection → Chat UI → Branch tree      │
│  Stream rendering → Chart display → Review marks  │
└──────────────┬───────────────────────────────────┘
               │ HTTP + SSE (localhost:8000)
┌──────────────▼───────────────────────────────────┐
│  Python Backend (FastAPI)                         │
│                                                   │
│  Platform Layer (immutable)                        │
│  ├─ Tree dialogue engine                          │
│  ├─ Stream pipeline + [CALL:] marker parsing      │
│  ├─ Content injector (text/image/UI)              │
│  └─ Paradigm registry (auto-discovery)            │
│                                                   │
│  Paradigm Layer (extensible)                       │
│  └─ Layered Teaching / Simple Chat / Your own...  │
└───────────────────────────────────────────────────┘
```

## Requirements

- **Windows** 10/11 x64
- **Python** 3.10+
- **Node.js** 18+ (for development only)
- At least one AI provider:
  - OpenAI-compatible API (including relay/proxy services)
  - Anthropic Claude API
  - Local Ollama

## Installation

### Option A: Download installer
1. Download `Priestess Setup 0.1.0.exe` from [Releases](https://github.com/GugeDeepMind/Priestess/releases)
2. Install and launch
3. Create `backend/.env` in the install directory (see Configuration below)
4. Install Python dependencies:
   ```bash
   cd "C:\Users\<you>\AppData\Local\Programs\priestess\resources\backend"
   pip install -r requirements.txt
   ```

### Option B: Run from source
```bash
git clone https://github.com/GugeDeepMind/Priestess.git
cd Priestess

# Frontend
npm install

# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys

# Run
cd ..
npm run build:frontend
npx electron .
```

## Configuration

Create `backend/.env`:

```env
# OpenAI or compatible relay
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://your-relay.com/v1
OPENAI_MODEL=gpt-4o

# Or Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Or local Ollama
OLLAMA_BASE_URL=http://localhost:11434

# App
SECRET_KEY=any-random-string
DATABASE_URL=sqlite:///./priestess.db
```

At least one AI provider is required. The app uses the first available in order: Anthropic → OpenAI → Ollama.

## For Paradigm Developers

Create a new directory under `backend/paradigms/`:

```
backend/paradigms/my_paradigm/
├── __init__.py
└── paradigm.py       # Must contain a class extending BaseParadigm
```

Key base classes:
- `app.paradigm_base.BaseParadigm` — Define agents and collaboration logic
- `app.agent_base.BaseAgent` — Pair a system prompt with an AI provider
- `app.providers.base.BaseProvider` — Implement `generate()` and `stream()` for a new AI API

The platform layer provides:
- `TreeEngine` — `create_message()`, `get_branch_path()`, `create_branch()`, `get_tree()`
- `StreamPipeline` — Parses `[CALL:agent:instruction]` and `[ASYNC_CALL:agent:instruction]` markers
- `ContentInjector` — Create text, image, UI component, or code block events

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron |
| Frontend | React + TypeScript + Vite |
| Backend | Python FastAPI |
| Database | SQLite + SQLAlchemy |
| AI Providers | Anthropic SDK, OpenAI SDK, Ollama (httpx) |
| Charts | matplotlib |
| Styling | Custom CSS (coffee & white theme) |

## License

MIT
