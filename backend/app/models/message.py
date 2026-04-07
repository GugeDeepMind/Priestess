from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship

from app.database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    parent_id = Column(String, ForeignKey("messages.id"), nullable=True)  # NULL = root
    role = Column(String, nullable=False)           # "user" | "assistant" | "system"
    agent_name = Column(String, nullable=True)       # NULL for user msgs
    content = Column(Text, nullable=False)
    model_used = Column(String, nullable=True)       # e.g. "claude-sonnet-4-20250514"
    content_type = Column(String, nullable=False, default="text")  # "text" | "image" | "ui"
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    parent = relationship("Message", remote_side=[id], backref="children")

    __table_args__ = (
        Index("idx_messages_conversation", "conversation_id"),
        Index("idx_messages_parent", "parent_id"),
    )
