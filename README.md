# Driver Communication Tool — New Project Scaffold

This is a lightweight starting point to build the new logistics/driver communication app.
We’ll begin with a clean landing page and a minimal Node/Express server. We can grow routes
for drivers, dispatchers, shippers/receivers from here.

## Structure
- `server/` — Express server serving static files from `web/` and ready for API routes.
- `web/` — Static landing page (HTML/CSS/JS) with a modern dark theme and responsive layout.
- `.env` — Environment variables (see `.env.example`).

## Quick Start
```bash
# 1) Install deps
npm install

# 2) Start the server (serves web/ at http://localhost:3000)
npm run dev
```

## Next steps
- Add `/api` routes in `server/index.js` (e.g., `/api/ping` already included).
- Wire Twilio later for SMS notifications (`.env.example` placeholders included).
- Add pages: `/dispatcher`, `/driver`, `/shipper`, `/receiver` or use one SPA router.
