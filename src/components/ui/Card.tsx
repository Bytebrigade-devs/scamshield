import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon } from "./icons";

export function Card({
  as: Tag = "div",
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article" }) {
  return <Tag className={`card ${className}`} {...rest} />;
}

type Tone = "success" | "warning" | "danger";
const ICONS = { success: CheckCircleIcon, warning: AlertTriangleIcon, danger: AlertCircleIcon };
const TONE_CLASSES: Record<Tone, string> = {
  success: "alert-success",
  warning: "alert-warning",
  danger: "alert-danger",
};

/** Status message: colour + icon + text, never colour alone (guide §2 rule 3). */
export function Alert({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const Icon = ICONS[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`alert ${TONE_CLASSES[tone]} ${className}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
