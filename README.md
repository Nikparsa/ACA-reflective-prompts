# Reflection and Self-Directed Learning in AI-Supported Programming Education

This project investigates the impact of reflective prompts on student engagement and problem-solving in automated code assessment.

ACA is a full-stack platform for coding assignments with automated grading and structured reflection support.

It includes:
- a React frontend for students and teachers,
- an Express backend API with JWT authentication and file upload handling,
- a Python runner service that executes assignment tests (`pytest`) and reports scores back to the backend.

## Research Focus

- **Reflection in programming education:** Students complete guided reflection after each graded submission.
- **Self-directed learning activity:** Reflection prompts encourage students to analyze their own strategy, difficulties, and revisions.
- **AI-supported development context:** Prompts include explicit questions about AI tool usage and understanding of generated code.
- **Iterative improvement:** Second-attempt submissions use dedicated revision prompts to support conscious learning loops.

## Features

- Student and teacher accounts with JWT-based login/register.
- Assignment workflow with built-in and teacher-created tasks.
- ZIP file submissions with automated grading.
- Submission status tracking (`queued`, `processing`, `completed`, `failed`).
- Reflection module (core to the study):
  - required reflection after submission,
  - different prompts for first vs second attempt,
  - teacher-side reflection assessment.
- Teacher dashboard with all submissions, scores, and reflection review.

## Tech Stack

- **Frontend:** React + Vite + Axios
- **Backend:** Node.js + Express + Multer + JSON file persistence
- **Runner:** Python + Flask + Pytest + `pytest-json-report`
- **Containerization:** Docker + Docker Compose

## Project Structure

```text
BA/
  backend/     # Express API + data storage
  frontend/    # React UI
  runner/      # Flask grading service
  tasks/       # Built-in assignment test suites
  solution/    # Sample solution file(s)
```

## Prerequisites (Local Run)

- Node.js (recommended: current LTS)
- Python 3.10+ (project uses Python 3.11 in Docker)
- npm

## Quick Start (Recommended)

From the project root:

### Windows (PowerShell)

```powershell
.\start-project.ps1
```

### Windows (CMD)

```bat
start.bat
```

### Linux/macOS

```bash
chmod +x start-server.sh
./start-server.sh
```

These scripts install dependencies and start services.

## Manual Local Start

If you prefer to run each service manually:

1) **Backend**
```bash
cd backend
npm install
npm start
```

2) **Runner**
```bash
cd runner
python -m venv .venv
# Windows
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python runner.py
# Linux/macOS
source .venv/bin/activate
python -m pip install -r requirements.txt
python runner.py
```

3) **Frontend (dev mode)**
```bash
cd frontend
npm install
npm run dev
```

4) **Frontend (served by backend in production-like mode)**
```bash
cd frontend
npm run build
```
Then run backend and open `http://localhost:3000`.

## Docker Run

From project root:

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- Runner health: `http://localhost:5001/health`

## Default Accounts

The backend seeds these users in its JSON database:

- Student: `student@test.com` / `123456`
- Teacher: `teacher@test.com` / `123456`

## Important Behavior

- Students can submit **max 2 times per assignment**.
- Submissions are expected as **ZIP files**.
- Runner currently executes **Python tests** (pytest-based tasks).
- Teachers can upload custom assignment test files (`.py`), stored server-side.

## Key Environment Variables

### Backend
- `PORT` (default `3000`)
- `JWT_SECRET` (default dev value in code)
- `RUNNER_URL` (default `http://localhost:5001`)

### Runner
- `PORT` (default `5001`)
- `BACKEND_URL` (default `http://localhost:3000/api`)

### Frontend
- `VITE_API_BASE_URL` (default `http://localhost:3000/api`)

## Main API Endpoints

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/assignments`
- `POST /api/submissions`
- `GET /api/submissions`
- `POST /api/reflections`
- `GET /api/reflections`
- `POST /api/runner/callback` (runner -> backend)

## Academic Context

This repository supports the thesis topic:

**"Reflection and Self-Directed Activity in AI-Supported Programming Education: Investigating the Impact of Reflective Prompts on Student Engagement and Problem-Solving in Automated Code Assessment."**

The implementation operationalizes this by combining automated grading with mandatory post-submission reflection prompts and teacher review tooling.

## Notes

- Data is persisted in `backend/src/data/`.
- Built-in assignment tests are stored under `tasks/<assignment-slug>/tests`.
- There is also plugin scaffolding for future multi-language support, but current active grading path is Python-focused.
