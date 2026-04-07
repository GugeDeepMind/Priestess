"""Project Verification Cluster — plans, writes, and tests a runnable project.

Runs asynchronously in the background. When complete, injects a project link
into the conversation stream.
"""

import os
import json
import tempfile
from pathlib import Path

from app.agent_base import BaseAgent
from app.providers.base import BaseProvider


PLANNER_PROMPT = """You are a project planner. Given a description, output a JSON project plan.
Output ONLY valid JSON with this structure:
{
  "title": "Project Title",
  "description": "What this project demonstrates",
  "files": [
    {"path": "main.py", "description": "Entry point that..."},
    {"path": "utils.py", "description": "Helper functions for..."}
  ],
  "run_command": "python main.py"
}
Keep projects minimal — 1-3 files max. Focus on demonstrating the concept clearly."""


CODER_PROMPT = """You are a Python code writer. Given a file description and project context,
write the complete file content. Output ONLY the code, no markdown fences, no explanation.
Write clean, well-commented code that a student can learn from."""


TESTER_PROMPT = """You are a code reviewer. Given the project files, check for:
1. Syntax errors
2. Import errors
3. Logic issues
Output a brief review: "PASS" if the code looks correct, or list specific issues."""


class PlannerAgent(BaseAgent):
    name = "planner"
    description = "Plans the structure of a runnable project"

    def __init__(self, provider: BaseProvider):
        super().__init__(provider)
        self.system_prompt = PLANNER_PROMPT


class CoderAgent(BaseAgent):
    name = "coder"
    description = "Writes code files for the project"

    def __init__(self, provider: BaseProvider):
        super().__init__(provider)
        self.system_prompt = CODER_PROMPT


class TesterAgent(BaseAgent):
    name = "tester"
    description = "Reviews project code for correctness"

    def __init__(self, provider: BaseProvider):
        super().__init__(provider)
        self.system_prompt = TESTER_PROMPT


class ProjectCluster:
    """Orchestrates planner → coder → tester to produce a runnable project."""

    def __init__(self, provider: BaseProvider, projects_dir: str | None = None):
        self.planner = PlannerAgent(provider)
        self.coder = CoderAgent(provider)
        self.tester = TesterAgent(provider)
        self.projects_dir = projects_dir or str(
            Path(tempfile.gettempdir()) / "priestess_projects"
        )
        os.makedirs(self.projects_dir, exist_ok=True)

    async def build_project(self, instruction: str) -> dict:
        """Build a project from instruction. Returns project info dict."""
        # Step 1: Plan
        plan_text = await self.planner.respond(
            [{"role": "user", "content": instruction}]
        )
        try:
            # Clean up JSON if wrapped in markdown
            plan_text = plan_text.strip()
            if plan_text.startswith("```"):
                lines = plan_text.split("\n")
                plan_text = "\n".join(lines[1:])
            if plan_text.endswith("```"):
                plan_text = plan_text[:-3].strip()
            plan = json.loads(plan_text)
        except json.JSONDecodeError:
            return {
                "success": False,
                "error": f"Planner returned invalid JSON: {plan_text[:200]}",
            }

        # Create project directory
        project_name = plan.get("title", "project").replace(" ", "_").lower()
        project_dir = os.path.join(self.projects_dir, project_name)
        os.makedirs(project_dir, exist_ok=True)

        # Step 2: Write files
        written_files = []
        for file_spec in plan.get("files", []):
            file_path = file_spec["path"]
            file_desc = file_spec.get("description", "")

            code_context = (
                f"Project: {plan.get('title', '')}\n"
                f"Project description: {plan.get('description', '')}\n"
                f"File: {file_path}\n"
                f"Purpose: {file_desc}\n"
                f"Other files in project: {[f['path'] for f in plan.get('files', [])]}"
            )

            code = await self.coder.respond(
                [{"role": "user", "content": code_context}]
            )
            # Clean markdown fences
            code = code.strip()
            if code.startswith("```"):
                lines = code.split("\n")
                code = "\n".join(lines[1:])
            if code.endswith("```"):
                code = code[:-3].strip()

            full_path = os.path.join(project_dir, file_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(code)
            written_files.append(file_path)

        # Step 3: Review
        all_code = ""
        for fp in written_files:
            full_path = os.path.join(project_dir, fp)
            with open(full_path, "r", encoding="utf-8") as f:
                all_code += f"\n--- {fp} ---\n{f.read()}\n"

        review = await self.tester.respond(
            [{"role": "user", "content": f"Review this project:\n{all_code}"}]
        )

        return {
            "success": True,
            "title": plan.get("title", "Project"),
            "description": plan.get("description", ""),
            "path": project_dir,
            "files": written_files,
            "run_command": plan.get("run_command", "python main.py"),
            "review": review,
        }
