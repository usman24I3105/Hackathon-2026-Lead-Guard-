import type { ReactNode } from "react";
import { BrandLockup, Icon } from "../../components/icons";
import { StatusBadge } from "../../components/DesignSystem";

const benefits = [
  ["activity", "Instant lead alerts"],
  ["team", "Clear ownership and deadlines"],
  ["shield", "Nothing falls through the cracks"],
] as const;

export function AuthLayout({ children, title, subtitle, mode = "login" }: { children: ReactNode; title: string; subtitle: string; mode?: "login" | "signup" }) {
  const signup = mode === "signup";
  return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-label="About LeadGuard">
        <div className="auth-brand-content">
          <BrandLockup className="auth-lockup" />
          {signup ? <>
            <p className="auth-overline">A clearer way to grow</p>
            <h2>Create your workspace in <span>2 minutes.</span></h2>
            <ol className="auth-stepper">
              {["Account", "Workspace", "Invite team"].map((step, index) => <li key={step} className={index === 0 ? "is-current" : ""}><span>{index + 1}</span><strong>{step}</strong></li>)}
            </ol>
          </> : <>
            <p className="auth-overline">Lead follow-through, made clear</p>
            <h2>Every lead gets a reply. <span>Every time.</span></h2>
            <ul className="auth-benefits">{benefits.map(([icon, label]) => <li key={label}><span><Icon name={icon} size={19} /></span>{label}</li>)}</ul>
            <div className="auth-preview" aria-label="Lead response preview">
              <div className="auth-preview-top"><span>Latest response</span><StatusBadge label="Acknowledged" /></div>
              <div className="auth-preview-row"><span className="auth-preview-avatar">JR</span><div><strong>Jordan Rivera</strong><small>Roof inspection · Web form</small></div><span className="auth-preview-ring"><Icon name="check" size={15} /></span></div>
              <div className="auth-preview-foot"><span>Owned by Dana Chen</span><span>24 seconds</span></div>
            </div>
          </>}
          <p className="auth-brand-footer">Private workspace · Role-based access · Built for teams that respond</p>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand"><BrandLockup className="auth-lockup" /><p>Every lead gets a reply. Every time.</p></div>
          <div className="auth-form-heading"><p className="auth-overline">{signup ? "Get started" : "Secure workspace"}</p><h1>{title}</h1><p>{subtitle}</p></div>
          {children}
          <p className="auth-security-note"><Icon name="lock" size={14} /> Your workspace data stays private to your team.</p>
        </div>
      </section>
    </main>
  );
}
