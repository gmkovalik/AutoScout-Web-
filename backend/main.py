from __future__ import annotations
import os, json, threading
from pathlib import Path
from typing import Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import autoscout_engine as engine

app = FastAPI(title="AutoScout API", version="4.1.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
lock = threading.RLock()
sessions: dict[str, engine.Session] = {}
cache_dir = os.getenv("AUTOSCOUT_CACHE", "/tmp/autoscout-cache")

class LoadRequest(BaseModel):
    season: int = 2026
    event_code: str
    my_team: int = 0
    with_history: bool = True
    offline: bool = False
    rating: str = "CAP"

class OverrideRequest(BaseModel):
    team: int
    opr: float | None = None
    auto: float | None = None
    teleop: float | None = None
    endgame: float | None = None
    proj_opr: float | None = None
    epa: float | None = None
    tdc_issue: str | None = None
    tdc_delta: float | None = None
    focus: str | None = None

class ResultRequest(BaseModel):
    match_label: str
    red_score: float
    blue_score: float

class SettingsRequest(BaseModel):
    rating: str | None = None
    faithful: bool | None = None
    epa_live: bool | None = None
    epa_future: bool | None = None
    margin_points: float | None = None

class OpenRequest(BaseModel):
    session: dict[str, Any]

def get_session(request: Request) -> engine.Session:
    sid=request.headers.get("X-Session-ID", "default")
    if sid not in sessions:
        raise HTTPException(409, "Load an event first.")
    return sessions[sid]

def serial(obj):
    if obj is None or isinstance(obj, (str, int, float, bool)): return obj
    if isinstance(obj, dict): return {str(k): serial(v) for k,v in obj.items()}
    if isinstance(obj, (list, tuple)): return [serial(x) for x in obj]
    if hasattr(obj, "to_dict"): return serial(obj.to_dict())
    if hasattr(obj, "__dataclass_fields__"):
        return {k: serial(getattr(obj,k)) for k in obj.__dataclass_fields__}
    if hasattr(obj, "__dict__"): return {k: serial(v) for k,v in vars(obj).items() if not k.startswith('_')}
    return str(obj)

def snapshot(s: engine.Session):
    correct, decided = s.accuracy()
    preds=[]
    for p in s.predictions:
        m=p.match
        preds.append({"label":m.label,"number":m.number,"level":m.level,"red":list(m.red),"blue":list(m.blue),
          "played":m.played,"red_score":m.red_score,"blue_score":m.blue_score,"red_score_np":m.red_score_np,"blue_score_np":m.blue_score_np,
          "red_pts":p.red_pts,"blue_pts":p.blue_pts,"margin":p.margin,"winner":p.winner,"actual_winner":m.winner,
          "red_cow":p.red_cow,"blue_cow":p.blue_cow,"red_strength":p.red_strength,"blue_strength":p.blue_strength,"correct":p.correct})
    teams=[]
    for t in s.teams_by_cap(): teams.append(serial(t))
    standings=[serial(x) for x in s.table]
    rep=s.alliance_report()
    def alliance_row(a):
        d=serial(a); d.update({"label":a.label,"win_rate":a.win_rate,"cow":a.cow,"margin":a.margin,"unbeatable":a.unbeatable}); return d
    def seat_row(x):
        d=serial(x); d.update({"likely_pick":x.pick,"pick_above":x.bar}); return d
    alliances={"my_team":rep.my_team,"my_rank":rep.my_rank,"my_cap":rep.my_cap,"bar":rep.bar,
      "seats":[seat_row(x) for x in rep.seats],"table":[alliance_row(x) for x in rep.table[:300]],"partners":[alliance_row(x) for x in rep.partners],
      "qualifying":[alliance_row(x) for x in rep.qualifying],"average_total":rep.average_total}
    try:
        analysis=serial(engine.analyze(s))
    except Exception as e: analysis={"error":str(e)}
    return {"version":engine.__version__,"loaded":s.loaded,"season":s.season,"event_code":s.event_code,
      "event_name":s.event_name,"event_info":serial(s.event_info),"my_team":s.my_team,"rating":s.basis,
      "warnings":s.warnings,"loaded_at":s.loaded_at,"team_count":len(s.teams),"match_count":len(s.matches),
      "played_count":sum(1 for m in s.matches if m.played),"accuracy":{"correct":correct,"decided":decided,"percent":round(correct/decided*100,1) if decided else None},
      "teams":teams,"matches":preds,"standings":standings,"my_summary":serial(s.my_summary()),"alliances":alliances,
      "analysis":analysis,"settings":s.settings.to_dict(),"session":s.to_dict()}

@app.get("/api/health")
def health(): return {"ok":True,"version":engine.__version__}

@app.get("/api/state")
def state(request: Request):
    s=sessions.get(request.headers.get("X-Session-ID", "default"))
    return snapshot(s) if s else {"loaded":False,"version":engine.__version__}

@app.post("/api/load")
def load(req: LoadRequest, request: Request):
    try:
        with lock:
            s=engine.Session(season=req.season,event_code=req.event_code.strip().upper(),my_team=req.my_team)
            s.settings.rating=req.rating.upper() if req.rating.upper() in engine.RATINGS else "CAP"
            client=engine.FTCScoutClient(cache_dir=cache_dir,offline=req.offline)
            s.load(client,with_history=req.with_history)
            sessions[request.headers.get("X-Session-ID", "default")]=s
            return snapshot(s)
    except engine.ApiError as e: raise HTTPException(400,e.user_message)
    except Exception as e: raise HTTPException(500,str(e))

@app.post("/api/open")
def open_session(req: OpenRequest, request: Request):
    try:
        with lock:
            s=engine.Session.from_dict(req.session)
            sessions[request.headers.get("X-Session-ID", "default")]=s
            return snapshot(s)
    except Exception as e: raise HTTPException(400,f"Could not open session: {e}")

@app.post("/api/refresh")
def refresh(request: Request):
    s=get_session(request)
    try:
        with lock: s.refresh_results(engine.FTCScoutClient(cache_dir=cache_dir)); return snapshot(s)
    except engine.ApiError as e: raise HTTPException(400,e.user_message)

@app.post("/api/override")
def override(req: OverrideRequest, request: Request):
    s=get_session(request)
    if req.team not in s.teams: raise HTTPException(404,"Team is not in this event.")
    with lock:
        m=s.manual_for(req.team)
        for key in ("opr","auto","teleop","endgame","proj_opr","epa","tdc_issue","tdc_delta","focus"):
            v=getattr(req,key)
            if v is not None: setattr(m,key,v)
        s.compute(); return snapshot(s)

@app.delete("/api/override/{team}")
def clear_override(team:int, request: Request):
    s=get_session(request)
    with lock: s.manual.pop(team,None); s.compute(); return snapshot(s)

@app.post("/api/result")
def result(req:ResultRequest, request: Request):
    s=get_session(request)
    with lock:
        s.manual_results[req.match_label]=(req.red_score,req.blue_score); s.compute(); return snapshot(s)

@app.post("/api/settings")
def settings(req:SettingsRequest, request: Request):
    s=get_session(request)
    with lock:
        for k,v in req.model_dump(exclude_none=True).items(): setattr(s.settings,k,v)
        s.compute(); return snapshot(s)

@app.get("/api/export")
def export_session(request: Request): return get_session(request).to_dict()

@app.get("/api/research/{team_number}")
def research_team(team_number:int):
    try:
        client=engine.FTCScoutClient(cache_dir=cache_dir)
        return {"team":client.team(team_number),"quick_stats":client.quick_stats(team_number,2026),
                "events":client.team_events(team_number,2026),
                "awards":client.team_awards(team_number,2026)}
    except engine.ApiError as e: raise HTTPException(404,e.user_message)
