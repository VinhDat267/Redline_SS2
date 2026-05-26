import { Link } from "react-router-dom";
import {
  FileText, GitCompare, ShieldCheck, Bot, MessageSquare,
  Upload, ArrowRight, CheckCircle2, Zap, Lock, BarChart3,
  ChevronRight, Sparkles, Eye, Users, Star,
} from "lucide-react";
import "./landing.css";

/* ─── Navbar ─── */
function Navbar() {
  return (
    <nav className="landing-nav">
      <div className="landing-nav-inner">
        <Link to="/" className="landing-nav-brand">
          <div className="landing-nav-brand-mark">R</div>
          <span className="landing-nav-brand-name">Redline</span>
        </Link>
        <div className="landing-nav-links">
          <a href="#features" className="landing-nav-link">Features</a>
          <a href="#how-it-works" className="landing-nav-link">How It Works</a>
          <a href="#cta" className="landing-nav-link">Pricing</a>
        </div>
        <div className="landing-nav-actions">
          <Link to="/login" className="landing-btn landing-btn-ghost">Sign In</Link>
          <Link to="/login" className="landing-btn landing-btn-primary landing-btn-sm">
            Get Started <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ─── Hero ─── */
function HeroSection() {
  return (
    <section className="landing-hero">
      <div className="landing-container">
        <div className="landing-hero-inner">
          {/* Left: copy */}
          <div className="landing-hero-left">
            <div className="landing-hero-badge">
              <Sparkles size={13} />
              <span>AI-Powered Contract Intelligence</span>
            </div>
            <h1 className="landing-hero-title">
              Review Contracts<br />
              <span className="landing-hero-accent">Smarter & Faster</span>
            </h1>
            <p className="landing-hero-subtitle">
              Upload, compare, and review legal contracts with deterministic accuracy
              and AI-powered insights. Turn hours of manual review into minutes
              of focused decision-making.
            </p>
            <div className="landing-hero-actions">
              <Link to="/login" className="landing-btn landing-btn-primary landing-btn-lg">
                Get Started — Free <ArrowRight size={18} />
              </Link>
              <a href="#features" className="landing-btn landing-btn-outline landing-btn-lg">
                Explore Features <ChevronRight size={18} />
              </a>
            </div>
            <div className="landing-hero-trust">
              <div className="landing-hero-trust-item">
                <CheckCircle2 size={14} /><span>No credit card required</span>
              </div>
              <div className="landing-hero-trust-item">
                <CheckCircle2 size={14} /><span>Deterministic compare</span>
              </div>
              <div className="landing-hero-trust-item">
                <CheckCircle2 size={14} /><span>Human-confirmed reviews</span>
              </div>
            </div>
          </div>

          {/* Right: app preview */}
          <div className="landing-hero-right">
            <div className="landing-hero-preview-wrap">
              <div className="landing-preview-toolbar">
                <div className="landing-preview-toolbar-dots">
                  <span /><span /><span />
                </div>
                <div className="landing-preview-toolbar-url">
                  <Lock size={11} />
                  <span>redline.app / contracts / compare</span>
                </div>
              </div>
              <div className="landing-preview-body-2">
                <div className="landing-preview-sidebar">
                  <div className="landing-preview-nav-item landing-preview-nav-active">
                    <FileText size={13} /> Clause 2.1
                  </div>
                  <div className="landing-preview-nav-item">
                    <FileText size={13} /> Clause 3.4
                  </div>
                  <div className="landing-preview-nav-item">
                    <FileText size={13} /> Clause 5.2
                  </div>
                </div>
                <div className="landing-preview-content">
                  <div className="landing-preview-diff-row">
                    <div className="landing-preview-removed">
                      — Licensee shall not sublicense any rights...
                    </div>
                    <div className="landing-preview-added">
                      + Licensee may sublicense with prior written consent...
                    </div>
                  </div>
                  <div className="landing-preview-ai-row">
                    <Bot size={12} />
                    <span>AI Risk: Medium — Broader sublicensing rights</span>
                  </div>
                </div>
              </div>
              <div className="landing-preview-stat-row">
                <span className="landing-preview-stat-chip">
                  <GitCompare size={10} /> 12 changes detected
                </span>
                <span className="landing-preview-stat-chip">
                  <ShieldCheck size={10} /> 8 reviewed
                </span>
                <span className="landing-preview-stat-chip" style={{ color: "#F0B90B", borderColor: "#F0B90B44" }}>
                  <Zap size={10} /> 4 pending AI review
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats ticker ─── */
function StatsTicker() {
  const stats = [
    { value: "10×", label: "Faster Reviews" },
    { value: "99.9%", label: "Compare Accuracy" },
    { value: "100%", label: "Human-Confirmed" },
    { value: "< 60s", label: "To First Analysis" },
    { value: "0 AI", label: "Final Decisions" },
    { value: "24/7", label: "Always Available" },
  ];
  const doubled = [...stats, ...stats]; // for seamless loop
  return (
    <div className="landing-stats-strip" aria-hidden="true">
      <div className="landing-stats-ticker">
        {doubled.map((s, i) => (
          <div className="landing-stats-ticker-item" key={i}>
            <span className="landing-stats-ticker-value">{s.value}</span>
            <span className="landing-stats-ticker-label">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Features Bento ─── */
function FeaturesSection() {
  return (
    <section className="landing-features" id="features">
      <div className="landing-container">
        <div className="landing-section-label">Platform Capabilities</div>
        <h2 className="landing-section-title">
          Everything you need for<br />contract review
        </h2>
        <p className="landing-section-subtitle">
          A complete workflow from upload to export — deterministic accuracy at the
          foundation, AI intelligence layered on top.
        </p>

        <div className="landing-bento-grid">
          {/* Row 1 */}
          <div className="landing-bento-card span-2">
            <div className="landing-bento-num">01</div>
            <div className="landing-bento-icon-wrap"><GitCompare size={22} /></div>
            <h3 className="landing-bento-title">Deterministic Compare</h3>
            <p className="landing-bento-desc">
              Compare two DOCX contract drafts with pixel-perfect accuracy. Every clause
              change is detected — Added, Removed, or Modified — with zero AI guesswork.
              Parser truth is always exact.
            </p>
            <span className="landing-bento-tag"><CheckCircle2 size={11} /> Deterministic · No AI hallucination</span>
          </div>
          <div className="landing-bento-card span-1">
            <div className="landing-bento-num">02</div>
            <div className="landing-bento-icon-wrap"><Upload size={22} /></div>
            <h3 className="landing-bento-title">DOCX Upload & Parse</h3>
            <p className="landing-bento-desc">
              Upload contract drafts in DOCX format. Our parser extracts body, tables,
              headers, footers, and footnotes — preserving full document structure.
            </p>
          </div>

          {/* Row 2 */}
          <div className="landing-bento-card span-1">
            <div className="landing-bento-num">03</div>
            <div className="landing-bento-icon-wrap"><Bot size={22} /></div>
            <h3 className="landing-bento-title">AI-Powered Review</h3>
            <p className="landing-bento-desc">
              AI analyzes each clause change with full contract context. Get risk
              assessments, explanations, and suggested assignees powered by AI.
            </p>
            <span className="landing-bento-tag"><Sparkles size={11} /> AI Copilot · Citation-grounded</span>
          </div>
          <div className="landing-bento-card span-1">
            <div className="landing-bento-num">04</div>
            <div className="landing-bento-icon-wrap"><ShieldCheck size={22} /></div>
            <h3 className="landing-bento-title">Human-Confirmed Review</h3>
            <p className="landing-bento-desc">
              AI suggests, humans decide. Every review is confirmed by a real reviewer.
              AI never overwrites your final truth.
            </p>
          </div>
          <div className="landing-bento-card span-1">
            <div className="landing-bento-num">05</div>
            <div className="landing-bento-icon-wrap"><MessageSquare size={22} /></div>
            <h3 className="landing-bento-title">Contract Q&A</h3>
            <p className="landing-bento-desc">
              Ask questions about any contract. AI answers grounded in the actual parsed
              draft with citation references.
            </p>
          </div>

          {/* Row 3 */}
          <div className="landing-bento-card span-1">
            <div className="landing-bento-num">06</div>
            <div className="landing-bento-icon-wrap"><BarChart3 size={22} /></div>
            <h3 className="landing-bento-title">Analytics & Export</h3>
            <p className="landing-bento-desc">
              Track review progress, generate AI summaries, and export professional
              DOCX reports ready for stakeholders.
            </p>
          </div>
          <div className="landing-bento-card span-1">
            <div className="landing-bento-num">07</div>
            <div className="landing-bento-icon-wrap"><Users size={22} /></div>
            <h3 className="landing-bento-title">Team Collaboration</h3>
            <p className="landing-bento-desc">
              Invite team members, assign reviews, and track project activity with
              role-based access control.
            </p>
          </div>
          <div className="landing-bento-card span-1">
            <div className="landing-bento-num">08</div>
            <div className="landing-bento-icon-wrap"><Lock size={22} /></div>
            <h3 className="landing-bento-title">Truth Boundaries</h3>
            <p className="landing-bento-desc">
              Parser and compare results are always deterministic. AI writes suggestions
              only — never final truth.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works — horizontal timeline ─── */
function HowItWorksSection() {
  const steps = [
    { step: "01", icon: Upload, title: "Upload Drafts", desc: "Upload two DOCX contract drafts to your project workspace." },
    { step: "02", icon: GitCompare, title: "Compare Changes", desc: "Run a deterministic compare to detect every clause change." },
    { step: "03", icon: Bot, title: "AI Review", desc: "Get AI-powered risk analysis and explanations for each change." },
    { step: "04", icon: Eye, title: "Human Review", desc: "Confirm, modify, or reject AI suggestions. You're in control." },
    { step: "05", icon: BarChart3, title: "Export Report", desc: "Generate summaries and export professional DOCX reports." },
  ];
  return (
    <section className="landing-how" id="how-it-works">
      <div className="landing-container">
        <div className="landing-section-label">Workflow</div>
        <h2 className="landing-section-title">How it works</h2>
        <p className="landing-section-subtitle">
          Five simple steps from draft upload to finalized report — all in one platform.
        </p>
        <div className="landing-timeline">
          {steps.map((s) => (
            <div className="landing-timeline-step" key={s.step}>
              <div className="landing-timeline-node"><s.icon size={20} /></div>
              <div className="landing-timeline-num">{s.step}</div>
              <div className="landing-timeline-title">{s.title}</div>
              <p className="landing-timeline-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CTASection() {
  return (
    <section className="landing-cta" id="cta">
      <div className="landing-container">
        <div className="landing-cta-card">
          <div className="landing-cta-glow" aria-hidden="true" />
          <div className="landing-cta-left">
            <h2 className="landing-cta-title">
              Ready to streamline your<br />
              <span className="landing-cta-accent">contract review?</span>
            </h2>
            <p className="landing-cta-subtitle">
              Start reviewing contracts smarter today. Upload, compare, and review
              — all in one platform with AI intelligence and human oversight.
            </p>
          </div>
          <div className="landing-cta-right">
            <Link to="/login" className="landing-btn landing-btn-primary landing-btn-lg">
              Get Started <ArrowRight size={18} />
            </Link>
            <p className="landing-cta-meta">No credit card required · Free to start</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <div className="landing-nav-brand-mark">R</div>
            <span className="landing-footer-brand-name">Redline</span>
          </div>
          <p className="landing-footer-copy">
            © 2026 Redline — AI Contract Review.
          </p>
          <div className="landing-footer-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#cta">Get Started</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─── LandingPage ─── */
export function LandingPage() {
  return (
    <div className="landing-root">
      <Navbar />
      <HeroSection />
      <StatsTicker />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </div>
  );
}
