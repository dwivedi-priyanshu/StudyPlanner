# Smart Daily Planner

Smart Daily Planner is a full-stack personal task manager with authentication, date-wise planning, analytics, and automation.

Built with:
- Frontend: React + Vite + Tailwind + Recharts
- Backend: Node.js + Express + MongoDB + Mongoose + node-cron

## Features

- User authentication with JWT (register/login/session restore)
- Date-wise task planning and daily progress tracking
- Priority levels (`High`, `Medium`, `Low`) with color-coded left border
- Task sorting by **priority first**, then **due time**
- Due time support with browser "due soon" notifications
- Filter bar: `All`, `Pending`, `Completed`, `High Priority`, `Rolled-over`
- Task notes via `📝` button (private note per task)
- Manual task move to previous/next day (`←` and `→`)
- Automatic midnight rollover for unfinished tasks
- Recurring tasks (`Daily`, `Weekly`, `Monthly`)
- Weekly strip view with day-wise task counts
- Streak banner (`🔥`) for consecutive fully completed days
- Summary tab with:
  - 14-day completion bar chart
  - total/completed/pending/rolled-over/high-priority metrics
  - most productive day
- Smart suggestions from repeated task titles
- Dark mode UI
- Daily email reminder at 11 PM containing completed and pending tasks

## Project Structure

- `frontend/` - React app
- `backend/` - Express API and cron jobs

## Local Setup

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs on `http://localhost:5000`.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Environment Variables (Backend)

Create `backend/.env` with:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/smart-daily-planner
JWT_SECRET=replace_with_strong_random_secret

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_email_app_password
SMTP_FROM=your_email@gmail.com
```

Notes:
- If using Gmail, `SMTP_PASS` should be a Google App Password.
- `SMTP_FROM` is optional in code; if omitted, it falls back to `SMTP_USER`.

## Cron Jobs

Configured in backend server:
- `00:00` every day: auto-rollover pending tasks from yesterday to today
- `23:00` every day: send email summary (completed + pending)

## Docker

From project root:

```bash
docker compose up --build
```

Default endpoints:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000`
- MongoDB: `mongodb://localhost:27017`
