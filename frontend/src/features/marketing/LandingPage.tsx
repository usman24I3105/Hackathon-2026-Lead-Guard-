import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, ShieldLogo } from "../../components/icons";
import "./landing.css";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#platform", label: "Platform" },
  { href: "#teams", label: "Who it’s for" },
];

const DEMO_STEPS = [
  {
    label: "New enquiry",
    status: "Waiting",
    owner: "Dana Chen",
    initials: "DC",
    timer: "00:10",
    timerLabel: "to acknowledge",
    note: "Assigned to Dana. Her response window has started.",
    position: 0,
  },
  {
    label: "Escalated",
    status: "Escalated",
    owner: "Sara Mills",
    initials: "SM",
    timer: "00:08",
    timerLabel: "new response window",
    note: "No acknowledgement. LeadGuard moved the lead to Sara.",
    position: 50,
  },
  {
    label: "Acknowledged",
    status: "Acknowledged",
    owner: "Sara Mills",
    initials: "SM",
    timer: "Done",
    timerLabel: "response recorded",
    note: "Sara picked it up. The response clock has stopped.",
    position: 100,
  },
];

const CAPABILITIES = [
  {
    icon: "leads" as const,
    title: "Lead operations",
    body: "Capture enquiries, assign a clear owner, and keep response deadlines visible.",
    links: "Relay · Lead records · Recovery",
  },
  {
    icon: "contacts" as const,
    title: "Customer context",
    body: "Keep people, companies, conversations, and opportunities connected in one view.",
    links: "Contacts · Companies · Pipeline",
  },
  {
    icon: "calendar" as const,
    title: "Follow-through",
    body: "Give the team one place to see messages, appointments, and payment status.",
    links: "Conversations · Appointments · Payments",
  },
  {
    icon: "team" as const,
    title: "Team control",
    body: "See availability, review the activity trail, and manage workspace connections.",
    links: "Team · Audit · Integrations · Settings",
  },
];

function RelayPreview() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = DEMO_STEPS[step];

  useEffect(() => {
    if (!playing) return;
    if (step === DEMO_STEPS.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((currentStep) => Math.min(currentStep + 1, DEMO_STEPS.length - 1)), 1100);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  function playRelay() {
    setStep(0);
    setPlaying(true);
  }

  return (
    <div className="landing-demo-wrap" id="relay-demo">
      <div className="landing-demo-caption"><span className="landing-demo-caption-dot" /> Interactive product preview <span>Sample data</span></div>
      <section className="landing-demo-window" aria-label="Interactive lead handoff preview">
        <div className="landing-demo-topbar">
          <div className="landing-window-controls" aria-hidden="true"><i /><i /><i /></div>
          <div className="landing-demo-breadcrumb"><ShieldLogo size={18} /><span>LeadGuard</span><span className="landing-breadcrumb-separator">/</span><strong>Relay</strong></div>
          <span className="landing-demo-live"><span /> Preview</span>
        </div>

        <div className="landing-demo-content">
          <div className="landing-demo-heading">
            <div>
              <span className="landing-demo-overline">New lead · Public form</span>
              <h2>Sofia Carter</h2>
              <p>Roof repair estimate <span>·</span> 10:42 am</p>
            </div>
            <span className={`landing-demo-state-badge state-${step}`}>{current.status}</span>
          </div>

          <div className="landing-demo-track" style={{ "--demo-progress": `${current.position}%` } as React.CSSProperties}>
            <div className="landing-demo-track-line"><span /></div>
            <span className="landing-demo-track-marker" aria-hidden="true" />
            {DEMO_STEPS.map((item, index) => (
              <div key={item.label} className={`landing-demo-stop ${index <= step ? "is-reached" : ""} ${index === step ? "is-current" : ""}`}>
                <span className="landing-demo-stop-icon">
                  <Icon name={index === 0 ? "leads" : index === 1 ? "recovery" : "check"} size={15} />
                </span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          <div className="landing-demo-owner" key={step}>
            <div className="landing-demo-owner-avatar">{current.initials}</div>
            <div className="landing-demo-owner-copy"><span>Current owner</span><strong>{current.owner}</strong></div>
            <div className={`landing-demo-timer ${step === 2 ? "is-done" : step === 1 ? "is-escalated" : ""}`}>
              <Icon name="activity" size={16} />
              <div><strong>{current.timer}</strong><span>{current.timerLabel}</span></div>
            </div>
          </div>

          <p className="landing-demo-note" aria-live="polite">{current.note}</p>

          <div className="landing-demo-controls">
            <div className="landing-demo-step-buttons" role="group" aria-label="Preview relay stages">
              {DEMO_STEPS.map((item, index) => (
                <button key={item.label} type="button" aria-pressed={step === index} onClick={() => { setStep(index); setPlaying(false); }}>
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" className="landing-play-button" onClick={playing ? () => setPlaying(false) : playRelay}>
              <Icon name={playing ? "close" : "play"} size={14} /> {playing ? "Stop" : step === 2 ? "Replay" : "Play relay"}
            </button>
          </div>
        </div>
      </section>
      <div className="landing-demo-footnote"><Icon name="shield" size={14} /> A clear owner and response window at every step.</div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(".landing-reveal");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-in-view"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in-view");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -32px 0px" });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main">Skip to content</a>
      <section className="landing-hero-shell">
        <div className="landing-ambient landing-ambient-one" aria-hidden="true" />
        <div className="landing-ambient landing-ambient-two" aria-hidden="true" />
        <header className="landing-nav-wrap">
          <div className="landing-nav">
            <Link to="/" className="landing-brand" aria-label="LeadGuard home">
              <ShieldLogo size={30} /><span>LeadGuard</span>
            </Link>
            <nav className={`landing-nav-links ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
              {NAV_LINKS.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>)}
              <Link className="landing-mobile-signin" to="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
            </nav>
            <div className="landing-nav-actions">
              <Link to="/login" className="landing-signin">Sign in</Link>
              <Link to="/signup" className="brand-gradient-button landing-nav-cta">Create workspace <Icon name="arrow-right" size={15} /></Link>
            </div>
            <button type="button" className="landing-menu-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              <Icon name={menuOpen ? "close" : "menu"} size={21} />
            </button>
          </div>
        </header>

        <main id="main">
          <div className="landing-hero">
            <div className="landing-hero-copy">
              <div className="landing-eyebrow"><span className="landing-eyebrow-mark"><Icon name="activity" size={14} /></span> Lead response, under control</div>
              <h1>Turn every enquiry into a <span>clear next move.</span></h1>
              <p className="landing-hero-description">LeadGuard gives every new lead an owner, starts a response clock, and escalates when it goes unanswered—so the next step is never a mystery.</p>
              <div className="landing-hero-actions">
                <Link to="/signup" className="brand-gradient-button landing-primary-cta">Create your workspace <Icon name="arrow-right" size={17} /></Link>
                <a href="#relay-demo" className="landing-secondary-cta"><span className="landing-play-disc"><Icon name="play" size={12} /></span> See a relay in action</a>
              </div>
              <div className="landing-hero-note"><span className="landing-note-check"><Icon name="check" size={12} /></span> Built for teams where the first response matters.</div>
            </div>
            <div className="landing-hero-visual"><RelayPreview /></div>
          </div>
          <a className="landing-scroll-cue" href="#how-it-works"><span /> Explore the platform</a>
        </main>
      </section>

      <section className="landing-intro landing-reveal" id="how-it-works">
        <div className="landing-section-heading">
          <p className="landing-section-kicker">The moment a lead arrives</p>
          <h2>Less chasing. More clear next steps.</h2>
          <p>LeadGuard turns a loose handoff into a simple, visible sequence your whole team can follow.</p>
        </div>
        <div className="landing-flow">
          <article className="landing-flow-step">
            <div className="landing-flow-icon flow-violet"><Icon name="leads" size={20} /></div>
            <div><h3>Capture the enquiry</h3><p>Bring in a lead from your form or add it directly to the workspace.</p></div>
          </article>
          <span className="landing-flow-connector" aria-hidden="true"><span /></span>
          <article className="landing-flow-step">
            <div className="landing-flow-icon flow-orchid"><Icon name="team" size={20} /></div>
            <div><h3>Make ownership visible</h3><p>Give the next response to a named teammate with a clear acknowledgement window.</p></div>
          </article>
          <span className="landing-flow-connector" aria-hidden="true"><span /></span>
          <article className="landing-flow-step">
            <div className="landing-flow-icon flow-rose"><Icon name="recovery" size={20} /></div>
            <div><h3>Keep it moving</h3><p>Escalate unanswered leads and bring at-risk work into the recovery queue.</p></div>
          </article>
        </div>
      </section>

      <section className="landing-platform" id="platform">
        <div className="landing-platform-inner">
          <div className="landing-section-heading landing-reveal">
            <p className="landing-section-kicker">One workspace, connected work</p>
            <h2>From first hello to follow-through.</h2>
            <p>LeadGuard brings the operational pieces around a lead together, so your team can keep context without jumping between disconnected lists.</p>
          </div>
          <div className="landing-capabilities">
            {CAPABILITIES.map((capability, index) => (
              <article key={capability.title} className={`landing-capability landing-reveal capability-${index + 1}`}>
                <span className="landing-capability-icon"><Icon name={capability.icon} size={19} /></span>
                <div className="landing-capability-copy"><h3>{capability.title}</h3><p>{capability.body}</p><span>{capability.links}</span></div>
                <Icon name="arrow-right" size={16} className="landing-capability-arrow" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-focus" id="teams">
        <div className="landing-focus-inner landing-reveal">
          <div className="landing-focus-copy">
            <p className="landing-section-kicker">Made for the handoff</p>
            <h2>Know what needs attention before the day gets away from you.</h2>
            <p>When enquiries arrive across a busy team, the hard part is knowing who owns the next move. Relay makes that visible, and Recovery gives missed follow-ups a place to return to.</p>
            <ul className="landing-benefit-list">
              <li><Icon name="check" size={16} /> See the current owner and acknowledgement status</li>
              <li><Icon name="check" size={16} /> Follow the escalation path as it changes</li>
              <li><Icon name="check" size={16} /> Keep an activity trail for the team</li>
            </ul>
            <Link to="/signup" className="landing-text-link">Set up your workspace <Icon name="arrow-right" size={15} /></Link>
          </div>
          <div className="landing-focus-art" aria-label="Illustration of a lead moving through a team handoff">
            <div className="landing-art-orbit orbit-one" />
            <div className="landing-art-orbit orbit-two" />
            <div className="landing-art-path"><span /><span /><span /></div>
            <div className="landing-art-node node-one"><span>DC</span><i /></div>
            <div className="landing-art-node node-two"><span>SM</span><i /></div>
            <div className="landing-art-node node-three"><span>IQ</span><i /></div>
            <div className="landing-art-lead"><span className="art-lead-icon"><Icon name="leads" size={16} /></span><span><b>Roof estimate</b><small>Owner confirmed</small></span><Icon name="check" size={15} /></div>
            <div className="landing-art-caption"><span className="landing-art-caption-dot" /> Every lead has somewhere to go next</div>
          </div>
        </div>
      </section>

      <section className="landing-audience landing-reveal">
        <div className="landing-audience-inner">
          <div><p className="landing-section-kicker">For teams that depend on follow-up</p><h2>Make responsiveness a team habit.</h2></div>
          <p>Whether you handle service requests, sales enquiries, or booked consultations, LeadGuard helps your team respond with clear ownership and fewer dropped handoffs.</p>
          <Link to="/signup" className="brand-gradient-button landing-audience-cta">Create workspace <Icon name="arrow-right" size={16} /></Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <Link to="/" className="landing-brand"><ShieldLogo size={26} /><span>LeadGuard</span></Link>
          <p>Clear ownership. Faster follow-up.</p>
          <div className="landing-footer-links"><a href="#how-it-works">How it works</a><a href="#platform">Platform</a><Link to="/login">Sign in</Link></div>
        </div>
        <div className="landing-footer-bottom"><span>© {new Date().getFullYear()} LeadGuard</span><span>Every lead deserves a next step.</span></div>
      </footer>
    </div>
  );
}
