# Sprint Countdown

A browser-based sprint command center for running multiple tasks at once, scheduling upcoming work, and tracking task-specific milestones.

## Project Structure
- `backend/`: FastAPI health and starter milestone endpoints.
- `frontend/`: React + Tailwind CSS multi-task dashboard.

Create any number of active tasks, schedule tasks to start later, or pause and resume work. Each task has a live seconds countdown, editable work topics, and its own editable milestone checklist. Tasks and milestone updates are saved in browser storage and synchronized between tabs in the same browser profile. Data is not shared between different users or devices.

## Quick Start
1. Backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
   Python 3.13 is supported.
2. Frontend:
   ```bash
   cd frontend
   npm install
   npm start
   ```

## Deploy to Vercel
Import the GitHub repository into Vercel and deploy from the repository root. The root `pyproject.toml` configures the FastAPI entrypoint and builds the React frontend. FastAPI serves the generated frontend assets after the API routes.
