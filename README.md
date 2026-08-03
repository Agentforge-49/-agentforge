# AgentForge

AgentForge is a production-oriented AI automation platform for building agents,
workflows, multi-agent systems, connectors, approvals, evaluations, knowledge
bases, organizations, marketplace packages, and developer integrations.

## Live services

- Web app: <https://agentforge-qccm.vercel.app>
- API health: <https://agentforge-api-yml4.onrender.com/health>
- Frontend hosting: Vercel
- API and execution engine: Render
- Authentication and database: Supabase

The Render free service can take up to about a minute to wake after inactivity.
No Railway service is required by the current production architecture.

## Architecture

```text
React/Vite web app (Vercel)
          |
          v
Express API (Render) ----> Supabase Auth + Postgres
          |
          v
FastAPI execution engine (same Render service)
          |
          v
Anthropic API + guarded external tools
```

The browser never receives service-role, encryption, engine, or model-provider
secrets. Connector credentials are encrypted by the API, and agent-controlled
HTTP requests reject private networks, pin validated DNS results, disable
automatic redirects, and limit response sizes.

## Run locally

Requirements: Node.js 22+, Python 3.12+, and a Supabase project.

1. Copy each `.env.example` file to `.env` in `frontend`, `backend`, and
   `engine`. Use development credentials. Never commit `.env` files.
2. Start the engine:

   ```powershell
   cd engine
   python -m pip install -r requirements.txt
   python main.py
   ```

3. Start the API:

   ```powershell
   cd backend
   npm ci
   npm run dev
   ```

4. Start the web app:

   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

Open <http://localhost:5173>. The API defaults to port 3001 and the engine to
port 8000.

## Verify before deployment

```powershell
cd backend
npm test
npm audit --omit=dev

cd ../frontend
npm run lint
npm test
npm run build
npm audit --omit=dev

cd ../engine
python -m compileall -q .
python -m unittest discover -s tests -v
python -m pip check
```

GitHub Actions runs the same checks for every push and pull request. A scheduled
production monitor checks the public frontend, API, and engine health twice per
hour.

## Production configuration

Required API variables include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`FRONTEND_URL`, `AGENT_ENGINE_URL`, `ENGINE_API_KEY`,
`CREDENTIAL_ENCRYPTION_KEY`, `DEVELOPER_WEBHOOK_SIGNING_KEY`, and
`OAUTH_STATE_SECRET`.

The engine requires `ENGINE_API_KEY` and at least one of
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`.
`ENGINE_MAX_CONCURRENCY` defaults to 4. Frontend public variables are
`VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.

Google, Slack, and GitHub consent-based connections additionally require the
matching OAuth client ID and client secret variables shown in
`backend/.env.example`. The credentials page shows these providers as setup
required until both values are configured. Active Google and Slack connections
can be selected directly in workflow connector nodes; expiring access tokens
are refreshed server-side and remain encrypted at rest.

Apply Supabase migrations in filename order before deploying API code that
depends on them. Use the launch-readiness page and recovery snapshots before a
release.

## Known provider dependencies

Real model execution consumes credit from the configured Anthropic, OpenAI, or
Google provider. Live billing, provider OAuth, enterprise SSO/SCIM,
transactional email, and third-party connector calls require the corresponding
provider accounts and credentials. Without them, those paths remain unavailable
or fail closed; the rest of the platform can still be developed and tested
locally.
