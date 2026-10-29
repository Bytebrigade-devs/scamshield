"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Shell,
  JourneyShell,
  StartLink,
  Icon,
  Loading,
  StorageNotice,
  Recovery,
  CompleteGuard,
} from "./ui";
import { useJourney } from "./journey-provider";
import {
  questions,
  preferredTool,
  safeReferral,
  HANDOFF_KEY,
} from "@/lib/model";
import { emitEvent } from "@/lib/events";
export function Landing() {
  const { variant } = useJourney();
  const viewed = useRef(false);
  useEffect(() => {
    if (!viewed.current) {
      emitEvent("landing_view");
      viewed.current = true;
    }
  }, []);
  return (
    <Shell>
      <main id="main-content">
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <p className="eyebrow">A calmer way to stay alert online</p>
              <h1>
                Pause. Check.
                <br />
                Feel more
                <br />
                <span>confident.</span>
              </h1>
              <p className="hero-copy">
                Make sense of suspicious messages and build better password
                habits — with clear explanations at every step.
              </p>
              <StartLink>
                {variant === "B"
                  ? "Discover my starting point"
                  : "Find my starting point"}{" "}
                <Icon name="arrow" size={18} />
              </StartLink>
              <p className="microcopy">
                3 short questions <span>•</span> No account needed to begin
              </p>
            </div>
            <aside
              className="message-demo"
              aria-label="Illustrative suspicious message"
            >
              <div className="demo-heading">
                <span className="icon-tile">
                  <Icon name="spark" />
                </span>
                <span>A little clarity goes a long way.</span>
              </div>
              <div className="message-bubble">
                <div className="message-label">
                  <Icon name="message" size={16} /> Example message
                </div>
                <p>“Your parcel is on hold. Pay a fee now to release it.”</p>
              </div>
              <h2>What should make you pause?</h2>
              <ul className="red-flags">
                <li>
                  <span />
                  An unexpected payment request
                </li>
                <li>
                  <span />
                  Pressure to act immediately
                </li>
                <li>
                  <span />A link you were not expecting
                </li>
              </ul>
              <p className="demo-caption">
                <Icon name="info" size={15} />
                Illustrative example, not a live analysis.
              </p>
            </aside>
          </div>
        </section>
        <section className="section features" id="features">
          <div className="container">
            <p className="eyebrow">A little support for everyday decisions</p>
            <h2>Two tools. One clearer starting point.</h2>
            <div className="feature-grid">
              <article className="feature-card">
                <div className="icon-tile">
                  <Icon name="message" />
                </div>
                <h3>Understand suspicious messages</h3>
                <p>
                  See explained red flags and practical next steps with the AI
                  scam checker.
                </p>
                <span className="feature-tag">Pause before you act</span>
              </article>
              <article className="feature-card">
                <div className="icon-tile">
                  <Icon name="lock" />
                </div>
                <h3>Build better password habits</h3>
                <p>
                  Explore a password vault designed to organise entries and
                  highlight weak or reused passwords.
                </p>
                <span className="feature-tag">Build confidence over time</span>
              </article>
            </div>
          </div>
        </section>
        <section className="section" id="how-it-works">
          <div className="container">
            <p className="eyebrow">Small steps. A clearer direction.</p>
            <h2>A simple path to getting started</h2>
            <div className="steps-grid">
              {[
                [
                  "Tell us what matters",
                  "Choose what you want help with in three short questions.",
                ],
                [
                  "Explore your starting point",
                  "See benefits that match your interests.",
                ],
                [
                  "Continue to signup",
                  "Create an account when you are ready to explore further.",
                ],
              ].map(([title, text], i) => (
                <article key={title}>
                  <span className="step-number">0{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="section faq-section">
          <div className="container faq-grid">
            <div>
              <p className="eyebrow">A few things to know</p>
              <h2>
                Clarity starts
                <br />
                with good questions.
              </h2>
              <p>Here’s what to expect before you begin.</p>
            </div>
            <div className="faq-list">
              {[
                [
                  "Does ScamShield guarantee a message is safe?",
                  "No. It offers guidance and explanations to support your judgement. Always verify important requests independently.",
                ],
                [
                  "Do I need to enter passwords during onboarding?",
                  "No. We only ask about your preferences. Never enter private messages, passwords or financial details here.",
                ],
                [
                  "What happens after these questions?",
                  "You see relevant benefits, then choose whether to continue to account signup.",
                ],
                [
                  "Can I finish the questions later?",
                  "Yes, when browser storage is available. Your preferences stay in this browser for up to seven days after your last saved change.",
                ],
              ].map(([q, a], i) => (
                <details key={q} open={i === 0}>
                  <summary>
                    {q}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <section className="final-cta">
          <div className="container final-cta-inner">
            <div>
              <p className="eyebrow">A little clarity goes a long way</p>
              <h2>Start with what matters to you.</h2>
            </div>
            <StartLink placement="footer">
              Get started <Icon name="arrow" size={18} />
            </StartLink>
          </div>
        </section>
      </main>
    </Shell>
  );
}
export function Onboarding() {
  const router = useRouter();
  const { progress, ready, invalid, save, restart, storageError } =
    useJourney();
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const q = questions[progress.step];
  const selected = progress.answers[q.id];
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError("Select an answer to continue.");
      document.getElementById("answer-error")?.focus();
      return;
    }
    setError("");
    emitEvent("onboarding_step_completed", { step: progress.step + 1 });
    if (progress.step === 2) {
      save({ ...progress, completed: true });
      emitEvent("onboarding_completed");
      router.push("/benefits/");
    } else save({ ...progress, step: progress.step + 1, completed: false });
  }
  const hasSaved = Object.keys(progress.answers).length > 0;
  const begin = () => {
    setActive(true);
    emitEvent("onboarding_started");
  };
  return (
    <JourneyShell
      eyebrow={
        active
          ? `Question ${progress.step + 1} of 3`
          : hasSaved
            ? "Welcome back"
            : "Your starting point"
      }
      title={
        active
          ? "Your interests. Your starting point."
          : hasSaved
            ? "Pick up where you left off."
            : "A few questions. A more useful introduction."
      }
      description={
        active
          ? "We only use these preferences to introduce relevant features. Never enter private information here."
          : hasSaved
            ? "Your saved preferences are available in this browser. Continue whenever you’re ready."
            : "Tell us what matters to you and we will introduce the features that fit."
      }
      step={active ? progress.step : -1}
    >
      {!ready ? (
        <Loading />
      ) : invalid ? (
        <Recovery />
      ) : !active ? (
        <>
          <div className="icon-tile large">
            <Icon name={hasSaved ? "leaf" : "spark"} size={28} />
          </div>
          <p className="card-eyebrow">
            {hasSaved ? "YOUR INTRODUCTION" : "LET’S GET TO KNOW YOUR GOALS"}
          </p>
          <h2>
            {hasSaved
              ? `You’ve answered ${Object.keys(progress.answers).length} of 3 questions`
              : "Three small questions. A useful first step."}
          </h2>
          <p>
            {hasSaved
              ? "Your answers are saved. You can go back and change them at any point."
              : "Choose your interests, preferred tool and comfort level. You can go back and change your answers."}
          </p>
          {hasSaved && (
            <div className="saved-summary">
              {questions
                .filter((q) => progress.answers[q.id])
                .map((q) => (
                  <div key={q.id}>
                    <span>
                      {q.id === "interest"
                        ? "Your main interest"
                        : q.id === "tool"
                          ? "Your preferred tool"
                          : "Your comfort level"}
                    </span>
                    <strong>
                      {
                        q.options.find(
                          (o) => o.value === progress.answers[q.id],
                        )?.label
                      }
                    </strong>
                  </div>
                ))}
            </div>
          )}
          <div className="notice">
            <Icon name="lock" size={18} />
            <p>
              No passwords. No private messages.
              <br />
              This is an introduction, not a safety assessment.
            </p>
          </div>
          {progress.completed ? (
            <Link href="/benefits/" className="button full">
              Review my benefits <Icon name="arrow" size={18} />
            </Link>
          ) : (
            <button className="button full" onClick={begin}>
              {hasSaved
                ? `Continue from question ${progress.step + 1}`
                : "Let’s begin"}
              <Icon name="arrow" size={18} />
            </button>
          )}
          {progress.completed && (
            <button
              className="button secondary full spaced"
              onClick={() => {
                save({ ...progress, step: 0, completed: false });
                begin();
              }}
            >
              Edit my answers
            </button>
          )}
          {hasSaved && (
            <button
              className="text-button restart-link"
              onClick={() => {
                restart();
                setActive(true);
                setError("");
              }}
            >
              Start again — clear my saved answers
            </button>
          )}
          <StorageNotice />
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="progress-label">
            <span>YOUR INTRODUCTION</span>
            <span>{progress.step + 1} / 3</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Question progress"
            aria-valuenow={progress.step + 1}
            aria-valuemin={0}
            aria-valuemax={3}
          >
            {questions.map((q, i) => (
              <span key={q.id} className={i <= progress.step ? "filled" : ""} />
            ))}
          </div>
          <fieldset
            aria-describedby={`question-hint${error ? " answer-error" : ""}`}
            aria-invalid={!!error}
          >
            <legend>{q.title}</legend>
            <p id="question-hint" className="question-hint">
              {q.hint}
            </p>
            <div className="answer-list">
              {q.options.map((o) => (
                <label
                  key={o.value}
                  className={`answer-option ${selected === o.value ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={o.value}
                    checked={selected === o.value}
                    onChange={() => {
                      save({
                        ...progress,
                        answers: { ...progress.answers, [q.id]: o.value },
                        completed: false,
                      });
                      setError("");
                    }}
                  />
                  <span className="answer-copy">
                    <strong>{o.label}</strong>
                    <small>{o.detail}</small>
                  </span>
                  <span className="answer-icon">
                    <Icon name={o.icon} size={20} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p
              className="field-error"
              id="answer-error"
              role="alert"
              tabIndex={-1}
            >
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setError("");
                if (progress.step === 0) setActive(false);
                else
                  save({
                    ...progress,
                    step: progress.step - 1,
                    completed: false,
                  });
              }}
            >
              Back
            </button>
            <button className="button" type="submit">
              {progress.step === 2 ? "See my benefits" : "Continue"}
              <Icon name="arrow" size={18} />
            </button>
          </div>
          <p className="storage-caption">
            <Icon name="lock" size={14} />
            {storageError
              ? "Progress is currently kept in this tab only."
              : "Your progress stays in this browser."}
          </p>
          <StorageNotice />
        </form>
      )}
    </JourneyShell>
  );
}
export function Benefits() {
  const { progress, handoff, handoffError } = useJourney();
  const vault = preferredTool(progress.answers) === "vault";
  const rows = vault
    ? [
        [
          "lock",
          "Keep your passwords organised",
          "Explore a single place to organise your password entries.",
        ],
        [
          "shield",
          "Spot habits worth improving",
          "See password health warnings for weak or reused passwords.",
        ],
        [
          "message",
          "Pause on suspicious messages",
          "Explore explained red flags with the scam checker too.",
        ],
      ]
    : [
        [
          "message",
          "Understand red flags",
          "See why a phrase or request deserves a closer look.",
        ],
        [
          "shield",
          "Find practical next steps",
          "Get guidance that helps you verify information independently.",
        ],
        [
          "lock",
          "Build stronger habits",
          "Explore password organisation and health warnings.",
        ],
      ];
  return (
    <JourneyShell
      eyebrow="Ready for your next step"
      title={
        vault
          ? "Start by building better password habits."
          : "Start by making sense of suspicious messages."
      }
      description={
        vault
          ? "Based on your selected interests. You can explore the scam checker too."
          : "Based on your selected interests. You can explore password tools too."
      }
    >
      <CompleteGuard>
        <div className="complete-badge">
          <Icon name="check" size={18} />
          Introduction complete
        </div>
        <h2>
          {vault
            ? "A little organisation. A clearer routine."
            : "A clearer view before you act"}
        </h2>
        <div className="benefit-list">
          {rows.map(([icon, title, text]) => (
            <article key={title}>
              <div className="icon-tile">
                <Icon name={icon} />
              </div>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="notice">
          <p>
            {progress.answers.experience === "new"
              ? "New to these tools? Start with the explained guidance and take one step at a time."
              : progress.answers.experience === "comfortable"
                ? "Ready to explore? Review the available tools and choose your next step."
                : "Build on what you know with clear explanations and practical next steps."}
          </p>
        </div>
        <button className="button full" onClick={handoff}>
          Continue to signup <Icon name="arrow" size={18} />
        </button>
        {handoffError && (
          <p className="field-error" role="alert">
            {handoffError}
          </p>
        )}
        <Link className="button secondary full spaced" href="/share/">
          <Icon name="share" size={18} />
          Share with someone
        </Link>
        <div className="card-bottom">
          <Link href="/onboarding/">Edit my answers</Link>
          <span>Guidance is not a guarantee of safety.</span>
        </div>
        <StorageNotice />
      </CompleteGuard>
    </JourneyShell>
  );
}
export function Share() {
  const { handoff, handoffError } = useJourney();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let code: string | null = null;
    try {
      code = safeReferral(localStorage.getItem("scamshield.m1.share-code"));
    } catch {}
    if (!code) {
      code = "ss_" + crypto.getRandomValues(new Uint32Array(2)).join("");
      try {
        localStorage.setItem("scamshield.m1.share-code", code);
      } catch {}
    }
    let origin = ["http:", "https:"].includes(location.protocol)
      ? location.origin
      : "http://127.0.0.1:3000";
    try {
      const configured = new URL(process.env.NEXT_PUBLIC_SITE_URL || origin);
      if (["http:", "https:"].includes(configured.protocol))
        origin = configured.origin;
    } catch {}
    setUrl(`${origin}/?ref=${code}`);
    setCanShare(typeof navigator.share === "function");
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setStatus("Link copied — ready to paste.");
      emitEvent("referral_link_copied");
    } catch {
      input.current?.focus();
      input.current?.select();
      setStatus(
        "Copy is unavailable. The link is selected; use your device’s copy command.",
      );
    }
  }
  async function share() {
    try {
      await navigator.share({
        title: "ScamShield",
        text: "A calmer way to stay alert online.",
        url,
      });
      setStatus("Sharing opened. You can continue whenever you’re ready.");
    } catch (e) {
      setStatus(
        e instanceof Error && e.name === "AbortError"
          ? "Sharing cancelled. You can still copy the link or continue."
          : "Sharing is unavailable. Try copying the link instead.",
      );
    }
  }
  return (
    <JourneyShell
      eyebrow="Better habits, shared"
      title="Know someone who could use a little clarity?"
      description="Invite a friend or family member to discover ScamShield. Sharing is always optional."
    >
      <CompleteGuard>
        <div className="icon-tile large">
          <Icon name="share" size={28} />
        </div>
        <h2>{copied ? "Link copied" : "Share ScamShield"}</h2>
        <p>Your answers are not included in this link.</p>
        <label className="input-label" htmlFor="referral-link">
          Your referral link
        </label>
        <input
          ref={input}
          id="referral-link"
          className="link-input"
          value={url}
          readOnly
          onClick={(e) => e.currentTarget.select()}
        />
        <button className="button full" disabled={!url} onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={18} />
          {copied ? "Copied — ready to paste" : "Copy link"}
        </button>
        {canShare && (
          <button className="button secondary full spaced" onClick={share}>
            Share using my device <Icon name="share" size={18} />
          </button>
        )}
        <p role="status" className="share-status">
          {status}
        </p>
        <button className="text-button" onClick={handoff}>
          Not now — continue to signup <Icon name="arrow" size={16} />
        </button>
        {handoffError && (
          <p className="field-error" role="alert">
            {handoffError}
          </p>
        )}
        <p className="microcopy">
          Local preview links need the local server. Public sharing needs a
          hosted site. No invitation is sent automatically.
        </p>
        <Link href="/benefits/" className="subtle-link">
          Back to my benefits
        </Link>
      </CompleteGuard>
    </JourneyShell>
  );
}
export function Signup() {
  const [valid, setValid] = useState(false);
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(HANDOFF_KEY) || "null");
      setValid(
        c?.version === 1 &&
          c?.onboardingCompleted === true &&
          c?.expiresAt > Date.now() &&
          c?.expiresAt <= Date.now() + 30 * 60 * 1000,
      );
    } catch {}
  }, []);
  return (
    <JourneyShell
      eyebrow="Your introduction is complete"
      title="You’re ready for the next step."
      description="Your next stop is account signup, where you can review the available options."
    >
      <CompleteGuard>
        <div className="icon-tile large">
          <Icon name="check" size={28} />
        </div>
        <h2>Continue with ScamShield</h2>
        <p>
          You have finished the Module 1 journey. Account creation belongs to
          the next module.
        </p>
        <div className="notice boundary">
          <Icon name="info" />
          <div>
            <strong>Signup handoff preview</strong>
            <p>
              The Module 2 signup screen is not connected in this standalone
              frontend. No account has been created and no payment is taken.
            </p>
          </div>
        </div>
        <p className="microcopy">
          {valid
            ? "Your introduction context is ready for the signup module in this browser."
            : "Return to your benefits and select Continue to signup to prepare fresh context."}
        </p>
        <Link href="/benefits/" className="button full">
          Review my benefits <Icon name="arrow" size={18} />
        </Link>
        <Link className="button secondary full spaced" href="/">
          Back to the homepage
        </Link>
      </CompleteGuard>
    </JourneyShell>
  );
}
export function Privacy() {
  const { clear, storageError } = useJourney();
  const [message, setMessage] = useState("");
  return (
    <Shell>
      <main id="main-content" className="privacy-main container">
        <p className="eyebrow">Your preferences, explained</p>
        <h1>Privacy & browser storage</h1>
        <p className="intro-copy">
          We ask about your interests, not your private information.
        </p>
        <section>
          <h2>What stays in this browser</h2>
          <p>
            Your three selected preferences, current question and completion
            state are stored locally so you can resume. Progress expires seven
            days after the last saved change; expired data is removed when you
            next open the app. It is not synced across devices.
          </p>
          <p>
            A valid incoming referral code is retained for up to seven days. If
            the optional A/B experiment is enabled, its CTA assignment lasts up
            to seven days. A generated sharing code remains until you clear it.
            None of these links contains your answers.
          </p>
        </section>
        <section>
          <h2>Continuing to signup</h2>
          <p>
            Module 2 receives a browser-local draft context containing your
            interest category, completion indicator, optional referral code and
            a 30-minute expiry. The signup module must validate this context. It
            does not grant an account, subscription or safety score.
          </p>
        </section>
        <section>
          <h2>Analytics and other services</h2>
          <p>
            Analytics are disabled by default. A developer can enable a minimal
            browser event hook after the team reviews it. This download does not
            send events to a server. Events exclude answers, private messages,
            passwords and full URLs. This frontend makes no AI, authentication
            or database requests.
          </p>
        </section>
        <section>
          <h2>You’re in control</h2>
          <p>
            Never enter passwords, financial details or private messages into
            onboarding. Clear saved data below to remove your progress, signup
            context, referral and experiment data from this browser. If storage
            is blocked, the app explains that changes may only last in the open
            tab.
          </p>
          <button
            className="button secondary"
            onClick={() => {
              clear();
              setMessage(
                "Clear requested. Your current introduction has been reset.",
              );
            }}
          >
            Clear all ScamShield Module 1 data
          </button>
          <p role="status">{message}</p>
          {storageError && (
            <p className="field-error" role="alert">
              Browser storage is unavailable. We could not confirm removal of
              previously saved data. Clear site data in your browser settings.
            </p>
          )}
        </section>
        <Link href="/" className="text-button">
          Back to the homepage <Icon name="arrow" size={18} />
        </Link>
      </main>
    </Shell>
  );
}
