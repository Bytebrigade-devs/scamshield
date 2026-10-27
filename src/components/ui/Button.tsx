import { forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "text" | "danger";
export type ButtonSize = "md" | "lg";
// Keep full class names visible to Tailwind's content scanner.
const variantClasses: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  text: "btn-text",
  danger: "btn-danger",
};

/** Class string for anything that should look like a button (e.g. next/link). */
export function buttonClass({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return ["btn", variantClasses[variant], size === "lg" && "btn-lg", block && "btn-block", className]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner, blocks duplicate submission and swaps in `loadingLabel`. */
  loading?: boolean;
  loadingLabel?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", block, loading = false, loadingLabel, className, children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
});
