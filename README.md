# FTC AutoScout Web

A browser-based recreation of AutoScout 4.1.0. The interface follows the original Tkinter application's burgundy header, left navigation, spreadsheet-style data tables, event workflow, and statistics. The landing page also brings in the public AutoScout site's “Scouting Made Easy” introduction, CAP explanation, and feature overview.

## Branding

The site header uses the original AutoScout gear logo extracted from the uploaded `AutoScout.ico`. The same original icon is installed as the browser favicon (`frontend/public/favicon.ico`).

## Included

- React/Vite frontend with Home, Competition Day, Setup, Teams, Team Research, Matches, My Team, Standings, Alliances, Charts, Win Rate Curve, Analysis, Live Scouting, and Settings.
- FastAPI backend using the original AutoScout 4.1.0 statistical engine and FTCScout REST client.
- Event loading from FTCScout, team and match tables, CAP/OPR/EPA predictions, standings, alliance calculations, manual team overrides, manual match results, settings, and JSON session import/export.
- Browser-session isolation using a per-browser session ID. Each browser gets its own in-memory session.

## Important architecture note

GitHub stores the source code; it does not run this Python API. Deploy the frontend to Vercel (or another static frontend host) and the backend to Render (or another Python host). GitHub Pages alone is not enough for the live FTCScout/API functionality.

The engine file `backend/autoscout_engine.py` is derived from the uploaded `AutoScout.py` 4.1.0. The original calculation, prediction, standings, alliance, FTCScout client, session, and analysis code is retained. Only the Tkinter desktop presentation layer is excluded. The web interface is a new browser UI built around that engine. The browser implementation is not pixel-identical to the desktop app, and some desktop-only workflows may need further porting.

## Run locally

You need Python 3.11+ and Node.js 20+.

### 1. Start the backend

Windows PowerShell:

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend docs: http://localhost:8000/docs

### 2. Start the frontend in a second terminal

```bash
cd frontend
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173).

## Publish through GitHub + Vercel + Render

### A. Put the project on GitHub

1. Create a new GitHub repository, for example `autoscout-web`.
2. Extract this project folder on your computer.
3. In the repository page, choose **Add file → Upload files** and upload the contents of this folder (the `backend` and `frontend` folders, README, and config files). Or use Git:

```bash
git init
git add .
git commit -m "Create AutoScout web app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/autoscout-web.git
git push -u origin main
```

### B. Deploy the Python API on Render

1. Sign in to Render and choose **New → Web Service**.
2. Connect the GitHub repository.
3. Set **Root Directory** to `backend`.
4. Set **Build Command** to `pip install -r requirements.txt`.
5. Set **Start Command** to `uvicorn main:app --host 0.0.0.0 --port $PORT`.
6. Deploy. Copy the service URL, such as `https://autoscout-api.onrender.com`.
7. In Render environment variables, set `CORS_ORIGINS` to your eventual Vercel website URL (for example `https://autoscout-web.vercel.app`). You can temporarily include `http://localhost:5173` for local development.

### C. Deploy the React website on Vercel

1. Sign in to Vercel and import the same GitHub repository.
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Vite**.
4. Add environment variable `VITE_API_URL` with the Render API URL (no trailing slash).
5. Deploy. Vercel will give you a public website URL.
6. Go back to Render and update `CORS_ORIGINS` to include the exact Vercel URL. Redeploy/restart the backend if prompted.

### D. Test it

1. Open your Vercel website.
2. Go to **Setup**.
3. Enter the season, FTCScout event code, your team number, and prediction basis.
4. Select **Load / reload event**.
5. Check Teams, Matches, My Team, Standings, Alliances, Charts, and Analysis.
6. Use **Save session** to download a JSON session backup. **Open session** restores it later.

## Notes and limitations

- A first request on a free backend host may take a little while if the service has gone idle.
- Loading with season history can take longer because the original engine retrieves event/team history from FTCScout.
- Browser sessions are kept in backend memory. If the backend restarts, use your downloaded session JSON to restore your work. For permanent multi-user/team accounts, add a database and authentication before public production use.
- This initial web port includes the primary event workflow, but not every desktop dialog, context menu, live-stream widget, or every setting control has been ported yet. The uploaded Tkinter source remains the reference for those next additions.
- Accuracy figures on the old AutoScout marketing site are historical marketing claims, not a guarantee for any event or season.
