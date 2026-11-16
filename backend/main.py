from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from pathlib import Path

app = FastAPI(
    title="DevSync API",
    description="Backend command center for Hackathon & AI Agent sprints.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Milestone(BaseModel):
    id: int
    title: str
    t_minus: str
    category: str
    completed: bool

class MilestoneUpdate(BaseModel):
    completed: bool

milestones_db = [
    {"id": 1, "title": "Architecture & Schema Lock", "t_minus": "T-7 Days", "category": "Backend", "completed": True},
    {"id": 2, "title": "FastAPI Endpoints & DB Integration", "t_minus": "T-5 Days", "category": "Backend", "completed": False},
    {"id": 3, "title": "AI Agent / MCP Service Integration", "t_minus": "T-4 Days", "category": "AI / ML", "completed": False},
    {"id": 4, "title": "React UI & Tailwind Dashboard", "t_minus": "T-3 Days", "category": "Frontend", "completed": False},
    {"id": 5, "title": "End-to-End Testing & Bug Fixes", "t_minus": "T-2 Days", "category": "QA", "completed": False},
    {"id": 6, "title": "Vercel Deploy & 9:16 Demo Reel", "t_minus": "T-1 Day", "category": "Release", "completed": False},
]

@app.get("/api/health")
def health_check():
    deadline = datetime(2026, 11, 23, 23, 59, 59, tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    time_remaining = deadline - now
    return {
        "status": "Operational",
        "system": "DevSync Command Center",
        "seconds_remaining": max(0, int(time_remaining.total_seconds()))
    }

@app.get("/api/milestones", response_model=List[Milestone])
def get_milestones():
    return milestones_db

@app.patch("/api/milestones/{milestone_id}", response_model=Milestone)
def update_milestone(milestone_id: int, update: MilestoneUpdate):
    for m in milestones_db:
        if m["id"] == milestone_id:
            m["completed"] = update.completed
            return m
    raise HTTPException(status_code=404, detail="Milestone not found")

frontend_build = Path(__file__).resolve().parents[1] / "frontend" / "build"
app.mount("/", StaticFiles(directory=frontend_build, html=True, check_dir=False), name="frontend")
