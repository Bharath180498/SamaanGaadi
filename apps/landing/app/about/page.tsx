import Image from 'next/image';
import Link from 'next/link';

const LOGO_SRC = '/brand/qargo-logo.svg';

const team = [
  {
    name: 'Bharath Raghunath',
    role: 'Chief Vibe Coder • Techy Trailblazer',
    tagline: 'Builds the product rails, the dispatch brains, and the systems that make QARGO feel effortless.',
    accent: 'tech'
  },
  {
    name: 'Mohan Kamaraji',
    role: 'Chief Heisenberg of Ops • Doctor-Turned-Entrepreneur',
    tagline: 'Brings clinical precision to ground operations and turns real-world logistics chaos into repeatable playbooks.',
    accent: 'ops'
  },
  {
    name: 'Chinmay Mohan',
    role: 'Social Media Head • Chief Doom Scroller',
    tagline: 'Owns QARGO’s voice online, shapes market buzz, and keeps the brand energy bold, current, and unforgettable.',
    accent: 'brand'
  }
];

export default function AboutPage() {
  return (
    <main className="page about-page">
      <div className="cosmos-layer" aria-hidden="true" />
      <div className="scan-grid" aria-hidden="true" />
      <div className="aurora a1" aria-hidden="true" />
      <div className="aurora a2" aria-hidden="true" />
      <div className="aurora a3" aria-hidden="true" />

      <header className="topbar fade-in-up">
        <Link className="brand" href="/">
          <Image src={LOGO_SRC} alt="QARGO logo" width={92} height={76} className="brand-logo-nav" priority />
          <div>
            <p className="brand-word">QARGO</p>
            <p className="brand-tag">simply deliver</p>
          </div>
        </Link>
        <nav className="nav-links">
          <Link href="/">Home</Link>
          <a href="#team">Team</a>
          <a href="#mission">Mission</a>
          <a href="mailto:hello@qargo.in?subject=QARGO%20About">Contact</a>
        </nav>
      </header>

      <section className="about-hero" id="mission">
        <p className="eyebrow fade-in-up delay-1">About QARGO</p>
        <h1 className="fade-in-up delay-2">Driver-first by design. Customer-smooth by default.</h1>
        <p className="about-copy fade-in-up delay-3">
          QARGO is a goods ride-hailing platform built around driver realities and operational truth on Indian roads.
          We obsess over seamless booking and delivery for customers, while making daily work simpler, fairer, and more
          rewarding for driver partners.
        </p>
      </section>

      <section className="band section-about-team" id="team">
        <div className="section-head fade-in-up">
          <p className="eyebrow">People Behind QARGO</p>
          <h2>Small team. Sharp execution. Big intent.</h2>
        </div>
        <div className="team-grid">
          {team.map((member, index) => (
            <article key={member.name} className={`team-card ${member.accent} fade-in-up delay-${index + 1}`}>
              <p className="team-role">{member.role}</p>
              <h3>{member.name}</h3>
              <p>{member.tagline}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="band cta fade-in-up">
        <p className="eyebrow">Work With Us</p>
        <h2>Want to build the next chapter of QARGO?</h2>
        <p>Reach out for product demos, partnerships, and city launch conversations.</p>
        <div className="actions">
          <a className="btn solid" href="mailto:hello@qargo.in?subject=QARGO%20Team%20Intro">
            Talk to Team
          </a>
          <Link className="btn ghost" href="/">
            Back to Home
          </Link>
        </div>
      </section>

      <footer className="footer">
        <span>QARGO</span>
        <span>Copyright {new Date().getFullYear()} QARGO Logistics</span>
      </footer>
    </main>
  );
}
