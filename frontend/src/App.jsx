
import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ScatterChart, Scatter, ZAxis, BarChart, Bar
} from 'recharts';
import {
  Activity, Home as House, Settings, Users, CalendarDays,
  ChartNoAxesCombined, Trophy, Swords, ClipboardList, Radio,
  Search, RefreshCw, Download, Upload, ChevronRight, Menu, X,
  Info, ExternalLink, Target, BookOpen, SlidersHorizontal, Save
} from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const SESSION_ID = (() => {
  let id = localStorage.getItem('autoscout-session-id');
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : `as-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('autoscout-session-id', id);
  }
  return id;
})();

const NAV = [
  ['Home', House],
  ['Competition Day', CalendarDays],
  ['Setup', SlidersHorizontal],
  ['Teams', Users],
  ['Team Research', Search],
  ['Matches', ClipboardList],
  ['My Team', Target],
  ['Standings', Trophy],
  ['Alliances', Swords],
  ['Charts', ChartNoAxesCombined],
  ['Win Rate Curve', Activity],
  ['Analysis', BookOpen],
  ['Live Scouting', Radio],
  ['Settings', Settings]
];

const fmt = (v, d = 1) =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v))
    ? 'n/a'
    : Number(v).toFixed(d);

const pct = v =>
  v === null || v === undefined
    ? 'n/a'
    : `${Math.round(Number(v) * 100)}%`;

const safeArray = value => Array.isArray(value) ? value : [];

function App() {
  const [tab, setTab] = useState('Home');
  const [state, setState] = useState({ loaded: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mobile, setMobile] = useState(false);

  const [season, setSeason] = useState(2026);
  const [event, setEvent] = useState('');
  const [myTeam, setMyTeam] = useState(0);
  const [rating, setRating] = useState('CAP');
  const [history, setHistory] = useState(true);

  const [filter, setFilter] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [searchTeam, setSearchTeam] = useState('');
  const [research, setResearch] = useState(null);
  const [edit, setEdit] = useState({});
  const [matchFilter, setMatchFilter] = useState('All');
  const [resultEdit, setResultEdit] = useState({});

  async function request(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': SESSION_ID,
        ...(opts.headers || {})
      }
    });

    const data = await res.json().catch(() => ({
      detail: 'Unexpected server response'
    }));

    if (!res.ok) {
      throw new Error(data.detail || 'Request failed');
    }

    return data;
  }

  async function loadEvent(e) {
    e?.preventDefault();
    setBusy(true);
    setError('');

    try {
      const d = await request('/api/load', {
        method: 'POST',
        body: JSON.stringify({
          season: Number(season),
          event_code: event,
          my_team: Number(myTeam) || 0,
          with_history: history,
          rating
        })
      });

      setState(d);
      setTab('Competition Day');
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError('');

    try {
      setState(await request('/api/refresh', {
        method: 'POST'
      }));
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function mutate(path, method = 'POST', body) {
    setBusy(true);
    setError('');

    try {
      setState(await request(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body)
      }));
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    request('/api/state')
      .then(setState)
      .catch(() => {});
  }, []);

  const teams = safeArray(state.teams);
  const matches = safeArray(state.matches);
  const standings = safeArray(state.standings);
  const alliances = state.alliances || {};

  const filteredTeams = useMemo(
    () => teams.filter(t =>
      `${t.number} ${t.name || ''}`.toLowerCase().includes(filter.toLowerCase())
    ),
    [teams, filter]
  );

  const filteredMatches = matches.filter(m =>
    matchFilter === 'All' ||
    (matchFilter === 'Played' ? m.played : !m.played)
  );

  const team =
    teams.find(t => Number(t.number) === Number(selectedTeam)) ||
    teams.find(t => Number(t.number) === Number(state.my_team));

  const openFile = async e => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const d = JSON.parse(await f.text());

      setState(await request('/api/open', {
        method: 'POST',
        body: JSON.stringify({ session: d })
      }));

      setTab('Competition Day');
    } catch (x) {
      setError(`Could not open session: ${x.message}`);
    }

    e.target.value = '';
  };

  const download = () => {
    if (!state.session) return;

    const a = document.createElement('a');
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify(state.session, null, 2)],
        { type: 'application/json' }
      )
    );

    a.href = url;
    a.download = `autoscout_${state.season || 'session'}_${state.event_code || 'event'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doResearch = async e => {
    e?.preventDefault();

    if (!Number(searchTeam)) return;

    setResearch({ loading: true });

    try {
      setResearch(await request(`/api/research/${Number(searchTeam)}`));
    } catch (x) {
      setResearch({ error: x.message });
    }
  };

  const applyEdit = () => mutate('/api/override', 'POST', {
    team: Number(selectedTeam),
    ...Object.fromEntries(
      Object.entries(edit)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => [
          k,
          ['tdc_issue', 'focus'].includes(k) ? v : Number(v)
        ])
    )
  });

  const saveResult = m => mutate('/api/result', 'POST', {
    match_label: m.label,
    red_score: Number(resultEdit[`${m.label}-r`]),
    blue_score: Number(resultEdit[`${m.label}-b`])
  });

  const tabTitle =
    tab === 'Win Rate Curve' ? 'Alliance Win Rate Curve' : tab;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/AutoScout.ico" alt="AutoScout original gear logo" />
          </div>

          <div>
            <div className="brand-title">FTC <b>AutoScout</b></div>
            <div className="brand-tag">Scouting Made Easy</div>
          </div>
        </div>

        <div className="top-meta">
          <span className="live-dot" />
          {state.loaded
            ? `${state.event_name || state.event_code} · ${state.season}`
            : 'No event loaded'}

          <button
            className="icon-btn mobile-toggle"
            onClick={() => setMobile(!mobile)}
            aria-label="Toggle navigation"
          >
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className={`sidebar ${mobile ? 'show' : ''}`}>
          <div className="nav-caption">WORKSPACE</div>

          {NAV.map(([name, Icon], i) => (
            <button
              key={name}
              onClick={() => {
                setTab(name);
                setMobile(false);
              }}
              className={`nav-item ${tab === name ? 'active' : ''} ${i === 1 ? 'nav-gap' : ''}`}
            >
              <Icon size={16} />
              <span>{name}</span>
              {name === 'Settings' && <span className="nav-spacer" />}
            </button>
          ))}

          <div className="sidebar-foot">
            <div className="version">AUTOSCOUT WEB · v4.1.0</div>
            <a
              href="https://sites.google.com/smca.com/autoscout/home?authuser=0"
              target="_blank"
              rel="noreferrer"
            >
              About AutoScout <ExternalLink size={12} />
            </a>
          </div>
        </aside>

        <main className="main">
          <div className="page-head">
            <div>
              <div className="eyebrow">FTC ROBOTICS SCOUTING</div>
              <h1>{tabTitle}</h1>
              <p>
                {tab === 'Home'
                  ? 'Scouting made easy. Make smarter decisions with match predictions and team statistics.'
                  : state.loaded
                    ? `${state.event_name || state.event_code} · ${state.team_count} teams · ${state.match_count} matches`
                    : 'Load an FTC event to get started.'}
              </p>
            </div>

            <div className="head-actions">
              <label className="secondary-btn upload-btn">
                <Upload size={15} /> Open session
                <input
                  type="file"
                  accept="application/json"
                  onChange={openFile}
                />
              </label>

              <button
                className="secondary-btn"
                onClick={download}
                disabled={!state.loaded || !state.session}
              >
                <Download size={15} /> Save session
              </button>

              {state.loaded && (
                <button
                  className="primary-btn"
                  onClick={refresh}
                  disabled={busy}
                >
                  <RefreshCw
                    size={15}
                    className={busy ? 'spin' : ''}
                  />
                  Refresh
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="alert error">
              <Info size={17} />
              {error}
              <button onClick={() => setError('')}>Dismiss</button>
            </div>
          )}

          {busy && (
            <div className="loading">
              <span />
              Contacting FTCScout / calculating predictions…
            </div>
          )}

          {tab === 'Home' && (
            <Home
              state={state}
              setTab={setTab}
              season={season}
              setSeason={setSeason}
              event={event}
              setEvent={setEvent}
              myTeam={myTeam}
              setMyTeam={setMyTeam}
              rating={rating}
              setRating={setRating}
              history={history}
              setHistory={setHistory}
              loadEvent={loadEvent}
              busy={busy}
            />
          )}

          {tab === 'Competition Day' && (
            <Competition state={state} setTab={setTab} refresh={refresh} />
          )}

          {tab === 'Setup' && (
            <Setup
              season={season}
              setSeason={setSeason}
              event={event}
              setEvent={setEvent}
              myTeam={myTeam}
              setMyTeam={setMyTeam}
              rating={rating}
              setRating={setRating}
              history={history}
              setHistory={setHistory}
              loadEvent={loadEvent}
              busy={busy}
              state={state}
            />
          )}

          {tab === 'Teams' && (
            <Teams
              teams={filteredTeams}
              filter={filter}
              setFilter={setFilter}
              onSelect={n => {
                setSelectedTeam(n);
                setEdit({});
              }}
              selectedTeam={selectedTeam}
              state={state}
            />
          )}

          {tab === 'Team Research' && (
            <Research
              searchTeam={searchTeam}
              setSearchTeam={setSearchTeam}
              research={research}
              doResearch={doResearch}
            />
          )}

          {tab === 'Matches' && (
            <Matches
              matches={filteredMatches}
              matchFilter={matchFilter}
              setMatchFilter={setMatchFilter}
              resultEdit={resultEdit}
              setResultEdit={setResultEdit}
              saveResult={saveResult}
            />
          )}

          {tab === 'My Team' && (
            <MyTeam state={state} setTab={setTab} />
          )}

          {tab === 'Standings' && (
            <Standings standings={standings} />
          )}

          {tab === 'Alliances' && (
            <Alliances alliances={alliances} myTeam={state.my_team} />
          )}

          {tab === 'Charts' && (
            <Charts teams={teams} matches={matches} />
          )}

          {tab === 'Win Rate Curve' && (
            <WinRate alliances={alliances} />
          )}

          {tab === 'Analysis' && (
            <Analysis report={state.analysis} accuracy={state.accuracy} />
          )}

          {tab === 'Live Scouting' && (
            <Live
              matches={matches}
              refresh={refresh}
              resultEdit={resultEdit}
              setResultEdit={setResultEdit}
              saveResult={saveResult}
            />
          )}

          {tab === 'Settings' && (
            <SettingsPage state={state} mutate={mutate} busy={busy} />
          )}

          {selectedTeam && tab === 'Teams' && (
            <TeamDrawer
              team={team}
              close={() => setSelectedTeam(null)}
              edit={edit}
              setEdit={setEdit}
              applyEdit={applyEdit}
              clear={() => mutate(`/api/override/${selectedTeam}`, 'DELETE')}
            />
          )}

          <footer className="footer">
            <span>FTC AutoScout · Scouting Made Easy</span>
            <span>
              Built for FIRST Tech Challenge teams ·{' '}
              <a
                href="https://sites.google.com/smca.com/autoscout/home?authuser=0"
                target="_blank"
                rel="noreferrer"
              >
                Original AutoScout site
              </a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Home({
  state, setTab, season, setSeason, event, setEvent,
  myTeam, setMyTeam, rating, setRating, history,
  setHistory, loadEvent, busy
}) {
  return (
    <div className="home-wrap">
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">FTC AUTOSCOUT · SCOUTING MADE EASY</div>
          <h2>Know the field.<br /><em>Predict the match.</em></h2>
          <p>
            AutoScout combines FTC statistics, historical performance,
            and match schedules to help your team scout smarter and spend
            time where it matters.
          </p>
          <button className="hero-btn" onClick={() => setTab('Setup')}>
            Load an event <ChevronRight size={17} />
          </button>
        </div>

        <div className="hero-stat">
          <div className="hero-stat-label">YOUR EVENT SNAPSHOT</div>
          <div className="hero-stat-number">
            {state.loaded ? state.team_count : '—'}
          </div>
          <div className="hero-stat-caption">Teams in the current event</div>
          <div className="hero-stat-divider" />
          <div className="hero-stat-row">
            <span>Matches</span>
            <b>{state.loaded ? state.match_count : '—'}</b>
          </div>
          <div className="hero-stat-row">
            <span>Prediction basis</span>
            <b>{state.loaded ? state.rating : 'CAP'}</b>
          </div>
        </div>
      </section>

      <section className="quick-load panel">
        <div className="section-heading">
          <div>
            <div className="eyebrow">GET STARTED</div>
            <h3>Load your competition</h3>
          </div>
          <span className="muted">Powered by FTCScout data</span>
        </div>

        <form className="load-grid" onSubmit={loadEvent}>
          <label>
            Season
            <input
              type="number"
              value={season}
              onChange={e => setSeason(e.target.value)}
              min="2019"
              max="2035"
            />
          </label>

          <label>
            Event code
            <input
              value={event}
              onChange={e => setEvent(e.target.value.toUpperCase())}
              placeholder="e.g. USTXCLRM1"
              required
            />
          </label>

          <label>
            Your team number
            <input
              type="number"
              value={myTeam}
              onChange={e => setMyTeam(e.target.value)}
              placeholder="Optional"
            />
          </label>

          <label>
            Prediction basis
            <select value={rating} onChange={e => setRating(e.target.value)}>
              <option>CAP</option>
              <option>OPR</option>
              <option>EPA</option>
            </select>
          </label>

          <label className="check-label">
            <input
              type="checkbox"
              checked={history}
              onChange={e => setHistory(e.target.checked)}
            />
            Load season history
          </label>

          <button className="primary-btn load-submit" disabled={busy}>
            Load event <ChevronRight size={16} />
          </button>
        </form>
      </section>

      <div className="feature-grid">
        <Feature
          icon={<Target />}
          title="Calculated Average Points"
          text="CAP combines OPR, team history, and AutoScout's adjustments to estimate current scoring strength."
        />
        <Feature
          icon={<Swords />}
          title="Alliance strategy"
          text="Compare possible partners, draft outcomes, alliance strength, and the teams you could beat."
        />
        <Feature
          icon={<ChartNoAxesCombined />}
          title="Scouting intelligence"
          text="Explore team trends, match predictions, win probabilities, and prediction accuracy."
        />
      </div>

      <section className="about-strip">
        <div>
          <div className="eyebrow">WHY AUTOSCOUT?</div>
          <h3>More than a ranking.</h3>
          <p>
            OPR can be affected by the teams a robot has played with.
            AutoScout's CAP is designed to add context and help reveal
            the performance behind the number. Use multiple statistics
            and your own scouting observations together.
          </p>
        </div>

        <div className="about-facts">
          <div><b>CAP</b><span>Calculated Average Points</span></div>
          <div><b>OPR</b><span>Offensive Power Rating</span></div>
          <div><b>EPA</b><span>Expected Points Added</span></div>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }) {
  return (
    <div className="feature panel">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Setup({
  season, setSeason, event, setEvent, myTeam, setMyTeam,
  rating, setRating, history, setHistory, loadEvent, busy, state
}) {
  return (
    <div className="panel form-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">EVENT CONFIGURATION</div>
          <h3>FTCScout connection</h3>
        </div>
        <span className="status-pill"><i /> Public API</span>
      </div>

      <p className="muted">
        Enter the season and official FTCScout event code. Loading with
        history adds earlier events for projected OPR and EPA warm-up.
      </p>

      <form className="setup-grid" onSubmit={loadEvent}>
        <label>
          Season
          <input type="number" value={season} onChange={e => setSeason(e.target.value)} />
        </label>

        <label>
          Event code
          <input
            value={event}
            onChange={e => setEvent(e.target.value.toUpperCase())}
            placeholder="USTXCLRM1"
            required
          />
        </label>

        <label>
          My team
          <input type="number" value={myTeam} onChange={e => setMyTeam(e.target.value)} />
        </label>

        <label>
          Prediction rating
          <select value={rating} onChange={e => setRating(e.target.value)}>
            <option>CAP</option>
            <option>OPR</option>
            <option>EPA</option>
          </select>
        </label>

        <label className="check-label">
          <input
            type="checkbox"
            checked={history}
            onChange={e => setHistory(e.target.checked)}
          />
          Include season history
        </label>

        <button className="primary-btn" disabled={busy}>
          Load / reload event
        </button>
      </form>

      {state.loaded && (
        <div className="loaded-info">
          <b>Currently loaded:</b> {state.event_name} ({state.event_code})
          · {state.team_count} teams · {state.match_count} matches
        </div>
      )}
    </div>
  );
}

function Competition({ state, setTab, refresh }) {
  if (!state.loaded) {
    return (
      <Empty
        title="No competition loaded"
        text="Load an event in Setup to see the competition-day overview."
        action={() => setTab('Setup')}
      />
    );
  }

  return (
    <>
      <div className="metric-grid">
        <Metric label="Teams" value={state.team_count} />
        <Metric label="Matches" value={state.match_count} />
        <Metric label="Played" value={state.played_count} />
        <Metric
          label="Prediction accuracy"
          value={state.accuracy?.percent == null ? '—' : `${state.accuracy.percent}%`}
          sub={`${state.accuracy?.correct || 0}/${state.accuracy?.decided || 0} decided calls`}
        />
      </div>

      <div className="two-col">
        <div className="panel">
          <Section title="Competition overview" />
          <div className="overview-list">
            <Row label="Event" value={state.event_name} />
            <Row label="Event code" value={state.event_code} />
            <Row label="Season" value={state.season} />
            <Row label="Prediction basis" value={state.rating} />
            <Row label="Last loaded" value={state.loaded_at || '—'} />
          </div>
          <button className="secondary-btn wide" onClick={refresh}>
            <RefreshCw size={15} /> Refresh match results
          </button>
        </div>

        <div className="panel">
          <Section title="Quick navigation" />
          {[
            ['Teams', 'Explore team ratings and editable statistics'],
            ['Matches', 'Review predictions and enter actual scores'],
            ['My Team', 'See your team’s event outlook'],
            ['Alliances', 'Explore partner combinations'],
            ['Analysis', 'Review prediction accuracy and misses']
          ].map(([t, d]) => (
            <button className="quick-link" onClick={() => setTab(t)} key={t}>
              <span><b>{t}</b><small>{d}</small></span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </div>

      {state.warnings?.length > 0 && (
        <div className="panel warning-panel">
          <b>Loading notes</b>
          {state.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}
    </>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="metric panel">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="overview-row">
      <span>{label}</span>
      <b>{value ?? '—'}</b>
    </div>
  );
}

function Section({ title, extra }) {
  return (
    <div className="section-heading">
      <h3>{title}</h3>
      {extra}
    </div>
  );
}

function Empty({ title, text, action }) {
  return (
    <div className="empty panel">
      <div className="empty-icon"><Activity /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="primary-btn" onClick={action}>Go to Setup</button>
    </div>
  );
}

function Teams({ teams, filter, setFilter, onSelect, state }) {
  if (!state.loaded) {
    return (
      <Empty
        title="Load an event first"
        text="Team rankings will appear here once FTCScout data has loaded."
        action={() => {}}
      />
    );
  }

  return (
    <div className="panel table-panel">
      <div className="section-heading">
        <div>
          <h3>Team performance</h3>
          <p className="muted">Select a team to view charts and edit its data inputs.</p>
        </div>

        <div className="searchbox">
          <Search size={15} />
          <input
            placeholder="Search team or name…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {['#', 'Team', 'Name', 'OPR', 'Auto', 'Teleop', 'Endgame', 'AVG', 'NEW AVG', 'Proj OPR', 'Events', 'EPA', 'CAP', 'CAP Δ'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {teams.map((t, i) => (
              <tr
                key={t.number}
                onClick={() => onSelect(t.number)}
                className="click-row"
              >
                <td>{i + 1}</td>
                <td className="team-num">
                  {t.number}
                  {t.edited && <span className="edited-dot" />}
                </td>
                <td>{t.name || '—'}</td>
                <td>{fmt(t.opr)}</td>
                <td>{fmt(t.auto)}</td>
                <td>{fmt(t.teleop)}</td>
                <td>{fmt(t.endgame)}</td>
                <td>{fmt(t.avg)}</td>
                <td>{fmt(t.new_avg)}</td>
                <td>{fmt(t.proj_opr)}</td>
                <td>{t.events_played}</td>
                <td>{fmt(t.epa)}</td>
                <td className="strong-cell">{fmt(t.cap)}</td>
                <td>{fmt(t.cap_minus_opr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-foot">
        Showing {teams.length} teams · Sorted by CAP
      </div>
    </div>
  );
}

function TeamDrawer({ team, close, edit, setEdit, applyEdit, clear }) {
  if (!team) return null;

  const fields = [
    ['opr', 'OPR'],
    ['auto', 'Auto'],
    ['teleop', 'Teleop'],
    ['endgame', 'Endgame'],
    ['proj_opr', 'Projected OPR'],
    ['epa', 'EPA']
  ];

  return (
    <div className="drawer-backdrop" onClick={close}>
      <aside className="team-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="eyebrow">TEAM PROFILE</div>
            <h2>{team.number} {team.name}</h2>
          </div>
          <button className="icon-btn" onClick={close}><X /></button>
        </div>

        <div className="drawer-metrics">
          <div><span>OPR</span><b>{fmt(team.opr)}</b></div>
          <div><span>CAP</span><b>{fmt(team.cap)}</b></div>
          <div><span>EPA</span><b>{fmt(team.epa)}</b></div>
        </div>

        <h3>Edit this team's data inputs</h3>
        <p className="muted">
          Leave a field blank to use FTCScout's value. Apply recalculates
          predictions and standings.
        </p>

        <div className="edit-grid">
          {fields.map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                type="number"
                step="any"
                placeholder={fmt(team[k])}
                value={edit[k] ?? ''}
                onChange={e => setEdit({ ...edit, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>

        <button className="primary-btn wide" onClick={applyEdit}>
          <Save size={15} /> Apply changes
        </button>

        <button className="secondary-btn wide" onClick={clear}>
          Reset to FTCScout
        </button>

        <div className="drawer-note">
          Overrides are stored in the current session. Save the session JSON
          to keep your work.
        </div>
      </aside>
    </div>
  );
}

function Matches({
  matches, matchFilter, setMatchFilter,
  resultEdit, setResultEdit, saveResult
}) {
  return (
    <div className="panel table-panel">
      <div className="section-heading">
        <div>
          <h3>Match predictions</h3>
          <p className="muted">Predicted scores, win probability, and actual results.</p>
        </div>

        <select
          className="compact-select"
          value={matchFilter}
          onChange={e => setMatchFilter(e.target.value)}
        >
          <option>All</option>
          <option>Played</option>
          <option>Upcoming</option>
        </select>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {['Match', 'Red alliance', 'Blue alliance', 'Red predicted', 'Blue predicted', 'Red win %', 'Blue win %', 'Prediction', 'Actual', 'Enter result'].map(x => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {matches.map(m => {
              const winner = String(m.winner || '—').toLowerCase();

              return (
                <tr key={m.label} className={m.played ? 'played-row' : ''}>
                  <td className="team-num">{m.label}</td>
                  <td>{safeArray(m.red).join(' · ')}</td>
                  <td>{safeArray(m.blue).join(' · ')}</td>
                  <td>{fmt(m.red_pts)}</td>
                  <td>{fmt(m.blue_pts)}</td>
                  <td>{pct(m.red_cow)}</td>
                  <td>{pct(m.blue_cow)}</td>
                  <td>
                    <span className={`winner ${winner}`}>
                      {m.winner || '—'}
                    </span>
                  </td>
                  <td>
                    {m.actual_winner || '—'}
                    {m.played && (
                      <small className="score-small">
                        {' '}{fmt(m.red_score, 0)}–{fmt(m.blue_score, 0)}
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="result-entry">
                      <input
                        aria-label="Red score"
                        placeholder="R"
                        value={resultEdit[`${m.label}-r`] ?? ''}
                        onChange={e => setResultEdit({
                          ...resultEdit,
                          [`${m.label}-r`]: e.target.value
                        })}
                      />
                      <input
                        aria-label="Blue score"
                        placeholder="B"
                        value={resultEdit[`${m.label}-b`] ?? ''}
                        onChange={e => setResultEdit({
                          ...resultEdit,
                          [`${m.label}-b`]: e.target.value
                        })}
                      />
                      <button onClick={() => saveResult(m)} title="Save result">
                        <Save size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="table-foot">
        {matches.length} matches · Enter a red and blue score to record a result
      </div>
    </div>
  );
}

function MyTeam({ state, setTab }) {
  if (!state.loaded) {
    return (
      <Empty
        title="Load an event first"
        text="Your team's statistics and matches will appear here."
        action={() => setTab('Setup')}
      />
    );
  }

  const s = state.my_summary || {};
  const t = s.stats || {};

  return (
    <>
      <div className="panel myteam-head">
        <div>
          <div className="eyebrow">MY TEAM</div>
          <h2>{s.team || state.my_team} <span>{t.name || ''}</span></h2>
          <p className="muted">Event performance and upcoming match outlook</p>
        </div>

        <div className="rank-badge">
          <small>PROJECTED RANK</small>
          <b>#{s.rank || '—'}</b>
        </div>
      </div>

      <div className="metric-grid">
        {[
          ['OPR', t.opr],
          ['Auto', t.auto],
          ['Teleop', t.teleop],
          ['Endgame', t.endgame],
          ['CAP', t.cap],
          ['EPA', t.epa]
        ].map(([l, v]) => (
          <Metric key={l} label={l} value={fmt(v)} />
        ))}
      </div>

      <div className="panel table-panel">
        <Section title="My matches" />
        <table>
          <thead>
            <tr>
              {['Match', 'Alliance', 'Partner', 'Opponents', 'Chance of winning', 'Predicted', 'Actual'].map(x => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {safeArray(s.matches).map((m, i) => {
              const p = m.prediction || m;

              return (
                <tr key={i}>
                  <td>{p.match?.label || p.label}</td>
                  <td>{m.color || '—'}</td>
                  <td>{safeArray(m.partner).join(', ')}</td>
                  <td>{safeArray(m.opponents).join(', ')}</td>
                  <td>{pct(m.cow)}</td>
                  <td>{m.predicted_win ? 'Win' : 'Loss'}</td>
                  <td>{m.actual || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Standings({ standings }) {
  return (
    <div className="panel table-panel">
      <Section title="Projected standings" />

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {['Rank', 'Team', 'Name', 'Wins', 'Losses', 'Played', 'Scheduled', 'TBP 1 · Auto', 'TBP 2 · Endgame', 'RP'].map(x => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {standings.map(s => (
              <tr key={s.number}>
                <td>{s.rank}</td>
                <td className="team-num">{s.number}</td>
                <td>{s.name}</td>
                <td>{s.wins}</td>
                <td>{s.losses}</td>
                <td>{s.played}</td>
                <td>{s.scheduled}</td>
                <td>{fmt(s.tbp1)}</td>
                <td>{fmt(s.tbp2)}</td>
                <td className="strong-cell">{fmt(s.rp, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Alliances({ alliances, myTeam }) {
  return (
    <div className="stack">
      <div className="panel">
        <Section title="Alliance captains" />
        <p className="muted">
          What the draft leaves each captain seat, based on the event's projected ranking.
        </p>
        <DataTable
          rows={alliances.seats || []}
          cols={['captain', 'team', 'name', 'cap', 'best_available', 'likely_pick', 'projected_total', 'pick_above']}
        />
      </div>

      <div className="panel">
        <Section title="Best possible alliances" />
        <p className="muted">
          Ranked alliance combinations; “beats” compares against alliances without shared teams.
        </p>
        <DataTable
          rows={alliances.table || []}
          cols={['rank', 'teams', 'cap_sum', 'beats', 'win_rate', 'alliance_strength', 'margin', 'unbeatable']}
        />
      </div>

      <div className="panel">
        <Section title={`Partners for team ${myTeam || alliances.my_team || '—'}`} />
        <div className="info-line">
          Current rating: {fmt(alliances.my_cap)}
          · Projected rank: {alliances.my_rank || '—'}
          · Pick threshold: {fmt(alliances.bar)}
        </div>
        <DataTable
          rows={alliances.partners || []}
          cols={['teams', 'cap_sum', 'beats', 'win_rate', 'alliance_strength', 'margin', 'unbeatable']}
        />
      </div>
    </div>
  );
}

function DataTable({ rows, cols }) {
  if (!rows?.length) {
    return <p className="muted">No alliance data available.</p>;
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {cols.map(c => <th key={c}>{c.replaceAll('_', ' ')}</th>)}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c}>
                  {typeof r[c] === 'number'
                    ? fmt(r[c])
                    : Array.isArray(r[c])
                      ? r[c].join(' + ')
                      : String(r[c] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Charts({ teams, matches }) {
  const [metric, setMetric] = useState('cap');

  const data = teams.map(t => ({
    team: t.number,
    name: t.name,
    opr: t.opr,
    cap: t.cap,
    epa: t.epa,
    auto: t.auto,
    teleop: t.teleop,
    endgame: t.endgame
  }));

  const matchData = matches.map(m => ({
    match: m.label,
    red: m.red_pts,
    blue: m.blue_pts
  }));

  return (
    <div className="stack">
      <div className="panel">
        <div className="section-heading">
          <div>
            <h3>All teams · rating comparison</h3>
            <p className="muted">
              Compare OPR, CAP, EPA and phase scoring across the field.
            </p>
          </div>

          <select
            className="compact-select"
            value={metric}
            onChange={e => setMetric(e.target.value)}
          >
            <option value="cap">CAP</option>
            <option value="opr">OPR</option>
            <option value="epa">EPA</option>
            <option value="auto">Auto</option>
            <option value="teleop">Teleop</option>
            <option value="endgame">Endgame</option>
          </select>
        </div>

        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.slice(0, 30)}
              margin={{ top: 12, right: 20, bottom: 50, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="team" angle={-45} textAnchor="end" interval={0} height={65} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={metric} fill="#5d081f" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <Section title="Match predictions" />
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={matchData}
              margin={{ top: 10, right: 20, bottom: 20, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="match" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="red" name="Red predicted" stroke="#9d1b35" dot={false} />
              <Line type="monotone" dataKey="blue" name="Blue predicted" stroke="#2867a8" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <Section title="OPR vs CAP vs EPA" />
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid />
              <XAxis type="number" dataKey="opr" name="OPR" />
              <YAxis type="number" dataKey="cap" name="CAP" />
              <ZAxis type="number" dataKey="epa" range={[35, 180]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={data} fill="#5d081f" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function WinRate({ alliances }) {
  const data = (alliances.table || [])
    .map(a => ({
      cap: a.cap_sum,
      win: a.win_rate ?? a.winRate ?? 0
    }))
    .filter(x => x.cap != null);

  return (
    <div className="panel">
      <div className="section-heading">
        <div>
          <h3>Alliance win rate vs total CAP</h3>
          <p className="muted">
            The event-specific relationship between combined alliance rating and historical win rate.
          </p>
        </div>
      </div>

      {data.length ? (
        <div className="chart tall">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid />
              <XAxis type="number" dataKey="cap" name="Total CAP" />
              <YAxis type="number" dataKey="win" name="Win rate" domain={[0, 1]} />
              <Tooltip
                formatter={v =>
                  typeof v === 'number'
                    ? `${(v * 100).toFixed(1)}%`
                    : v
                }
              />
              <Scatter data={data} fill="#2867a8" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-inline">
          <Info />
          Load an event with teams to fit its alliance win-rate curve.
        </div>
      )}
    </div>
  );
}

function Analysis({ report, accuracy }) {
  if (!report) {
    return (
      <div className="panel">
        <h3>Prediction analysis</h3>
        <p className="muted">Load an event to generate the prediction report.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="metric-grid">
        <Metric
          label="Correct calls"
          value={`${accuracy?.correct || 0}/${accuracy?.decided || 0}`}
        />
        <Metric
          label="Accuracy"
          value={accuracy?.percent == null ? '—' : `${accuracy.percent}%`}
        />
      </div>

      <div className="panel">
        <Section title="Prediction report" />

        <div className="analysis-summary">
          {(report.summary_lines || []).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        {report.wrong?.length > 0 && (
          <>
            <h4>Wrong predictions</h4>
            <DataTable
              rows={report.wrong.map(x => ({
                match: x.prediction?.match?.label,
                predicted: x.prediction?.winner,
                actual: x.prediction?.match?.winner,
                red_points: x.prediction?.red_pts,
                blue_points: x.prediction?.blue_pts,
                suggestion: x.suggestion,
                classification: x.classification
              }))}
              cols={[
                'match', 'predicted', 'actual', 'red_points',
                'blue_points', 'suggestion', 'classification'
              ]}
            />
          </>
        )}

        {report.team_flags && Object.keys(report.team_flags).length > 0 && (
          <>
            <h4>Team flags</h4>
            <DataTable
              rows={Object.values(report.team_flags)}
              cols={[
                'team', 'name', 'wrong_appearances', 'classification',
                'predicted_wins', 'actual_wins', 'scheduled'
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Live({ matches, refresh, resultEdit, setResultEdit, saveResult }) {
  return (
    <div className="panel">
      <div className="section-heading">
        <div>
          <h3>Live match results</h3>
          <p className="muted">
            Refresh published results or manually record a match score.
          </p>
        </div>

        <button className="secondary-btn" onClick={refresh}>
          <RefreshCw size={14} /> Refresh FTCScout
        </button>
      </div>

      <div className="live-match-list">
        {matches.filter(m => !m.played).slice(0, 12).map(m => (
          <div className="live-match" key={m.label}>
            <b>{m.label}</b>
            <span>Red {safeArray(m.red).join(' · ')}</span>
            <span>Blue {safeArray(m.blue).join(' · ')}</span>

            <div className="result-entry">
              <input
                placeholder="Red"
                value={resultEdit[`${m.label}-r`] ?? ''}
                onChange={e => setResultEdit({
                  ...resultEdit,
                  [`${m.label}-r`]: e.target.value
                })}
              />
              <input
                placeholder="Blue"
                value={resultEdit[`${m.label}-b`] ?? ''}
                onChange={e => setResultEdit({
                  ...resultEdit,
                  [`${m.label}-b`]: e.target.value
                })}
              />
              <button onClick={() => saveResult(m)}>
                <Save size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Research({ searchTeam, setSearchTeam, research, doResearch }) {
  return (
    <div className="panel">
      <Section title="Team research" />
      <p className="muted">
        Look up a team using the FTCScout public team endpoint.
      </p>

      <form className="research-form" onSubmit={doResearch}>
        <input
          type="number"
          placeholder="FTC team number"
          value={searchTeam}
          onChange={e => setSearchTeam(e.target.value)}
          required
        />
        <button className="primary-btn">
          <Search size={15} /> Research team
        </button>
      </form>

      {research?.loading && <p className="muted">Searching FTCScout…</p>}
      {research?.error && <div className="alert error">{research.error}</div>}

      {research?.team && (
        <div className="research-result">
          <h2>{research.team.teamNumber} {research.team.name}</h2>
          <p>{research.team.organization || research.team.city || ''}</p>
          <pre>{JSON.stringify(research, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function SettingsPage({ state, mutate, busy }) {
  const s = state.settings || {};

  return (
    <div className="panel form-panel">
      <Section title="Prediction settings" />
      <p className="muted">
        Choose how AutoScout calculates and evaluates the event.
        Changes recompute the current session.
      </p>

      <div className="settings-grid">
        <label>
          Prediction rating
          <select
            value={s.rating || 'CAP'}
            onChange={e => mutate('/api/settings', 'POST', {
              rating: e.target.value
            })}
          >
            <option>CAP</option>
            <option>OPR</option>
            <option>EPA</option>
          </select>
        </label>

        <label>
          Margin threshold (points)
          <input
            type="number"
            step="0.5"
            value={s.margin_points ?? 10}
            disabled={busy}
            onChange={e => mutate('/api/settings', 'POST', {
              margin_points: Number(e.target.value)
            })}
          />
        </label>

        <label className="check-label">
          <input
            type="checkbox"
            checked={!!s.faithful}
            onChange={e => mutate('/api/settings', 'POST', {
              faithful: e.target.checked
            })}
          />
          Spreadsheet-faithful mode
        </label>

        <label className="check-label">
          <input
            type="checkbox"
            checked={!!s.epa_live}
            onChange={e => mutate('/api/settings', 'POST', {
              epa_live: e.target.checked
            })}
          />
          EPA learns from live matches
        </label>

        <label className="check-label">
          <input
            type="checkbox"
            checked={!!s.epa_future}
            onChange={e => mutate('/api/settings', 'POST', {
              epa_future: e.target.checked
            })}
          />
          Include later season events in EPA
        </label>
      </div>

      <div className="settings-note">
        {state.loaded
          ? `EPA status: ${state.session?.settings?.rating || s.rating || 'CAP'} · ${state.played_count} matches played`
          : 'Load an event to apply settings.'}
      </div>
    </div>
  );
}

export default App;
