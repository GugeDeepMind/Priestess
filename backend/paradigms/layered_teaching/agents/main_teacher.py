"""Main Teacher Agent — the primary teaching agent that streams content
and can call other agents via [CALL:] and [ASYNC_CALL:] markers."""

from app.agent_base import BaseAgent


AGENT_INSTRUCTIONS = (
    "\n\nYou have access to helper agents. Use these markers IN your text:\n"
    "- To show a chart/diagram: [CALL:chart:description of what to plot, including data/formulas]\n"
    "- To create a runnable project: [ASYNC_CALL:project:description of the project to build]\n"
    "\nEmbed markers naturally in your explanation. Continue writing after each marker.\n"
    "Only use markers when visual or interactive content would genuinely help learning.\n"
)

BRANCH_INSTRUCTIONS = (
    "\n\nAt the END of your response, include a section:\n"
    "---\n"
    "**Suggested explorations:**\n"
    "- Topic 1: brief description\n"
    "- Topic 2: brief description\n"
    "- Topic 3: brief description\n"
    "\nThese should be natural next steps in the learning path.\n"
)


class MainTeacherAgent(BaseAgent):
    name = "main_teacher"
    description = "Primary teaching agent that orchestrates the learning experience"

    def __init__(self, provider):
        super().__init__(provider)
        self.system_prompt = (
            "You are an expert tutor in the Priestess teaching platform. "
            "Respond in the same language the student uses."
            + AGENT_INSTRUCTIONS
            + BRANCH_INSTRUCTIONS
        )
