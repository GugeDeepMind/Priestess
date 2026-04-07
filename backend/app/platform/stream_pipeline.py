"""Stream Pipeline — parses [CALL:] and [ASYNC_CALL:] markers in agent output.

The main agent's streaming output may contain markers like:
  [CALL:chart_agent:Draw a sine wave with frequency 440Hz]
  [ASYNC_CALL:project_agent:Build a spring simulation]

The pipeline intercepts these markers and:
  - CALL (sync): pauses main stream → executes target agent → injects result → resumes
  - ASYNC_CALL (async): main stream continues → target runs in background → result pushed later
"""

import re
import asyncio
from dataclasses import dataclass, field
from typing import AsyncIterator, Callable, Awaitable

# Pattern matches [CALL:agent_name:instruction] or [ASYNC_CALL:agent_name:instruction]
# The instruction can contain any characters except ]
CALL_PATTERN = re.compile(
    r'\[(CALL|ASYNC_CALL):([a-zA-Z_][a-zA-Z0-9_]*):([^\]]+)\]'
)


@dataclass
class CallMarker:
    """A parsed [CALL:] or [ASYNC_CALL:] marker."""
    call_type: str      # "CALL" or "ASYNC_CALL"
    agent_name: str     # target agent name
    instruction: str    # the instruction to send


@dataclass
class StreamEvent:
    """An event emitted by the stream pipeline."""
    type: str           # "text", "call_start", "call_result", "async_started", "error"
    content: str = ""
    agent_name: str = ""
    call_type: str = ""
    data: dict = field(default_factory=dict)


# Type alias for the handler function that paradigms provide
# Takes (agent_name, instruction) -> AsyncIterator[StreamEvent]
AgentCallHandler = Callable[[str, str], Awaitable[list[StreamEvent]]]

# Type alias for async agent handler that yields events
AsyncAgentCallHandler = Callable[[str, str], Awaitable[None]]


class StreamPipeline:
    """Processes a raw agent text stream, intercepting [CALL:] markers."""

    def __init__(
        self,
        call_handler: AgentCallHandler | None = None,
        async_call_handler: AsyncAgentCallHandler | None = None,
        async_result_callback: Callable[[list[StreamEvent]], Awaitable[None]] | None = None,
    ):
        self.call_handler = call_handler
        self.async_call_handler = async_call_handler
        self.async_result_callback = async_result_callback
        self._async_tasks: list[asyncio.Task] = []

    async def process(self, raw_stream: AsyncIterator[str]) -> AsyncIterator[StreamEvent]:
        """Process raw text chunks from an agent, yielding StreamEvents.

        Text chunks may split a [CALL:...] marker across multiple chunks,
        so we buffer text that might be part of an incomplete marker.
        """
        buffer = ""

        async for chunk in raw_stream:
            buffer += chunk

            # Process all complete markers and text before them
            while True:
                match = CALL_PATTERN.search(buffer)

                if match is None:
                    # No complete marker found.
                    # Check if buffer contains a partial marker that starts with [CALL: or [ASYNC_CALL:
                    # and hasn't been closed with ] yet
                    partial_idx = -1
                    for prefix in ['[CALL:', '[ASYNC_CALL:']:
                        idx = buffer.rfind(prefix)
                        if idx >= 0:
                            partial_idx = max(partial_idx, idx)

                    if partial_idx >= 0:
                        # Found an unclosed marker prefix — emit text before it, keep buffering
                        if partial_idx > 0:
                            yield StreamEvent(type="text", content=buffer[:partial_idx])
                        buffer = buffer[partial_idx:]
                    else:
                        # No partial marker — emit everything
                        if buffer:
                            yield StreamEvent(type="text", content=buffer)
                        buffer = ""
                    break

                # Found a complete marker
                marker = CallMarker(
                    call_type=match.group(1),
                    agent_name=match.group(2),
                    instruction=match.group(3).strip(),
                )

                # Emit text before the marker
                text_before = buffer[:match.start()]
                if text_before:
                    yield StreamEvent(type="text", content=text_before)

                # Handle the marker
                if marker.call_type == "CALL":
                    # Synchronous call — pause stream, execute, inject result
                    yield StreamEvent(
                        type="call_start",
                        agent_name=marker.agent_name,
                        call_type="sync",
                        content=marker.instruction,
                    )
                    if self.call_handler:
                        try:
                            results = await self.call_handler(
                                marker.agent_name, marker.instruction
                            )
                            for event in results:
                                yield event
                        except Exception as e:
                            yield StreamEvent(
                                type="error",
                                agent_name=marker.agent_name,
                                content=f"Agent call failed: {e}",
                            )

                elif marker.call_type == "ASYNC_CALL":
                    # Async call — notify start, run in background
                    yield StreamEvent(
                        type="async_started",
                        agent_name=marker.agent_name,
                        call_type="async",
                        content=marker.instruction,
                    )
                    if self.async_call_handler:
                        task = asyncio.create_task(
                            self._run_async_agent(marker.agent_name, marker.instruction)
                        )
                        self._async_tasks.append(task)

                # Continue processing after the marker
                buffer = buffer[match.end():]

        # Flush any remaining buffer (could be a partial marker that never completed)
        if buffer:
            yield StreamEvent(type="text", content=buffer)

    async def _run_async_agent(self, agent_name: str, instruction: str):
        """Run an async agent in the background and push results via callback."""
        try:
            if self.async_call_handler:
                await self.async_call_handler(agent_name, instruction)
        except Exception as e:
            if self.async_result_callback:
                await self.async_result_callback([
                    StreamEvent(
                        type="error",
                        agent_name=agent_name,
                        content=f"Async agent failed: {e}",
                    )
                ])

    async def wait_for_async_tasks(self):
        """Wait for all background async tasks to complete."""
        if self._async_tasks:
            await asyncio.gather(*self._async_tasks, return_exceptions=True)
            self._async_tasks.clear()
