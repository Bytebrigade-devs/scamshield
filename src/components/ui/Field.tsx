"use client";

import { forwardRef, useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: React.ReactNode;
};

/** Labelled single-line input following the shared Input rules (guide §5). */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, icon, id, className = "", type, disabled, ...rest },
  ref
) {
  const autoId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="field-label">{label}</label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword && showPassword ? "text" : type}
          disabled={disabled}
          className={`input ${isPassword || icon ? "pr-12" : ""} ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={`${showPassword ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-controls={inputId}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-px flex w-11 items-center justify-center rounded-control text-muted hover:text-primary focus-visible:outline-offset-[-3px] disabled:opacity-50"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : icon && (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
});
