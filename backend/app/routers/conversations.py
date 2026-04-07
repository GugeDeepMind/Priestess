"""Conversation management routes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.tree_engine import tree_engine
from app.models.conversation import Conversation

router = APIRouter(tags=["conversations"])


class ConversationCreate(BaseModel):
    title: str = "New Conversation"
    paradigm: str = "layered_teaching"


class ConversationRename(BaseModel):
    title: str


@router.post("/conversations")
def create_conversation(body: ConversationCreate, db: Session = Depends(get_db)):
    conv = tree_engine.create_conversation(
        db=db, title=body.title, paradigm=body.paradigm,
    )
    return {"id": conv.id, "title": conv.title, "paradigm": conv.paradigm}


@router.get("/conversations")
def list_conversations(db: Session = Depends(get_db)):
    convs = db.query(Conversation).order_by(Conversation.updated_at.desc()).all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "paradigm": c.paradigm,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in convs
    ]


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.query(Conversation).get(conversation_id)
    if not conv:
        return {"error": "Not found"}, 404
    return {
        "id": conv.id,
        "title": conv.title,
        "paradigm": conv.paradigm,
        "tree": tree_engine.get_tree(db, conversation_id),
    }


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.query(Conversation).get(conversation_id)
    if not conv:
        return {"error": "Not found"}, 404
    # Delete all messages first
    from app.models.message import Message
    db.query(Message).filter(Message.conversation_id == conversation_id).delete()
    db.delete(conv)
    db.commit()
    return {"deleted": conversation_id}


@router.patch("/conversations/{conversation_id}")
def rename_conversation(conversation_id: str, body: ConversationRename,
                        db: Session = Depends(get_db)):
    conv = db.query(Conversation).get(conversation_id)
    if not conv:
        return {"error": "Not found"}, 404
    conv.title = body.title
    db.commit()
    return {"id": conv.id, "title": conv.title}
