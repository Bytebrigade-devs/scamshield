import Link from "next/link";
export default function NotFound() {
  return (
    <main className="container privacy-main">
      <p className="eyebrow">ScamShield</p>
      <h1>Let’s find your way back.</h1>
      <p>
        This page is unavailable. Your saved onboarding progress stays in this
        browser.
      </p>
      <Link className="button" href="/">
        Back to the homepage
      </Link>
    </main>
  );
}
