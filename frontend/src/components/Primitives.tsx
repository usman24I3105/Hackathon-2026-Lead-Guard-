import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "tertiary" | "danger" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-medium px-4 h-11 sm:h-10 transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-ink text-paper hover:bg-ink/90",
    secondary: "bg-surface border border-line text-ink hover:border-ink/40",
    tertiary: "bg-transparent text-ink-2 hover:text-ink underline-offset-2 hover:underline",
    danger: "bg-alarm text-white hover:bg-alarm/90",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function FormField({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label} {required && <span style={{ color: "var(--alarm)" }}>*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-2">{hint}</p>}
      {error && <p className="text-xs" style={{ color: "var(--alarm)" }} role="alert">{error}</p>}
    </div>
  );
}

const inputBase = "w-full rounded-[10px] border border-line bg-surface px-3 h-11 sm:h-10 text-sm text-ink placeholder:text-ink-2/70 focus-visible:border-focus";

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className = "", ...rest } = props;
  return <input className={`${inputBase} ${invalid ? "border-alarm" : ""} ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${inputBase} h-auto py-2 resize-none ${className}`} rows={3} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select className={`${inputBase} ${className}`} {...rest} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-line rounded-[10px] ${className}`}>{children}</div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/60 ${className}`} />;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-12 px-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="text-sm text-ink-2 max-w-sm">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3 text-sm" style={{ borderColor: "var(--alarm)", background: "var(--alarm-bg)", color: "var(--alarm)" }} role="alert">
      <span className="flex items-center gap-2"><span aria-hidden>⚠</span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="underline font-medium shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}
