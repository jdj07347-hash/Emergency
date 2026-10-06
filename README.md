# 🚨 Smart Rescue — AI-Powered Emergency Response (DEMO)

A demo-ready MVP of an AI-assisted emergency platform:

**REPORT → ANALYZE → PRIORITIZE → DISPATCH → ACCEPT → COORDINATE → ALLOCATE → RESPOND → RESOLVE**

> ⚠️ **DEMO MODE.** This demonstration system is not connected to real emergency response services.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · shadcn-style UI primitives · Supabase (Postgres, Realtime, Storage) · Gemini API · Leaflet + OpenStreetMap · Browser Geolocation / MediaRecorder · Google Maps (external navigation only) · Vercel.

There is no separate backend server: secrets live in Route Handlers and Server Actions.

## Setup

1. **Create a Supabase project** and run, in the SQL editor:
   1. `supabase/migrations/0001_smart_rescue_init.sql` (schema, RLS, Realtime, Storage bucket)
   2. `supabase/seed.sql` (9 responders + 3 hospitals, fictional)
2. **Environment** — copy `.env.example` to `.env.local` and fill in:

   | Variable | Where | Exposure |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API | browser |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | browser |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role / secret key | **server only** |
   | `GEMINI_API_KEY` | Google AI Studio | **server only** |
   | `GEMINI_MODEL` (optional) | comma-separated fallback chain; default `gemini-3.1-flash-lite → 3.5-flash-lite → 3.8-flash` | server only |

3. `npm install` → `npm run dev` → open http://localhost:3000

Deploy: import the repo in Vercel and add the same environment variables. `npm run build && npm run start` also works locally.

## Routes

| Route | Who | Notes |
| --- | --- | --- |
| `/` → `/report` | Citizen | No login. GPS mandatory, voice / text / victims / photo / video |
| `/track/<token>` | Citizen | Live status via an unguessable token (expires after 7 days) |
| `/login` | Staff | One-tap sign-in for every unit, hospital and Control (also linked from the home page) |
| `/responder/{fire\|police\|ambulance}/{1-3}` | Responders | Mobile-first incident card + status controls |
| `/hospital/{1-3}` | Hospitals | Accept / reject, confirm capacity |
| `/control` | Control Center | Desktop-first live command center |

Sign-ins are remembered per browser for several identities at once, so a presenter can keep Fire 1, Hospital 1 and the Control Center open in separate tabs.

## Running the demo scenario

1. Nothing to set up: every new report marks the reporter’s exact GPS position as the emergency location and places the idle demo units and hospitals on roads 5–10 km around it. **Demo tools → Re-center** does the same on demand.
2. On a phone, open `/` → *Report emergency* → enable location → record:
   *"There has been a major accident near the bridge. Multiple vehicles are involved. Many people are injured and some may be trapped. Around 20 people are affected."* → victims **20** → add a photo → **Send**.
3. Gemini returns ROAD_ACCIDENT / CRITICAL; the backend computes priority (~95), dispatches nearest available Fire (Fire 3 is seeded **BUSY**, so it is skipped), Police and Ambulance, and notifies the nearest hospital.
4. Hospital 1: Accept → 10 → Confirm. Hospital 2: Accept → 6. Hospital 3: Accept → 4 → **20 / 20 COVERED**.
5. Each responder: Accept → Navigate (opens Google Maps) → En route → Arrived → Start response → Completed. When all units complete, the incident is **RESOLVED**.
6. The citizen tracking page and Control Center update live throughout.

**Demo tools → Clear all incidents & reset** returns everything to the initial state.

## Architecture

```
src/
  app/
    api/uploads      signed upload URLs (type/size validated; bucket enforces again)
    api/incidents    report intake → AI → priority → dispatch → hospitals
    actions/         Server Actions (responder, hospital, control, demo auth)
    …pages           citizen, tracking, login, responder, hospital, control
  components/        ui primitives, status chips, map, timeline, coverage, role dashboards
  lib/
    constants.ts     categories, severities, statuses, state machine, event types
    priority.ts      deterministic priority engine (40/20/20/10/10)
    services.ts      extensible required-services rules
    geo.ts           Haversine distance, Google Maps link
    ai/              Gemini call + zod validation of structured output
    server/          dispatch, hospital coordination, pipeline, queries, demo-auth guards
supabase/            migration + seed
```

**Gemini interprets, the backend decides.** Gemini returns structured JSON (category, severity, victim range, risk flags, transcript of the voice note). It is validated with zod; the backend then computes priority, required services, selects the *available* unit with the shortest **road** drive time (OSRM; set `OSRM_URL` to self-host), stores its route and ETA, and falls back to a labelled straight-line estimate if routing is unreachable, and runs sequential hospital allocation. If AI fails, the incident is saved as *PENDING_REVIEW* and an operator can assess it manually from the Control Center.

**Realtime.** Browsers subscribe to Postgres changes with the anon key and re-render server data on change. All writes go through the service role on the server; RLS allows anon *read* only, and tracking tokens live in a table the anon key cannot read.

### Demo-mode limitations (by design)

- Staff "auth" is a role + number with no password.
- Operational tables are readable with the anon key (needed for Realtime).
- Evidence files are in a public bucket under random paths.
