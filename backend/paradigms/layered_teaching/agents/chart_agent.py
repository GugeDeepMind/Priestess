"""Chart Agent — generates matplotlib charts from natural language instructions.

This is NOT an AI agent. It receives an instruction from the main agent,
uses an AI to generate matplotlib code, executes it, and returns the image.
"""

import io
import base64
import tempfile
import traceback

from app.agent_base import BaseAgent
from app.providers.base import BaseProvider


CODE_GEN_PROMPT = """You are a Python matplotlib code generator.
Given a description of a chart/diagram, generate ONLY executable Python code that creates it.

Rules:
- You may ONLY import matplotlib and numpy. Do NOT use scipy, pandas, seaborn, or any other library.
- Import matplotlib.pyplot as plt and numpy as np at the top
- Use plt.figure(figsize=(8, 5), dpi=100)
- Use a clean light theme with warm tones: plt.style.use('seaborn-v0_8-whitegrid')
- Save to the variable `fig` (fig = plt.gcf())
- Do NOT call plt.show()
- Do NOT call plt.savefig()
- Output ONLY Python code, no markdown fences, no explanation
- Make the chart visually clear with labels, title, and legend where appropriate
- Use warm colors that look good on light backgrounds (#6B4A3A, #7E9B85, #C4956A, #9B8AAD, #B5785A)
- If a task seems to require scipy or other libraries, implement it manually with numpy.
"""


class ChartAgent(BaseAgent):
    name = "chart"
    description = "Generates matplotlib charts from text descriptions"

    def __init__(self, provider: BaseProvider):
        super().__init__(provider)
        self.system_prompt = CODE_GEN_PROMPT

    async def generate_chart(self, instruction: str) -> tuple[bytes, str] | tuple[None, str]:
        """Generate a chart image from instruction. Returns (png_bytes, caption) or (None, error)."""
        # Step 1: Ask AI to generate matplotlib code
        try:
            code = await self.provider.generate(
                [{"role": "user", "content": instruction}],
                self.system_prompt,
            )
            # Clean up code (remove markdown fences if present)
            code = code.strip()
            if code.startswith("```"):
                lines = code.split("\n")
                code = "\n".join(lines[1:])
            if code.endswith("```"):
                code = code[:-3].strip()
        except Exception as e:
            return None, f"Failed to generate chart code: {e}"

        # Step 2: Execute the code
        try:
            import matplotlib
            matplotlib.use('Agg')  # Non-interactive backend
            import matplotlib.pyplot as plt
            import numpy as np

            # Clear any previous plots
            plt.close('all')

            # Execute in a controlled namespace
            namespace = {"plt": plt, "np": np, "matplotlib": matplotlib}
            exec(code, namespace)

            fig = namespace.get("fig") or plt.gcf()

            # Render to PNG bytes
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight',
                        facecolor='#FAF6F1', edgecolor='none')
            buf.seek(0)
            png_bytes = buf.read()
            plt.close('all')

            return png_bytes, instruction

        except Exception as e:
            plt.close('all')
            return None, f"Chart execution error: {e}\n\nGenerated code:\n{code}"
