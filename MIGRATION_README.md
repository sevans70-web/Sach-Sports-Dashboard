# Sach Sports Next.js Migration Foundation

This repository now contains two isolated applications:

- The existing Streamlit application remains at the repository root and is unchanged.
- The new Next.js preview foundation is in `frontend/`.

## Safety rule

Do not change the existing Railway production service root directory or start command. Create a second Railway service for the preview only after the package has been uploaded to a non-production GitHub branch.

## Preview service configuration

- Root directory: `/frontend`
- Builder: Railpack
- Build command: `npm run build`
- Start command: `npm run start`
- Healthcheck path: `/`

## Migration sequence

1. Approve the shared Sport Hub and WNBA information architecture.
2. Expose existing Python calculations through a stable API layer.
3. Move persistent rankings, movement and grading into one PostgreSQL schema.
4. Connect live WNBA data to the approved interface.
5. Migrate remaining sports one at a time without duplicating layout code.

## Current audit findings

- Production runs Streamlit directly from `app.py`.
- Production deploys automatically from GitHub `main`.
- Navigation and selected players/games depend heavily on temporary Streamlit session state.
- Persistence is split across Supabase tables, repository JSON files and temporary `/tmp` files.
- A Railway PostgreSQL service exists, but this repository's database connector targets Supabase.
- There is no production healthcheck or scheduled refresh configured on the dashboard service.

No database, API keys, production commands or current pages are modified by this foundation.
