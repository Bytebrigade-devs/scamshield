"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useJourney } from "./journey-provider";
import { emitEvent } from "@/lib/events";
export function Icon({
  name = "shield",
  size = 24,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    shield: (
      <>
        <path d="M12 3 4 6v6c0 4.4 8 9 8 9s8-4.6 8-9V6l-8-3Z" />
        <path d="m8.5 11.5 2.5 2.5 4.5-5" />
      </>
    ),
    message: (
      <>
        <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    spark: (
      <>
        <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 4C7 2 1 11 7 17s15 0 13-13ZM6 19l9-9" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m9 10 6-3m-6 7 6 3" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
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
export function StartLink({
  placement = "hero",
  children,
  className = "button",
}: {
  placement?: "header" | "hero" | "footer";
  children: ReactNode;
  className?: string;
}) {
  const { variant, ready } = useJourney();
  return (
    <Link
      className={className}
      href="/onboarding/"
      onClick={() =>
        emitEvent("cta_click", { placement, variant: ready ? variant : "A" })
      }
    >
      {children}
    </Link>
  );
}
export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="ScamShield homepage">
          <span className="brand-icon">
            <Icon size={28} />
          </span>
          ScamShield
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/#how-it-works" className="nav-info">
            How it works
          </Link>
          <StartLink placement="header">
            Get started <Icon name="arrow" size={17} />
          </StartLink>
        </nav>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <Link href="/" className="footer-brand">
            ScamShield <span>• Byte Brigade</span>
          </Link>
          <p>
            University project. Demonstrations use synthetic data.
            <br />
            Guidance supports your judgement; it cannot guarantee safety.
          </p>
        </div>
        <Link href="/privacy/">Privacy & storage</Link>
      </div>
    </footer>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <Header />
      {children}
      <Footer />
    </>
  );
}
export function JourneyShell({
  eyebrow,
  title,
  description,
  children,
  step,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  step?: number;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const path = usePathname();
  useEffect(() => {
    heading.current?.focus();
  }, [path, step]);
  return (
    <Shell>
      <main id="main-content" tabIndex={-1} className="journey-main">
        <div className="container journey-grid">
          <section className="journey-intro">
            <p className="eyebrow">{eyebrow}</p>
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
            <p className="intro-copy">{description}</p>
            <div className="intro-note">
              <Icon name="shield" size={19} />
              <span>Your starting point. At your pace.</span>
            </div>
          </section>
          <div className="journey-card">{children}</div>
        </div>
      </main>
    </Shell>
  );
}
export function Loading() {
  return <p role="status">Getting your introduction ready…</p>;
}
export function StorageNotice() {
  const { storageError, retry } = useJourney();
  return storageError ? (
    <div className="notice warning" role="alert">
      <strong>We couldn’t save your progress.</strong>
      <p>
        You can continue in this tab, but a refresh may lose your answers. Allow
        browser storage and retry before leaving.
      </p>
      <button type="button" className="text-button" onClick={retry}>
        Try saving again
      </button>
    </div>
  ) : null;
}
export function Recovery() {
  const { invalid, restart } = useJourney();
  return (
    <>
      <div className="icon-tile">
        <Icon name="info" />
      </div>
      <h2>Let’s make a fresh start</h2>
      <p>{invalid}</p>
      <button className="button full" onClick={restart}>
        Clear saved progress and restart <Icon name="arrow" size={18} />
      </button>
    </>
  );
}
export function CompleteGuard({ children }: { children: ReactNode }) {
  const { ready, progress, invalid } = useJourney();
  if (!ready) return <Loading />;
  if (invalid) return <Recovery />;
  if (!progress.completed)
    return (
      <>
        <h2>Your introduction is waiting</h2>
        <p>
          Answer three short questions to discover a starting point that fits
          you.
        </p>
        <Link className="button" href="/onboarding/">
          Continue my introduction <Icon name="arrow" size={18} />
        </Link>
      </>
    );
  return <>{children}</>;
}
