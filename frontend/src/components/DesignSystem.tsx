import { Children, isValidElement, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Button } from "./Primitives";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  breadcrumb,
  badge,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="page-header">
      {breadcrumb && <div className="page-header-breadcrumb">{breadcrumb}</div>}
      <div className="page-header-main">
        <div className="page-header-copy">
          <p className="page-eyebrow">{eyebrow}</p>
          <div className="page-header-title-row"><h1>{title}</h1>{badge}</div>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}

const noticeIcons: Record<string, IconName> = {
  info: "info", warning: "warning", success: "check", danger: "warning", restricted: "lock",
};

export function Notice({
  variant = "info",
  children,
  title,
  action,
  onDismiss,
  className = "",
}: {
  variant?: "info" | "warning" | "success" | "danger" | "restricted";
  children?: ReactNode;
  title?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div className={`ui-notice ui-notice--${variant} ${className}`} role={variant === "danger" ? "alert" : "status"}>
      <Icon name={noticeIcons[variant]} size={16} />
      <div className="ui-notice-copy">{title && <strong>{title}</strong>}{children && <span>{children}</span>}</div>
      {action && <div className="ui-notice-action">{action}</div>}
      {onDismiss && <Button variant="ghost" size="sm" iconOnly aria-label="Dismiss notice" title="Dismiss notice" onClick={onDismiss}><Icon name="close" size={15} /></Button>}
    </div>
  );
}

export function FilterBar({ children, className = "", chips }: { children: ReactNode; className?: string; chips?: ReactNode }) {
  return <div className={`filter-bar-wrap ${className}`}><div className="filter-bar">{children}</div>{chips && <div className="filter-active-chips">{chips}</div>}</div>;
}

export type SegmentedTab<T extends string = string> = { value: T; label: ReactNode; count?: number };

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  className = "",
  as = "div",
}: {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  as?: "div" | "nav";
}) {
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const direction = getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1;
    const delta = event.key === "ArrowRight" ? direction : event.key === "ArrowLeft" ? -direction : 0;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]:not(:disabled)"));
    const focusedIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const activeIndex = focusedIndex >= 0 ? focusedIndex : buttons.findIndex((button) => button.value === value);
    let nextIndex = -1;
    if (delta) nextIndex = (activeIndex + delta + buttons.length) % buttons.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    if (nextIndex < 0 || !buttons.length) return;
    event.preventDefault();
    buttons[nextIndex].focus();
    onChange(buttons[nextIndex].value as T);
  }
  const children = <>
    {tabs.map((tab) => <button key={tab.value} type="button" role="tab" value={tab.value} aria-selected={value === tab.value} tabIndex={value === tab.value ? 0 : -1} onClick={() => onChange(tab.value)}>
      <span>{tab.label}</span>{tab.count != null && <span className="tab-count">{tab.count}</span>}
    </button>)}
  </>;
  return as === "nav"
    ? <nav className={className} role="tablist" aria-label={ariaLabel} aria-orientation="horizontal" onKeyDown={onKeyDown}>{children}</nav>
    : <div className={className} role="tablist" aria-label={ariaLabel} aria-orientation="horizontal" onKeyDown={onKeyDown}>{children}</div>;
}

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
const statusLabels: Record<string, { tone: StatusTone; icon: IconName }> = {
  acknowledged: { tone: "success", icon: "check" }, booked: { tone: "success", icon: "calendar" }, completed: { tone: "success", icon: "check" }, paid: { tone: "success", icon: "check" }, delivered: { tone: "success", icon: "check" },
  pending: { tone: "warning", icon: "clock" }, waiting: { tone: "warning", icon: "clock" },
  escalated: { tone: "danger", icon: "warning" }, failed: { tone: "danger", icon: "warning" }, overdue: { tone: "danger", icon: "warning" }, "opted out": { tone: "danger", icon: "close" },
  standard: { tone: "neutral", icon: "leads" }, new: { tone: "neutral", icon: "plus" },
  info: { tone: "info", icon: "info" },
};

export function StatusBadge({ label, tone, icon, title }: { label: string; tone?: StatusTone; icon?: IconName; title?: string }) {
  const mapped = statusLabels[label.toLowerCase()] ?? { tone: "neutral" as const, icon: "info" as const };
  const resolvedTone = tone ?? mapped.tone;
  return <span className={`status-badge status-badge--${resolvedTone}`} title={title}><Icon name={icon ?? mapped.icon} size={14} /><span>{label}</span></span>;
}

export function KpiTile({
  label,
  value,
  helper,
  icon,
  tone = "neutral",
  detail,
  onClick,
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  icon: IconName;
  tone?: StatusTone;
  detail?: ReactNode;
  onClick?: () => void;
}) {
  const content = <>
    <span className="kpi-tile-heading"><span className={`kpi-icon kpi-icon--${tone}`}><Icon name={icon} size={16} /></span><span className="kpi-label">{label}</span></span>
    <span className="kpi-value">{value}</span>
    {detail ?? (helper && <span className="kpi-helper" title={helper}>{helper}</span>)}
  </>;
  return onClick
    ? <button type="button" className="kpi-tile kpi-tile--interactive" onClick={onClick}>{content}</button>
    : <div className="kpi-tile">{content}</div>;
}

export function Tooltip({ children, content, className = "" }: { children: ReactNode; content: string; className?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  function containsDisabled(node: ReactNode): boolean {
    return Children.toArray(node).some((child) => {
      if (!isValidElement<{ disabled?: boolean; children?: ReactNode }>(child)) return false;
      return child.props.disabled === true || containsDisabled(child.props.children);
    });
  }
  const focusable = containsDisabled(children);
  return <span className={`ui-tooltip-anchor ${className}`} tabIndex={focusable ? 0 : undefined} aria-describedby={visible ? id : undefined} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onFocus={() => setVisible(true)} onBlur={() => setVisible(false)}>
    {children}<span id={id} role="tooltip" className="ui-tooltip" data-visible={visible || undefined}>{content}</span>
  </span>;
}

export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="ui-switch" data-checked={checked || undefined} onClick={() => onChange(!checked)}><span /></button>;
}

export function Checkbox({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <label className={`ui-checkbox ${disabled ? "is-disabled" : ""}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /><span>{label}</span></label>;
}
