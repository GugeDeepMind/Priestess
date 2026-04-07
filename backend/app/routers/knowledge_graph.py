"""Knowledge graph API routes."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.knowledge_graph import KnowledgeGraph

router = APIRouter(tags=["knowledge_graph"])


class GraphUpdate(BaseModel):
    graph: dict


class NodeUpdate(BaseModel):
    path: list[str]
    status: str | None = None
    children: dict[str, str] | None = None  # name -> status


@router.get("/knowledge-graph/{user_id}")
def get_graph(user_id: str = "default"):
    kg = KnowledgeGraph(user_id)
    return kg.get()


@router.put("/knowledge-graph/{user_id}")
def save_graph(user_id: str, body: GraphUpdate):
    kg = KnowledgeGraph(user_id)
    kg.save(body.graph)
    return {"status": "saved"}


@router.post("/knowledge-graph/{user_id}/reset")
def reset_graph(user_id: str = "default"):
    kg = KnowledgeGraph(user_id)
    kg.reset_to_default()
    return {"status": "reset to default"}


@router.patch("/knowledge-graph/{user_id}/node")
def update_node(user_id: str, body: NodeUpdate):
    kg = KnowledgeGraph(user_id)
    if body.children:
        kg.expand_node(body.path, body.children)
    if body.status:
        kg.update_node(body.path, status=body.status)
    return {"status": "updated"}
