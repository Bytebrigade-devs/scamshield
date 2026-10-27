import { forwardRef, useId } from "react";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: React.ReactNode;
};

/** Labelled single-line input following the shared Input rules (guide §5). */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, icon, id, className = "", ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="field-label">{label}</label>
      <div className="relative"><input
        ref={ref}
        id={inputId}
        className={`input ${icon ? "pr-12" : ""} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...rest}
      />{icon && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted" aria-hidden="true">{icon}</span>}</div>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
});
