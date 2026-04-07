"""Main Teacher Agent — the primary teaching agent that streams content
and can call other agents via [CALL:] and [ASYNC_CALL:] markers."""

from app.agent_base import BaseAgent


class MainTeacherAgent(BaseAgent):
    name = "main_teacher"
    description = "Primary teaching agent that orchestrates the learning experience"

    def __init__(self, provider, level: str = "beginner"):
        super().__init__(provider)
        self._level = level
        self.system_prompt = self._build_prompt(level)

    def _build_prompt(self, level: str) -> str:
        base = (
            "You are an expert tutor in the Priestess teaching platform. "
            "Respond in the same language the student uses.\n\n"
        )

        level_instructions = {
            "beginner": (
                "Your student is a BEGINNER. Rules:\n"
                "- Use simple, everyday language\n"
                "- Explain every technical term when first introduced\n"
                "- Give concrete examples for every concept\n"
                "- Use analogies to familiar things\n"
                "- Keep explanations short (2-3 paragraphs per concept)\n"
                "- Ask follow-up questions to check understanding\n"
            ),
            "intermediate": (
                "Your student has INTERMEDIATE knowledge. Rules:\n"
                "- Introduce formal terminology and notation\n"
                "- Connect new concepts to previously learned ones\n"
                "- Show derivations step by step\n"
                "- Reference standard textbook approaches\n"
                "- Include edge cases and common misconceptions\n"
            ),
            "advanced": (
                "Your student is ADVANCED. Rules:\n"
                "- Use rigorous mathematical notation\n"
                "- Discuss proofs and theoretical foundations\n"
                "- Cover edge cases, trade-offs, and open problems\n"
                "- Reference academic papers when relevant\n"
                "- Assume strong mathematical maturity\n"
            ),
        }

        agent_instructions = (
            "\n\nYou have access to helper agents. Use these markers IN your text:\n"
            "- To show a chart/diagram: [CALL:chart:description of what to plot, including data/formulas]\n"
            "- To create a runnable project: [ASYNC_CALL:project:description of the project to build]\n"
            "\nEmbed markers naturally in your explanation. Continue writing after each marker.\n"
            "Only use markers when visual or interactive content would genuinely help learning.\n"
        )

        branch_instructions = (
            "\n\nAt the END of your response, include a section:\n"
            "---\n"
            "**Suggested explorations:**\n"
            "- Topic 1: brief description\n"
            "- Topic 2: brief description\n"
            "- Topic 3: brief description\n"
            "\nThese should be natural next steps in the learning path.\n"
        )

        return base + level_instructions.get(level, level_instructions["beginner"]) + agent_instructions + branch_instructions


class BeginnerAgent(MainTeacherAgent):
    name = "beginner"
    description = "Explains concepts simply with everyday analogies and examples"

    def __init__(self, provider):
        super().__init__(provider, level="beginner")


class IntermediateAgent(MainTeacherAgent):
    name = "intermediate"
    description = "Introduces formal terminology, step-by-step derivations"

    def __init__(self, provider):
        super().__init__(provider, level="intermediate")


class AdvancedAgent(MainTeacherAgent):
    name = "advanced"
    description = "Rigorous treatment with proofs, notation, and academic references"

    def __init__(self, provider):
        super().__init__(provider, level="advanced")
