"use client";
import { SafetyLink as Link } from "./navigation";
import { useSafetyRouter as useRouter } from "./navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AppShell,
  Card,
  Icon,
  ModeTabs,
  DemoNotice,
  DemoGuard,
  Feedback,
  Empty,
  Trend,
  timeLabel,
} from "./ui";
import { useSafety } from "./safety-provider";
import {
  allConfirmed,
  practices,
  demoScore,
  demoBand,
  demoBreakdown,
  historyForDemo,
  aggregateView,
  effectiveState,
  DEMO_RULE,
  type SourceSummary,
  type PracticeId,
} from "./model";
import { sourceLabels, type Scenario } from "./fixtures";
function ScoreRing({ value }: { value: number | null }) {
  const circumference = 2 * Math.PI * 63;
  return (
    <div className="score-ring">
      <svg viewBox="0 0 150 150" aria-hidden="true">
        <circle
          cx="75"
          cy="75"
          r="63"
          fill="none"
          stroke="var(--color-border-subtle)"
          strokeWidth="9"
        />
        {value !== null && (
          <circle
            cx="75"
            cy="75"
            r="63"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${(circumference * value) / 100} ${circumference}`}
            transform="rotate(-90 75 75)"
          />
        )}
      </svg>
      <div>
        <strong>{value ?? "—"}</strong>
        <span>{value === null ? "Unavailable" : "out of 100"}</span>
      </div>
    </div>
  );
}
function Breakdown() {
  const { savedAt } = useSafety();
  return (
    <div className="breakdown-list">
      {demoBreakdown(!!savedAt).map((row) => (
        <div className="breakdown-row" key={row.id}>
          <div>
            <span>{row.label}</span>
            <strong>
              {row.points}
              <small> / {row.max}</small>
            </strong>
          </div>
          <div className="mini-track">
            <span style={{ width: `${(row.points / row.max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
export function Dashboard() {
  const { ready, mode, savedAt, persisted, now } = useSafety();
  const score = demoScore(!!savedAt);
  return (
    <AppShell
      title="Your digital safety, at a glance"
      description="Small steps today. Clearer habits every day."
      action={<ModeTabs />}
    >
      {!ready ? (
        <p role="status">Preparing your dashboard…</p>
      ) : mode === "demo" ? (
        <>
          <DemoNotice />
          <div className="dashboard-grid">
            <Card className="score-card">
              <div className="card-topline">
                <span className="card-kicker">DIGITAL SAFETY SCORE</span>
                <span className="pill">Illustrative</span>
              </div>
              <div className="score-summary">
                <ScoreRing value={score} />
                <div>
                  <span className={`result-band ${score < 70 ? "amber" : ""}`}>
                    {demoBand(score)}{" "}
                    <span>
                      • {savedAt ? "Checklist completed" : "Room to improve"}
                    </span>
                  </span>
                  <p className="delta">
                    <Icon name="chart" size={16} />
                    {savedAt
                      ? "+25 demo points"
                      : "+10 since the previous demo snapshot"}
                  </p>
                  <p className="score-caption">
                    {savedAt
                      ? persisted
                        ? "Checklist saved in this browser session."
                        : "Preview only — this result has not been saved."
                      : "A sample starting point from the report prototype."}
                  </p>
                </div>
              </div>
              <div className="score-card-footer">
                <span>
                  <Icon name="clock" size={14} />{" "}
                  {savedAt
                    ? "Demonstration updated"
                    : "Earlier checklist prototype"}
                </span>
                <Link href="/guide/">
                  How scoring works <Icon name="arrow" size={14} />
                </Link>
              </div>
            </Card>
            <Card className="next-card" kicker="YOUR NEXT BEST STEP">
              <div className="icon-tile">
                <Icon name={savedAt ? "check" : "lock"} size={25} />
              </div>
              <h2>
                {savedAt
                  ? "Keep the useful habits going."
                  : "A little attention to your password habits."}
              </h2>
              <p>
                {savedAt
                  ? "You have explored all five practices. This confirms a demonstration checklist, not the actual security of your accounts."
                  : "Review five password practices to explore the illustrated 65-to-90 score transition."}
              </p>
              <Link className="button full" href="/checklist/">
                {savedAt ? "Review saved checklist" : "Open password checklist"}
                <Icon name="arrow" size={17} />
              </Link>
            </Card>
            <Card
              title="What makes up your demo score"
              className="breakdown-card"
            >
              <p className="subcopy">
                Five categories from the earlier checklist design.
              </p>
              <Breakdown />
              <p className="footnote">
                These demonstration allocations are separate from the proposed
                M2/M3/M4 integration model.
              </p>
            </Card>
            <Card title="Your progress" className="progress-card">
              <div className="card-topline">
                <p className="subcopy">Illustrative checklist history</p>
                <Link href="/history/" className="small-link">
                  View history <Icon name="arrow" size={14} />
                </Link>
              </div>
              <Trend points={historyForDemo(savedAt, now)} compact />
              <div className="rule-note">
                <Icon name="info" size={17} />
                <p>
                  Rule version: <code>{DEMO_RULE}</code>. These sample changes
                  are not evidence of measured protection.
                </p>
              </div>
            </Card>
          </div>
          <section className="recommendations">
            <div className="section-heading">
              <div>
                <p className="eyebrow">MAKE THE NEXT STEP USEFUL</p>
                <h2>Build on the habits that matter</h2>
              </div>
              <Link href="/sources/" className="small-link">
                Review source coverage <Icon name="arrow" size={15} />
              </Link>
            </div>
            <div className="recommendation-grid">
              <Recommendation
                icon="lock"
                title="Review your password routine"
                text="Explore five practical habits. No passwords are collected here."
                href="/checklist/"
                label="Review checklist"
              />
              <Recommendation
                icon="shield"
                title="Review account security"
                text="Account settings belong to Module 2 and must use normal access checks."
                label="Account settings not connected"
              />
              <Recommendation
                icon="message"
                title="Pause before you act"
                text="Scam-checking guidance belongs to Module 4. More checks alone do not improve a score."
                label="Scam checker not connected"
              />
            </div>
          </section>
          <Feedback />
        </>
      ) : (
        <IntegrationPanel />
      )}
    </AppShell>
  );
}
function Recommendation({
  icon,
  title,
  text,
  href,
  label,
}: {
  icon: string;
  title: string;
  text: string;
  href?: string;
  label: string;
}) {
  return (
    <article className="recommendation">
      <span className="icon-tile">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {href ? (
        <Link className="small-link" href={href}>
          {label}
          <Icon name="arrow" size={15} />
        </Link>
      ) : (
        <button className="unavailable-action" disabled>
          {label}
        </button>
      )}
    </article>
  );
}
function PreviewControls() {
  const { configured, scenario, setScenario, reload, status } = useSafety();
  return (
    <div className="preview-controls">
      <div>
        <p className="eyebrow">
          {configured ? "SERVER CONNECTION" : "SYNTHETIC INTEGRATION PREVIEW"}
        </p>
        <p>
          {configured
            ? "Read-only view of the configured summary endpoint."
            : "Explore how the interface handles incomplete or unavailable evidence."}
        </p>
      </div>
      <div className="preview-actions">
        {!configured && (
          <label>
            Preview state
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as Scenario)}
            >
              <option value="missing">Missing source</option>
              <option value="stale">Stale password summary</option>
              <option value="ready">All summaries present</option>
              <option value="error">Service unavailable</option>
              <option value="signed-out">Sign-in required</option>
              <option value="forbidden">Access denied</option>
            </select>
          </label>
        )}
        <button
          className="button secondary compact"
          onClick={reload}
          disabled={status === "loading"}
        >
          <Icon name="refresh" size={17} />
          {status === "loading" ? "Loading…" : "Refresh summary"}
        </button>
      </div>
    </div>
  );
}
export function IntegrationPanel({ details = false }: { details?: boolean }) {
  const { summary, status, problem, now, configured } = useSafety();
  const result = summary ? aggregateView(summary, now) : null;
  const current =
    summary?.sources.filter((s) => effectiveState(s, now) === "current")
      .length || 0;
  return (
    <>
      <PreviewControls />
      {status === "loading" || status === "idle" ? (
        <Card>
          <div className="loading-grid" role="status" aria-live="polite">
            <span className="loading-dot" />
            <h2>Retrieving source summaries…</h2>
            <p>
              No previous total is presented as a current result while this view
              refreshes.
            </p>
          </div>
        </Card>
      ) : status === "error" ? (
        <Card>
          <Empty
            icon={problem?.kind === "auth" ? "lock" : "info"}
            title={
              problem?.kind === "auth"
                ? "Sign-in required"
                : problem?.kind === "forbidden"
                  ? "Access is unavailable"
                  : "We couldn’t load the summary"
            }
          >
            <p role="alert">{problem?.message}</p>
            <p className="footnote">
              {configured
                ? "Identity and record ownership must be verified by the connected server."
                : "This is a simulated preview state. No account or private record has been accessed."}
            </p>
          </Empty>
        </Card>
      ) : summary && result ? (
        <>
          <div className="integration-top">
            <Card className="integrated-score">
              <div className="card-topline">
                <span className="card-kicker">INTEGRATED SAFETY SCORE</span>
                <span className="pill neutral">
                  {result.value === null ? "No aggregate" : "Server result"}
                </span>
              </div>
              <div className="score-summary">
                <ScoreRing value={result.value} />
                <div>
                  <h2>
                    {result.value === null
                      ? "A clearer picture needs current evidence."
                      : result.band || "Server-supplied score"}
                  </h2>
                  <p>{result.reason}</p>
                </div>
              </div>
              <div className="score-card-footer">
                <span>
                  Policy:{" "}
                  {summary.policy.status === "pending"
                    ? "Awaiting approval"
                    : summary.policy.version}
                </span>
                <span>Summary: {timeLabel(summary.generatedAt)}</span>
              </div>
            </Card>
            <Card className="coverage-card" kicker="SOURCE COVERAGE">
              <strong className="coverage-number">
                {current}
                <span> / 3</span>
              </strong>
              <h2>Current summaries</h2>
              <p>Coverage describes availability. It is not a safety rating.</p>
              <div className="coverage-dots">
                {summary.sources.map((s) => (
                  <span
                    key={s.id}
                    className={
                      effectiveState(s, now) === "current" ? "current" : ""
                    }
                    aria-label={`${sourceLabels[s.id]}: ${effectiveState(s, now)}`}
                  />
                ))}
              </div>
            </Card>
          </div>
          <div className="section-heading source-heading">
            <div>
              <p className="eyebrow">EVIDENCE & LIMITATIONS</p>
              <h2>Understand each source</h2>
            </div>
          </div>
          <div className="source-grid">
            {summary.sources.map((s) => (
              <SourceCard key={s.id} source={s} expanded={details} />
            ))}
          </div>
          <div className="notice">
            <Icon name="info" />
            <p>
              {configured
                ? "The frontend displays validated server summaries. It does not calculate totals, authorize users or change source records."
                : "All displayed source counts and timestamps are synthetic. The proposed scoring model, normalisation and freshness rules still need team approval."}{" "}
              Payments and repeated checks do not earn safety points.
            </p>
          </div>
        </>
      ) : null}
    </>
  );
}
const metricLabels: Record<string, string> = {
  emailConfirmed: "Email confirmed",
  totalEntries: "Vault entries",
  weakCount: "Weak password flags",
  reusedCount: "Reused password flags",
  commonCount: "Common password flags",
  checksCompleted: "Checks processed",
  latestAttemptComplete: "Latest attempt complete",
};
function SourceCard({
  source,
  expanded,
}: {
  source: SourceSummary;
  expanded: boolean;
}) {
  const { now } = useSafety();
  const state = effectiveState(source, now);
  return (
    <Card className="source-card">
      <div className="source-top">
        <span className="icon-tile">
          <Icon
            name={
              source.id === "account"
                ? "shield"
                : source.id === "passwords"
                  ? "lock"
                  : "message"
            }
          />
        </span>
        <span className={`status-tag ${state}`}>
          {state === "current"
            ? "Current"
            : state === "missing"
              ? "Missing"
              : state === "stale"
                ? "Stale"
                : "Unavailable"}
        </span>
      </div>
      <p className="card-kicker">
        MODULE{" "}
        {source.id === "account" ? "2" : source.id === "passwords" ? "3" : "4"}
      </p>
      <h2>{sourceLabels[source.id]}</h2>
      <p className="source-summary">
        {state === "missing"
          ? "No current summary has been received."
          : state === "stale"
            ? "A previous summary exists but is no longer current."
            : state === "error"
              ? "The source summary cannot be used."
              : "A summary is present. Its scoring eligibility is considered separately."}
      </p>
      <dl className="source-time">
        <div>
          <dt>Observed</dt>
          <dd>{timeLabel(source.observedAt)}</dd>
        </div>
        <div>
          <dt>Fresh until</dt>
          <dd>{timeLabel(source.freshUntil)}</dd>
        </div>
      </dl>
      <details open={expanded} className="source-details">
        <summary>Summary details & limitations</summary>
        {Object.keys(source.metrics).length > 0 ? (
          <dl className="metric-list">
            {Object.entries(source.metrics).map(([key, value]) => (
              <div key={key}>
                <dt>{metricLabels[key] || key}</dt>
                <dd>
                  {typeof value === "boolean" ? (value ? "Yes" : "No") : value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>No metric values available.</p>
        )}
        <ul>
          {source.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="footnote">
          Source contract: <code>{source.version}</code>
          <br />
          Scoring eligibility:{" "}
          {source.scoringEligible
            ? "Reported eligible by the server"
            : "Not established"}
        </p>
      </details>
      <div className="source-action">
        <button className="unavailable-action" disabled>
          {source.id === "account"
            ? "Account settings"
            : source.id === "passwords"
              ? "Vault health"
              : "Scam checker"}{" "}
          not connected
        </button>
        <p>
          Connect an existing authorised module route before enabling this
          action.
        </p>
      </div>
    </Card>
  );
}
export function Checklist() {
  const { checked, setChecked } = useSafety();
  const router = useRouter();
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function toggle(id: PracticeId) {
    setChecked(
      checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id],
    );
    setError("");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!allConfirmed(checked)) {
      setError("Confirm all five practices before reviewing your checklist.");
      return;
    }
    router.push("/confirm/");
  }
  return (
    <AppShell
      title="Build better password habits"
      description="Review all five practices before confirming."
      eyebrow="PASSWORD SAFETY CHECKLIST"
    >
      <DemoGuard>
        <DemoNotice />
        <div className="focused-layout">
          <Card>
            <div className="card-topline">
              <h2>Password safety checklist</h2>
              <span className="pill">{checked.length} / 5</span>
            </div>
            <p className="subcopy">
              Choose each practice to acknowledge that you have reviewed it. No
              actual account security is verified.
            </p>
            <form onSubmit={submit} noValidate>
              <fieldset
                aria-describedby={
                  error ? "checklist-error checklist-note" : "checklist-note"
                }
              >
                <legend className="sr-only">
                  Confirm the five password practices
                </legend>
                <div className="checklist-options">
                  {practices.map((p, i) => (
                    <label
                      className={`practice ${checked.includes(p.id) ? "selected" : ""}`}
                      key={p.id}
                    >
                      <input
                        type="checkbox"
                        checked={checked.includes(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      <span>
                        <strong>
                          <span className="practice-number">0{i + 1}</span>
                          {p.title}
                        </strong>
                        <small>{p.detail}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p id="checklist-note" className="privacy-note">
                <Icon name="lock" size={16} />
                Never enter your real passwords here.
              </p>
              {error && (
                <p
                  id="checklist-error"
                  ref={errorRef}
                  tabIndex={-1}
                  className="field-error"
                  role="alert"
                >
                  {error}
                </p>
              )}
              <button className="button full" type="submit">
                Review confirmation <Icon name="arrow" size={17} />
              </button>
              <button
                className="button secondary full spaced"
                type="button"
                onClick={() => {
                  setChecked(practices.map((p) => p.id));
                  setError("");
                }}
              >
                Confirm all five practices
              </button>
              <Link className="text-link centered" href="/">
                Cancel and return
              </Link>
            </form>
          </Card>
          <aside className="side-note">
            <span className="icon-tile">
              <Icon name="info" />
            </span>
            <h2>A demonstration of the flow</h2>
            <p>
              The earlier report prototype adds 25 sample points after
              confirming all five practices.
            </p>
            <p>
              These acknowledgements do not inspect your passwords or verify
              your accounts. They never change the proposed integrated score.
            </p>
            <div className="mini-score">
              <strong>
                65 <span>→</span> 90
              </strong>
              <span>Illustrative transition only</span>
            </div>
            <p className="footnote">
              Choices stay in memory until you select Save on the next screen.
            </p>
          </aside>
        </div>
        <Feedback />
      </DemoGuard>
    </AppShell>
  );
}
export function Confirmation() {
  const { checked, saveChecklist, storageError, previewUnsaved } = useSafety();
  const router = useRouter();
  return (
    <AppShell
      title="Ready to save your checklist"
      description="A final look at the practices you reviewed."
      eyebrow="CHECKLIST CONFIRMATION"
    >
      <DemoGuard>
        <DemoNotice />
        <div className="narrow">
          <Card>
            {allConfirmed(checked) ? (
              <>
                <div className="success-icon">
                  <Icon name="check" size={27} />
                </div>
                <h2>5 of 5 practices confirmed</h2>
                <ul className="confirmation-list">
                  {practices.map((p) => (
                    <li key={p.id}>
                      <Icon name="check" size={18} />
                      {p.title}
                    </li>
                  ))}
                </ul>
                <div className="points-preview">
                  <span>Password safety</span>
                  <strong>
                    25 <small>/ 25 demo points</small>
                  </strong>
                </div>
                <p className="subcopy">
                  Saving records this demonstration checklist in this browser
                  tab’s session storage. No real security result is written to a
                  server.
                </p>
                <button
                  className="button full"
                  onClick={() => {
                    if (saveChecklist()) router.push("/updated/");
                  }}
                >
                  Save checklist and view score <Icon name="arrow" size={17} />
                </button>
                <Link
                  href="/checklist/"
                  className="button secondary full spaced"
                >
                  Back to review
                </Link>
                <Feedback />
                {storageError && (
                  <button
                    className="text-link centered"
                    onClick={() => {
                      previewUnsaved();
                      router.push("/updated/");
                    }}
                  >
                    Preview the result without saving
                  </button>
                )}
              </>
            ) : (
              <Empty title="Review your checklist first" icon="list">
                <p>
                  All five practices must be confirmed before this demonstration
                  can be saved.
                </p>
                <Link className="button" href="/checklist/">
                  Back to the checklist <Icon name="arrow" size={17} />
                </Link>
              </Empty>
            )}
          </Card>
        </div>
      </DemoGuard>
    </AppShell>
  );
}
export function Updated() {
  const { savedAt, persisted, reset, setMode } = useSafety();
  const router = useRouter();
  return (
    <AppShell
      title="Your updated demonstration score"
      description={
        persisted
          ? "Checklist saved in this browser session • Demonstration state"
          : "Preview only • No saved security assessment"
      }
      eyebrow="CHECKLIST DEMONSTRATION"
    >
      <DemoGuard requireSaved>
        <DemoNotice />
        <div className="updated-grid">
          <Card className="updated-score">
            <span className="complete-label">
              <Icon name="check" size={18} />
              {persisted ? "Checklist saved locally" : "Unsaved result preview"}
            </span>
            <h2>Digital Safety Score</h2>
            <div className="updated-total">
              90 <span>/ 100</span>
            </div>
            <span className="result-band">
              Strong <span>• +25 demo points</span>
            </span>
            <p>
              Password safety checklist completed in the earlier prototype flow.
            </p>
            <p className="footnote">{timeLabel(savedAt)}</p>
          </Card>
          <Card title="Updated demo breakdown">
            <Breakdown />
          </Card>
        </div>
        <div className="updated-actions">
          <Link href="/checklist/" className="button">
            Review checklist <Icon name="arrow" size={17} />
          </Link>
          <Link href="/guide/" className="button secondary">
            How scoring works
          </Link>
          <button
            className="button secondary"
            onClick={() => {
              reset();
              setMode("demo");
              router.push("/");
            }}
          >
            Restart demo
          </button>
        </div>
        <Feedback />
        <p className="footnote">
          A high demonstration score does not guarantee protection from scams.
        </p>
      </DemoGuard>
    </AppShell>
  );
}
export function History() {
  const { mode, setMode, savedAt, now } = useSafety();
  const [range, setRange] = useState("30");
  const points = historyForDemo(savedAt, now).filter(
    (p) => Date.parse(p.at) >= now - Number(range) * 86400000,
  );
  function download() {
    const rows = [
      "timestamp,score,rule_version,type",
      ...points.map((p) => `${p.at},${p.value},${p.rule},synthetic-demo`),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "scamshield-m6-demo-history.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <AppShell
      title="See the path behind the numbers"
      description="Review timestamped snapshots and the rule version used for each."
      eyebrow="SCORE HISTORY"
      action={<ModeTabs />}
    >
      <DemoGuard>
        {mode === "integration" ? (
          <Card>
            <Empty title="Integrated history is not connected" icon="chart">
              <p>
                No history endpoint or approved scoring policy has been
                connected. Earlier checklist values are not presented as
                integrated results.
              </p>
              <button
                className="button secondary"
                onClick={() => setMode("demo")}
              >
                Explore the synthetic checklist history
              </button>
            </Empty>
          </Card>
        ) : (
          <>
            <DemoNotice />
            <Card>
              <div className="section-heading">
                <div>
                  <h2>Demonstration trend</h2>
                  <p className="subcopy">
                    Relative dates and sample values reproduce the illustrated
                    progression.
                  </p>
                </div>
                <label className="range-control">
                  Time range
                  <select
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                  >
                    <option value="30">Last 30 days</option>
                    <option value="7">Last 7 days</option>
                  </select>
                </label>
              </div>
              {points.length ? (
                <Trend points={points} />
              ) : (
                <p>No synthetic snapshots in this window.</p>
              )}
            </Card>
            <Card className="history-table-card">
              <div className="section-heading">
                <h2>Snapshot details</h2>
                <button className="button secondary compact" onClick={download}>
                  Download demo CSV
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">
                    Synthetic demonstration score snapshots
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Recorded at</th>
                      <th scope="col">Score</th>
                      <th scope="col">Demo band</th>
                      <th scope="col">Rule version</th>
                      <th scope="col">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().map((p) => (
                      <tr key={p.id}>
                        <td>{timeLabel(p.at)}</td>
                        <td>
                          <strong>
                            {p.value} <span>/ 100</span>
                          </strong>
                        </td>
                        <td>{demoBand(p.value)}</td>
                        <td>
                          <code>{p.rule}</code>
                        </td>
                        <td>Synthetic</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </DemoGuard>
    </AppShell>
  );
}
export function Guide() {
  const { reset, setMode } = useSafety();
  const [message, setMessage] = useState("");
  return (
    <AppShell
      title="How your score works"
      description="Understand the demonstration, the planned model and the limits of a number."
      eyebrow="A CLEARER EXPLANATION"
    >
      <DemoNotice />
      <div className="guide-grid">
        <Card title="Five demo categories. A sample total out of 100.">
          <p>
            The earlier checklist prototype uses these allocations. They are
            preserved to match the report’s illustrated flow.
          </p>
          <dl className="guide-weights">
            {demoBreakdown(false).map((p) => (
              <div key={p.id}>
                <dt>{p.label}</dt>
                <dd>{p.max} points</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Understanding the demo bands">
          <p>These bands belong to the earlier prototype only.</p>
          <ul className="band-list">
            {[
              ["0–39", "Needs attention"],
              ["40–69", "Fair"],
              ["70–89", "Good"],
              ["90–100", "Strong"],
            ].map(([range, label]) => (
              <li key={range}>
                <strong>{range}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <p className="footnote">
            These labels are not calibrated risk probabilities.
          </p>
        </Card>
        <Card title="The proposed integrated model" className="guide-wide">
          <div className="policy-callout">
            <Icon name="info" />
            <div>
              <strong>Awaiting shared approval</strong>
              <p>
                The report proposes account security (M2), password health (M3)
                and scam evidence (M4). Their meaning, normalisation, weights,
                bands and freshness rules still need agreement.
              </p>
            </div>
          </div>
          <div className="principle-grid">
            {[
              [
                "No invented totals",
                "This frontend does not calculate a production score or average the components. Only a validated, approved server result may be displayed.",
              ],
              [
                "Missing means unavailable",
                "Missing or stale required sources do not become a zero, a safe result or a redistributed weight.",
              ],
              [
                "Evidence needs context",
                "More scam checks alone do not prove safer behaviour. Source times, limitations and eligibility remain visible.",
              ],
              [
                "Access stays with the server",
                "A subscription price or payment never raises the score. Source retrieval and corrective actions need normal authorization.",
              ],
            ].map(([title, text]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <Link
            href="/"
            className="button secondary"
            onClick={() => setMode("integration")}
          >
            Explore the integration preview
            <Icon name="arrow" size={17} />
          </Link>
        </Card>
        <Card title="Privacy & local demonstration data" className="guide-wide">
          <p>
            The checklist stores only five practice identifiers and a save
            timestamp in this tab’s session storage after Save succeeds. It is
            restored on refresh where supported and normally cleared when the
            tab or browser session ends. No real passwords, private messages,
            payment details or identity records are collected.
          </p>
          <p>
            No external API is called in the default package. The optional
            configured summary endpoint is a separate integration that the team
            must secure and review. Browser storage support for directly opened
            files varies.
          </p>
          <button
            className="button secondary"
            onClick={() => {
              reset();
              setMessage(
                "The current demonstration has been reset. See any storage warning below.",
              );
            }}
          >
            Reset local checklist demonstration
          </button>
          <p role="status" className="footnote">
            {message}
          </p>
          <Feedback />
        </Card>
      </div>
      <Link className="text-link" href="/">
        Back to my score <Icon name="arrow" size={17} />
      </Link>
    </AppShell>
  );
}
export function Sources() {
  return (
    <AppShell
      title="A clearer view of the evidence"
      description="Review source availability, timestamps and limitations without exposing private records."
      eyebrow="SOURCE COVERAGE"
    >
      <IntegrationPanel details />
    </AppShell>
  );
}
