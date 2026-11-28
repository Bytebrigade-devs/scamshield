"use client";

/**
 * M4 checker — small presentation pieces shared by more than one screen.
 *
 * These are thin wrappers over the markup the vanilla screen produced, so the stylesheet keeps
 * working unchanged: a heading block, a native disclosure, and the focus helpers the screens use
 * to move the user's attention to the verdict or the first invalid field.
 */

import { useEffect, type ReactNode } from "react";

import { useChecker } from "./provider";

export function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
    </>
  );
}

/**
 * Native `<details>` disclosure so secondary result material is opt-in and keyboard-operable.
 * The summary is the native control, so no custom expanded state is needed.
 */
export function Disclosure({ title, meta, children }: { title: string; meta?: string | null; children: ReactNode }) {
  return (
    <details className="disclosure">
      <summary className="disclosure__summary">
        <span className="disclosure__title">{title}</span>
        {meta ? <span className="disclosure__meta">{meta}</span> : null}
        <span className="disclosure__chevron" aria-hidden="true" />
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}

/** Move focus to the screen heading without scrolling the user away from the top. */
export function focusHeading(): void {
  if (typeof document === "undefined") return;
  const title = document.querySelector<HTMLElement>("#view h1");
  if (!title) return;
  title.setAttribute("tabindex", "-1");
  title.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

/**
 * Focus the verdict/history heading once per mount. Both screens are replaced wholesale, so a
 * fresh heading should take focus the way it did when the vanilla renderer rebuilt the view.
 */
export function useHeadingFocus(): void {
  useEffect(() => {
    focusHeading();
  }, []);
}

/**
 * Apply the provider's focus request. Keyed on the nonce so two requests for the same target
 * (for example two failed submissions) both move focus.
 */
export function useRequestedFocus(register: {
  textarea: () => HTMLElement | null;
  sender: () => HTMLElement | null;
}): void {
  const { focus } = useChecker();
  useEffect(() => {
    if (!focus) return;
    switch (focus.target) {
      case "textarea":
        register.textarea()?.focus();
        break;
      case "sender":
        register.sender()?.focus();
        break;
      case "alert":
        document.getElementById("form-error")?.focus();
        break;
      case "heading":
        focusHeading();
        break;
    }
    // `register` is rebuilt every render; the nonce is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, focus?.target]);
}
