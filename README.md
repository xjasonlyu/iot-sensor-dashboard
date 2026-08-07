# IoT Sensor Dashboard

A full-stack dashboard for historical and live home sensor data. PostgreSQL holds
the supplied dataset, EMQX carries simulated device messages, Node.js persists and
forwards them, and React renders current values and charts in real time.

## Run it

From a fresh clone, the complete stack starts with one command:

```bash
docker compose up
```

Open http://localhost:3000. The API and its health endpoint are available at
http://localhost:9000 and http://localhost:9000/health.

No `.env` file is required. The Compose file has local development defaults. To
override the shared PostgreSQL credentials, copy `.env.example` to `.env` and edit
the three values there.

On the first startup, the backend applies committed Prisma migrations and runs an
idempotent `loadInitialData()` import for `data/sensors.json` and
`data/activity.json`. Later restarts reuse the PostgreSQL volume and skip the
completed import. Stop the services with `docker compose down`; add `-v` only when
you intentionally want to delete the local database.

## What is included

- Current temperature, humidity, motion activity, door activity, and sensor status
- Historical temperature/humidity and activity charts with selectable time ranges
- Live chart and card updates from the MQTT simulator over authenticated SSE
- Automatic SSE reconnect with exponential backoff and `Last-Event-ID` replay
- Recent door detection timeline and meaningful loading, empty, and error states
- A lightweight comfort/trend insight based on temperature and relative humidity
- Responsive desktop, tablet, and mobile layout

## Architecture

```text
Python simulator -> EMQX -> Node.js/Express -> PostgreSQL/Prisma
                                  |
                                  +-> REST history + fetch-based SSE -> React
```

The five containers are defined in `docker-compose.yaml`:

- `frontend`: React/TypeScript build served by Vite Preview on port 3000
- `backend`: Express/TypeScript REST and SSE API on port 9000
- `postgres`: persistent PostgreSQL 17 database
- `emqx`: internal anonymous MQTT broker
- `simulator`: Python publisher for temperature, humidity, activity, and door events

PostgreSQL, MQTT, and the EMQX dashboard are deliberately not published to the
host. They are internal implementation details of the local stack.

## Technical decisions

**SSE for browser updates.** The data flow is one-way, so SSE has less protocol and
client complexity than WebSockets. A fetch-based client can send the Bearer token,
reconnect automatically, apply exponential backoff, and resume with
`Last-Event-ID`. WebSockets would be a better choice if the browser also needed
low-latency device controls or bidirectional collaboration.

**REST for initial and historical state.** The browser first loads bounded,
time-bucketed history over REST, then appends live SSE points. This keeps reconnects
and page refreshes predictable without sending the entire history over a stream.

**PostgreSQL with Prisma.** The supplied data and live events share one durable
relational model. Committed migrations make a fresh Docker startup deterministic,
while Prisma provides a typed data layer for the TypeScript backend.

**Plain React state and Recharts.** This dashboard has one screen and a small
number of data flows, so component state is sufficient. Recharts supplies
responsive SVG charts without introducing a larger application state framework.

**Authentication boundary.** The frontend sends `Bearer development-token`, and
the backend currently accepts any non-empty Bearer token. This demonstrates the
protected API boundary without embedding a fake password database. In production,
the middleware would validate short-lived OAuth/OIDC JWTs and authorize access per
network. The MQTT broker is anonymous only because it is isolated inside this
assignment's Compose network; production MQTT should use client credentials, ACLs,
and TLS.

## API contract

`api_spec.yaml` is the source of truth for the REST and SSE interface. Generated
TypeScript definitions are shared by frontend and backend through
`packages/api-contract`.

Regenerate them after changing the spec:

```bash
npm run api:generate
```

Main endpoints:

```text
GET /health
GET /api/v1/me
GET /api/v1/dashboard/summary
GET /api/v1/sensors
GET /api/v1/sensors/:sensorId/readings
GET /api/v1/sensors/:sensorId/events
GET /api/v1/networks/:networkId/activity
GET /api/v1/realtime/events
```

## Local development

Install dependencies in `backend`, `frontend`, and `packages/api-contract`, then
run the database and broker with Docker. The Vite dev server proxies `/api` to the
backend on port 9000.

Useful checks from the repository root:

```bash
npm run api:generate
npm run backend:typecheck
npm run frontend:typecheck
npm run backend:build
npm run frontend:build
docker compose config
```

After changing `backend/prisma/schema.prisma`, generate a migration and rebuild:

```bash
cd backend
npm run prisma:generate
npx prisma migrate dev --name describe_your_change
```

## Production follow-ups

For a real deployment I would replace the development token middleware with OIDC
verification, secure MQTT, add per-user network authorization and rate limits,
move SSE replay from process memory to Redis, use a production static web server,
and add integration plus browser end-to-end tests.

## AI usage

AI assistance was used to review the assignment, compare architectural options,
scaffold the OpenAPI/TypeScript boundaries, and identify verification cases. The
implementation was kept intentionally small and each generated part was validated
with TypeScript builds, API checks, Docker health checks, and browser inspection.
