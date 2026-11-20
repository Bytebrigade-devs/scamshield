"use client";
import { SafetyLink as Link } from "./navigation";
import { useSafetyPathname as usePathname } from "./navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useSafety } from "./safety-provider";
export function Icon({
  name = "shield",
  size = 22,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    shield: (
      <>
        <path d="m12 3-8 3v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l4 3" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v17h17M7 15l4-5 4 2 6-7" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
    message: (
      <>
        <path d="M4 4h16v13H9l-5 4V4Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" />
      </>
    ),
    book: (
      <>
        <path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1ZM12 5v15" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.shield}
    </svg>
  );
}
export function AppShell({
  children,
  title,
  description,
  eyebrow = "DIGITAL SAFETY SCORE",
  action,
}: {
  children: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  const path = usePathname();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [path]);
  return (
    <>
      <header className="app-header">
        <div className="container header-inner">
          <Link className="brand" href="/">
            <span className="brand-icon">
              <Icon size={29} />
            </span>
            ScamShield<span className="brand-slash">/</span>
            <span className="brand-subtitle">Digital Safety</span>
          </Link>
          <nav aria-label="Main navigation">
            {[
              ["/", "Overview", "shield"],
              ["/history/", "History", "chart"],
              ["/guide/", "Score guide", "book"],
            ].map(([href, label, icon]) => (
              <Link
                href={href}
                key={href}
                aria-current={path === href ? "page" : undefined}
              >
                <Icon name={icon} size={17} />
                {label}
              </Link>
            ))}
          </nav>
          <span className="workspace-badge">
            <span>D</span>Demo workspace
          </span>
        </div>
      </header>
      <main className="container app-main" id="main" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1 tabIndex={-1} ref={heading}>
              {title}
            </h1>
            <p className="page-description">{description}</p>
          </div>
          {action}
        </div>
        {children}
      </main>
      <footer className="container app-footer">
        <div>
          <strong>
            ScamShield <span>• Byte Brigade</span>
          </strong>
          <p>
            University project. Synthetic examples support demonstration only.
          </p>
        </div>
        <p>A score does not guarantee protection from scams.</p>
      </footer>
    </>
  );
}
export function DemoNotice() {
  return (
    <div className="demo-notice">
      <Icon name="info" size={19} />
      <p>
        <strong>Checklist demonstration.</strong> The numbers and bands below
        reproduce the earlier report prototype. They are not a live assessment
        or an approved scoring policy.
      </p>
    </div>
  );
}
export function ModeTabs() {
  const { mode, setMode } = useSafety();
  return (
    <div className="view-tabs" role="group" aria-label="Dashboard view">
      <button aria-pressed={mode === "demo"} onClick={() => setMode("demo")}>
        Checklist demo
      </button>
      <button
        aria-pressed={mode === "integration"}
        onClick={() => setMode("integration")}
      >
        Integration preview
      </button>
    </div>
  );
}
export function Card({
  children,
  className = "",
  title,
  kicker,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  kicker?: string;
}) {
  return (
    <section className={"card " + className}>
      {kicker && <p className="card-kicker">{kicker}</p>}
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function Empty({
  title,
  children,
  icon = "info",
}: {
  title: string;
  children: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <span className="icon-tile">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function Feedback() {
  const { storageError } = useSafety();
  return storageError ? (
    <div className="notice warning" role="alert">
      <Icon name="info" size={19} />
      <p>{storageError}</p>
    </div>
  ) : null;
}
export function DemoGuard({
  children,
  requireSaved = false,
}: {
  children: ReactNode;
  requireSaved?: boolean;
}) {
  const { ready, savedAt } = useSafety();
  if (!ready) return <p role="status">Preparing the demonstration…</p>;
  if (requireSaved && !savedAt)
    return (
      <Card>
        <Empty title="Your demonstration starts here">
          <p>
            Review the checklist to preview the illustrated 65-to-90 score
            transition.
          </p>
          <Link href="/checklist/" className="button">
            Open password checklist <Icon name="arrow" size={17} />
          </Link>
        </Empty>
      </Card>
    );
  return <>{children}</>;
}
export function timeLabel(value: string | null) {
  if (!value) return "Not available";
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Colombo",
    }).format(new Date(value)) + " · Sri Lanka time"
  );
}
export function Trend({
  points,
  compact = false,
}: {
  points: { value: number; at: string; label: string }[];
  compact?: boolean;
}) {
  const width = 600,
    height = compact ? 150 : 220,
    left = 36,
    right = 20,
    top = 18,
    bottom = 30;
  const xy = points.map((p, i) => ({
    x: left + (i * (width - left - right)) / Math.max(1, points.length - 1),
    y: top + ((100 - p.value) * (height - top - bottom)) / 100,
    ...p,
  }));
  const line = xy.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <figure className="trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Illustrative score history: ${points.map((p) => p.value).join(", ")} out of 100.`}
      >
        <title>Checklist demonstration trend</title>
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line
              x1={left}
              x2={width - right}
              y1={top + ((100 - t) * (height - top - bottom)) / 100}
              y2={top + ((100 - t) * (height - top - bottom)) / 100}
              stroke="var(--color-border-subtle)"
              strokeDasharray="3 5"
            />
            <text
              x={left - 12}
              y={top + ((100 - t) * (height - top - bottom)) / 100 + 4}
              textAnchor="end"
              fill="var(--color-text-muted)"
              fontSize="10"
            >
              {t}
            </text>
          </g>
        ))}
        <polyline
          points={`${left},${height - bottom} ${line} ${xy.at(-1)?.x},${height - bottom}`}
          fill="var(--color-primary-subtle)"
          stroke="none"
        />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {xy.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="5"
              fill="var(--color-surface)"
              stroke="var(--color-primary)"
              strokeWidth="2.5"
            />
            <text
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              fill="var(--color-text-muted)"
              fontSize="10"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        Illustrative snapshots • {points.length} observations • Not a prediction
      </figcaption>
    </figure>
  );
}
