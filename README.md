# AntRooms

Find a free UCI classroom right now.

**Live: [antrooms.vercel.app](https://antrooms.vercel.app)**

AntRooms shows which UCI classrooms are open right now on a campus map. It works
this out from the official registrar schedule. You can pick a building to see its
rooms, or change the day and time to plan ahead.

## Stack

- **Frontend:** React (Vite) and Tailwind, with a MapLibre GL map on OpenStreetMap tiles
- **Backend:** Node.js and Express
- **Database:** Supabase (Postgres)
- **Data:** class schedules from [AnteaterAPI](https://anteaterapi.com) (WebSoc), synced into the database by scripts in `backend/scripts/`

## Running locally

```bash
cd backend && npm install && npm run dev     # API on http://localhost:3001
cd frontend && npm install && npm run dev    # app on http://localhost:5173
```

The backend needs a `backend/.env` file containing `SUPABASE_URL` and `SUPABASE_KEY`. Use `backend/.env.example` as a template.
