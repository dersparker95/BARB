from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    email: str
    password: str


class MessageItem(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in {"user", "assistant", "system"}:
            raise ValueError("role debe ser 'user', 'assistant' o 'system'.")
        return v


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    language: Optional[str] = "es"
    machine: Optional[str] = None
    active_manual: Optional[str] = None
    history: list[MessageItem] = Field(default_factory=list, max_length=10)


class ChatDebugRequest(BaseModel):
    sessionId: Optional[str] = None
    machineId: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=4000)
    attachments: list[Any] = Field(default_factory=list)
    sensorData: Optional[dict] = None


class ChatSessionRequest(BaseModel):
    title: str
    saved_by: Optional[str] = "operador"
    discipline: Optional[str] = None
    plant_id: Optional[str] = None
    plant_name: Optional[str] = None
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    active_manual: Optional[str] = None
    messages: list[dict] = Field(default_factory=list)
    metadata_info: dict = Field(default_factory=dict, alias="metadata")


class ChatFeedbackRequest(BaseModel):
    message_content: str
    rating: str
    context: Optional[str] = "General"


class UserCreateRequest(BaseModel):
    nombre: str
    email: str
    password: str
    rol: str
    activo: bool = True


class UserUpdateRequest(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None


class WorkOrderStatusRequest(BaseModel):
    status: str
