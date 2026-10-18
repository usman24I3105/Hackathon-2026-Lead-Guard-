import { Children, forwardRef, isValidElement, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { usePortalPosition } from "./usePortalPosition";

type ButtonVariant = "primary" | "secondary" | "ghost" | "tertiary" | "danger" | "danger-ghost";
type ButtonSize = "sm" | "md" | "lg";
type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  success?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  iconOnly?: boolean;
  focusableDisabled?: boolean;
} & (
  | { iconOnly: true; "aria-label": string; title: string }
  | { iconOnly?: false; "aria-label"?: string; title?: string }
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "primary",
  size = "lg",
  className = "",
  loading = false,
  success = false,
  leadingIcon,
  trailingIcon,
  iconOnly = false,
  focusableDisabled = false,
  disabled = false,
  onClick,
  children,
  "aria-label": ariaLabel,
  "aria-disabled": ariaDisabled,
  "aria-busy": ariaBusy,
  ...props
}: ButtonProps, ref) {
  const isDisabled = disabled || loading || ariaDisabled === true || ariaDisabled === "true";
  const nativeDisabled = (disabled || loading) && !focusableDisabled;
  const visualVariant = variant === "tertiary" ? "ghost" : variant;
  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>["onClick"] = (event) => {
    if (isDisabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      className={`ui-button ui-button--${visualVariant} ui-button--${size}${iconOnly ? " ui-button--icon-only" : ""} ${className}`}
      disabled={nativeDisabled}
      {...props}
      aria-label={ariaLabel}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || ariaBusy || undefined}
      data-state={loading ? "loading" : success ? "success" : undefined}
      onClick={handleClick}
    >
      <span className="ui-button-content">
        {success ? <Icon name="check" size={16} /> : leadingIcon}
        {children}
      </span>
      {trailingIcon && !loading && <span className="ui-button-trailing">{trailingIcon}</span>}
      {loading && <span className="ui-button-spinner" aria-hidden="true" />}
    </button>
  );
});

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

const inputBase = "w-full rounded-control border border-border bg-surface px-3 h-11 sm:h-10 text-sm text-text placeholder:text-text-muted focus-visible:border-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-ring";

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className = "", ...rest } = props;
  return <input className={`${inputBase} ${invalid ? "border-alarm" : ""} ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${inputBase} h-auto py-2 resize-none ${className}`} rows={3} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const {
    children, className = "", value, defaultValue, onChange, disabled = false, id, name, required, title, style,
    "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, ...rest
  } = props;
  const options = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child) || child.type !== "option") return [];
    const label = typeof child.props.children === "string" || typeof child.props.children === "number"
      ? String(child.props.children)
      : "Option";
    return [{ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled }];
  });
  const [uncontrolledValue, setUncontrolledValue] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const selectedValue = value === undefined ? uncontrolledValue : String(value);
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelStyle = usePortalPosition(open, anchorRef, panelRef, "bottom-start", 4);
  const searchable = options.length > 8;
  const visibleOptions = options.filter((option) => !searchable || option.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (anchorRef.current?.contains(event.target as Node) || panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open, searchable]);

  function choose(next: string) {
    if (value === undefined) setUncontrolledValue(next);
    onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    setQuery("");
  }

  function toggle() {
    if (disabled) return;
    setOpen((isOpen) => {
      if (!isOpen) {
        const selectedIndex = visibleOptions.findIndex((option) => option.value === selectedValue);
        setActiveIndex(Math.max(0, selectedIndex));
      }
      return !isOpen;
    });
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + visibleOptions.length) % visibleOptions.length);
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option && !option.disabled) choose(option.value);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      anchorRef.current?.focus();
    } else if (event.key === "Home" && open) {
      event.preventDefault(); setActiveIndex(0);
    } else if (event.key === "End" && open) {
      event.preventDefault(); setActiveIndex(Math.max(0, visibleOptions.length - 1));
    }
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      anchorRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? Math.max(0, visibleOptions.length - 1)
      : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + visibleOptions.length) % visibleOptions.length;
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => panelRef.current?.querySelectorAll<HTMLButtonElement>(".ui-select-option")[nextIndex]?.focus());
  }

  return <>
    <span className={`ui-select ${className}`} style={style} data-value={selectedValue}>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        title={title}
        role="combobox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id ?? "select"}-listbox` : undefined}
        aria-required={required || undefined}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        className={`ui-select-trigger ${className}`}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        {...rest as ButtonHTMLAttributes<HTMLButtonElement>}
      >
        <span className={selected ? "" : "text-text-muted"}>{selected?.label ?? "Select an option"}</span>
        <Icon name="chevron-down" size={15} />
      </button>
      <select className="ui-select-native" name={name} value={selectedValue} required={required} disabled={disabled} tabIndex={-1} aria-hidden="true" onChange={(event) => choose(event.target.value)}>
        {children}
      </select>
    </span>
    {open && createPortal(
      <div ref={panelRef} className="ui-select-popover" style={panelStyle} onKeyDown={onPanelKeyDown}>
        {searchable && <input ref={searchRef} className="ui-select-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => { if (event.key === "ArrowDown" && visibleOptions.length) { event.preventDefault(); panelRef.current?.querySelector<HTMLButtonElement>(".ui-select-option")?.focus(); } }} placeholder="Search options…" aria-label="Search options" />}
        <div id={`${id ?? "select"}-listbox`} role="listbox" aria-label={ariaLabel ?? "Options"} className="ui-select-options">
          {visibleOptions.map((option, index) => <button key={option.value} type="button" role="option" aria-selected={selectedValue === option.value} disabled={option.disabled} className="ui-select-option" data-active={index === activeIndex || undefined} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option.value)}>
            <span>{option.label}</span>{selectedValue === option.value && <Icon name="check" size={15} />}
          </button>)}
          {!visibleOptions.length && <p className="ui-select-no-results">No options found.</p>}
        </div>
      </div>, document.body
    )}
  </>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-border rounded-card shadow-card ${className}`}>{children}</div>;
}

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-md bg-neutral-bg ${className}`} style={style} />;
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
    <div className="flex items-center justify-between gap-3 rounded-card border px-4 py-3 text-sm" style={{ borderColor: "var(--alarm)", background: "var(--alarm-bg)", color: "var(--alarm)" }} role="alert">
      <span className="flex items-center gap-2"><span aria-hidden>⚠</span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="underline font-medium shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}
