# IoT Sensor Dashboard

A full-stack dashboard for historical and live home sensor data.

## Quickstart

From a fresh clone, the complete stack starts with one command:

```bash
docker compose up
```

Open http://localhost:3000. The API and its health endpoint are available at
http://localhost:9000 and http://localhost:9000/health. An unauthenticated browser
is redirected to the hosted Auth0 Universal Login page. Every successfully
authenticated Auth0 account can currently access the dashboard.

The repository includes a tracked `.env` containing the demo PostgreSQL and Auth0
configuration, so a fresh clone needs no additional environment setup. Docker
Compose reads it automatically and fails fast when a required value is missing.
The Auth0 domain, SPA client ID, and API audience are public identifiers; the Auth0
client secret is deliberately not used or stored. Replace these demo values before
reusing the project for another environment.

On the first startup, the backend applies committed Prisma migrations and runs an
idempotent `loadInitialData()` import for `data/sensors.json` and
`data/activity.json`. Later restarts reuse the PostgreSQL volume and skip the
completed import. Stop the services with `docker compose down`; add `-v` only when
you intentionally want to delete the local database.

## What is included

- Current temperature, humidity, motion activity, door activity, and sensor status
- Historical temperature/humidity and activity charts with selectable time ranges
- Live chart and card updates from the MQTT simulator over authenticated SSE
- OIDC Authorization Code flow with PKCE, token refresh, and sign-out
- Backend JWT validation against the Auth0 issuer, API audience, and JWKS
- Automatic SSE reconnect with exponential backoff and `Last-Event-ID` replay
- Recent door detection timeline and meaningful loading, empty, and error states
- A lightweight comfort/trend insight based on temperature and relative humidity
- Responsive desktop, tablet, and mobile layout

## Architecture

```text
Browser -> Auth0 Universal Login -> API access token -> React
                                                     |
Python simulator -> EMQX -> Node.js/Express <-> Auth0 JWKS
                                  |
                                  +-> PostgreSQL/Prisma
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

**OIDC authentication.** Auth0 handles passwords and user sessions; the React SPA
uses the Authorization Code flow with PKCE and never stores a client secret. It
sends a short-lived, API-specific access token in the existing Bearer header.
Express validates the token's RS256 signature, issuer, expiry, and audience locally
using Auth0's cached JWKS. There is intentionally no role gate yet, so any valid
account is a viewer. The MQTT broker is anonymous only because it is isolated inside
this assignment's Compose network; production MQTT should use client credentials,
ACLs, and TLS.

## Authentication configuration

Auth0 provides the hosted login, password storage, account management, password
reset, and optional social connections. In the Auth0 Application settings, add
`http://localhost:3000` to **Allowed Callback URLs**, **Allowed Logout URLs**, and
**Allowed Web Origins**. Then create an Auth0 Custom API named
`iot-sensor-dashboard-api` with Identifier `https://iot-sensor-dashboard-api` and
Signing Algorithm **RS256**. The Identifier is the OAuth audience; it is only an
identifier and does not need to resolve to a website.

The Auth0 variables in the root `.env` are:

```text
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-spa-client-id
VITE_AUTH0_AUDIENCE=https://your-api-identifier
```

These are identifiers, not secrets. The SPA redirects to Auth0, requests an access
token for the configured API audience, and holds it in memory. Express validates
that JWT locally and fetches Auth0's JWKS only when needed, so REST requests and SSE
reconnects do not call UserInfo. For a deployed frontend, add its HTTPS URL to the
same three Auth0 Application URL lists.

## API contract

`api_spec.yaml` is the source of truth for the REST and SSE interface. OpenAPI
Generator produces the shared TypeScript models and Fetch client in
`packages/api-contract`.

Regenerate them after changing the spec:

```bash
npm run api:generate
```

Client generation uses the pinned `openapitools/openapi-generator-cli:v7.24.0`
Docker image, so it requires Docker but does not require a local Java installation.
The generated TypeScript source in `packages/api-contract/src/generated` is checked
in; do not edit it directly. The compiled client in `packages/api-contract/dist` is
recreated from that source during Docker builds and by `npm run api:generate`, so a
fresh clone never depends on ignored local build artifacts.

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

For a real deployment I would require verified email/MFA as appropriate, add
per-user network authorization and rate limits, secure MQTT, move SSE replay from
process memory to Redis, use a production static web server, and add integration
plus browser end-to-end tests.

## AI usage

AI assistance was used to review the assignment, compare architectural options,
scaffold the OpenAPI/TypeScript boundaries, and identify verification cases. The
implementation was kept intentionally small and each generated part was validated
with TypeScript builds, API checks, Docker health checks, and browser inspection.
