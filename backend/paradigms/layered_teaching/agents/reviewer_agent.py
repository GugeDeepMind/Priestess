"""Teaching Reviewer Agent — parallel monitor that reviews teaching quality.

Runs AFTER the main agent finishes a response. Segments the output,
evaluates each segment for thoroughness (Princeton Calculus standard),
and marks weak sections for the user to expand.

Does NOT modify or intervene in the original output. Only adds marks.
"""

import json
import re

from app.agent_base import BaseAgent
from app.providers.base import BaseProvider


REVIEWER_PROMPT = """You are a rigorous teaching quality reviewer.
Your standard: the best undergraduate textbooks (like Princeton Calculus by Adrian Banner).

Given a teaching passage, you must:
1. Split it into logical segments (each covering one concept or step)
2. For each segment, judge: did the teacher break it down thoroughly enough?
   - Did they explain WHY, not just WHAT?
   - Did they give intuition before formalism?
   - Did they use concrete examples?
   - Is the information strictly accurate?
3. Mark segments that need improvement

Output ONLY valid JSON array. Each item:
{
  "segment_start": "first 10 words of the segment...",
  "verdict": "pass" | "needs_expansion",
  "severity": "info" | "warning" | "expand",
  "reason": "brief explanation of why this needs expansion (empty if pass)"
}

Rules:
- Be strict but fair. Not everything needs expansion.
- "pass" means the segment is clear and thorough enough.
- "needs_expansion" means a curious student would be left with questions.
- "expand" severity = definitely needs more detail
- "warning" severity = could be clearer but acceptable
- "info" severity = minor suggestion
- If the entire passage is well-written, return all "pass" verdicts.
- NEVER flag accuracy as "pass" if you detect any factual error — always flag with "warning" or "expand".
- Output ONLY the JSON array, no markdown fences, no explanation.
"""


class ReviewerAgent(BaseAgent):
    name = "reviewer"
    description = "Reviews teaching quality and marks weak sections"

    def __init__(self, provider: BaseProvider):
        super().__init__(provider)
        self.system_prompt = REVIEWER_PROMPT

    async def review(self, teaching_text: str) -> list[dict]:
        """Review a teaching passage and return review marks.

        Returns list of dicts with keys:
          segment_start, verdict, severity, reason
        """
        if not teaching_text.strip() or len(teaching_text) < 50:
            return []

        try:
            result = await self.provider.generate(
                [{"role": "user", "content": teaching_text}],
                self.system_prompt,
            )

            # Clean up response
            result = result.strip()
            if result.startswith("```"):
                lines = result.split("\n")
                result = "\n".join(lines[1:])
            if result.endswith("```"):
                result = result[:-3].strip()

            marks = json.loads(result)
            if not isinstance(marks, list):
                return []

            # Filter to only items that need expansion
            return [
                m for m in marks
                if isinstance(m, dict) and m.get("verdict") == "needs_expansion"
            ]

        except (json.JSONDecodeError, Exception) as e:
            print(f"[Reviewer] Failed to parse review: {e}")
            return []
