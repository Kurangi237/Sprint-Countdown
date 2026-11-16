# DevSync: Autonomous Hackathon & AI Sprint Command Center

Built for the **Handshake AI Skills Studio X Google Challenge**.

## Project Structure
- `backend/`: FastAPI server managing sprint telemetry and milestones.
- `frontend/`: React + Tailwind CSS dashboard styled for mobile/developer workflows.

The dashboard shows a live countdown with seconds. Plan and queue named sprint targets with deadlines and work topics without replacing the active target. Queued targets can be edited; their topics are shown while queued and on the active target. When the current target is reached, start the next queued target and review completed targets. Custom targets and target history are saved in the browser.

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
Import the GitHub repository into Vercel and deploy from the repository root. The root `pyproject.toml` configures the FastAPI entrypoint and builds the React frontend into Vercel's static `public/` directory. In production, the frontend calls the API on the same origin; locally, it continues to use `http://localhost:8000`.
