"""Tree Dialogue Engine — the immutable platform foundation.

All paradigms share this engine. It manages messages in a tree structure
where each message has a parent_id, forming branches. Context for any
node is built by walking from that node back to the root.
"""

from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.message import Message
from app.models.conversation import Conversation


class TreeEngine:

    def create_conversation(self, db: Session, title: str = "New Conversation",
                            paradigm: str = "layered_teaching",
                            user_id: str | None = None) -> Conversation:
        conv = Conversation(
            id=str(uuid4()),
            title=title,
            paradigm=paradigm,
            user_id=user_id,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return conv

    def create_message(self, db: Session, conversation_id: str, role: str,
                       content: str, parent_id: str | None = None,
                       agent_name: str | None = None,
                       model_used: str | None = None,
                       content_type: str = "text") -> Message:
        msg = Message(
            id=str(uuid4()),
            conversation_id=conversation_id,
            parent_id=parent_id,
            role=role,
            content=content,
            agent_name=agent_name,
            model_used=model_used,
            content_type=content_type,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return msg

    def get_branch_path(self, db: Session, message_id: str) -> list[Message]:
        """Walk from message_id up to root, return list ordered root-first."""
        path = []
        current = db.query(Message).get(message_id)
        while current is not None:
            path.append(current)
            if current.parent_id is None:
                break
            current = db.query(Message).get(current.parent_id)
        path.reverse()
        return path

    def get_context_dicts(self, db: Session, message_id: str) -> list[dict]:
        """Return branch path as a list of {role, content} dicts for AI API calls."""
        path = self.get_branch_path(db, message_id)
        return [{"role": m.role, "content": m.content} for m in path]

    def create_branch(self, db: Session, parent_message_id: str,
                      conversation_id: str, role: str,
                      content: str) -> Message:
        """Create a new message branching from an existing message."""
        return self.create_message(
            db=db,
            conversation_id=conversation_id,
            role=role,
            content=content,
            parent_id=parent_message_id,
        )

    def get_children(self, db: Session, message_id: str) -> list[Message]:
        """Get all direct child messages of a given message."""
        return (
            db.query(Message)
            .filter(Message.parent_id == message_id)
            .order_by(Message.created_at)
            .all()
        )

    def get_tree(self, db: Session, conversation_id: str) -> dict:
        """Return the full message tree for a conversation as nested dicts."""
        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
            .all()
        )

        msg_map = {}
        for m in messages:
            msg_map[m.id] = {
                "id": m.id,
                "parent_id": m.parent_id,
                "role": m.role,
                "agent_name": m.agent_name,
                "content": m.content,
                "content_type": m.content_type,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "children": [],
            }

        roots = []
        for m in messages:
            node = msg_map[m.id]
            if m.parent_id and m.parent_id in msg_map:
                msg_map[m.parent_id]["children"].append(node)
            else:
                roots.append(node)

        return {"conversation_id": conversation_id, "roots": roots}

    def get_leaf_messages(self, db: Session, conversation_id: str) -> list[Message]:
        """Get all leaf messages (no children) in a conversation."""
        all_msgs = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .all()
        )
        parent_ids = {m.parent_id for m in all_msgs if m.parent_id}
        return [m for m in all_msgs if m.id not in parent_ids]


# Singleton
tree_engine = TreeEngine()
