function QargoLogoMark() {
  return (
    <svg
      width="88"
      height="72"
      viewBox="0 0 176 144"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="qargoBlue" x1="12" y1="9" x2="162" y2="140" gradientUnits="userSpaceOnUse">
          <stop stopColor="#74D2FF" />
          <stop offset="0.54" stopColor="#2F9BFF" />
          <stop offset="1" stopColor="#1657FF" />
        </linearGradient>
      </defs>
      <path d="M26 16C64-12 126-2 150 40C167 68 164 102 150 126H122C143 100 143 67 128 45C108 17 63 12 38 33L26 16Z" fill="url(#qargoBlue)" />
      <path d="M18 82L114 82C124 82 132 90 132 100V108H18V82Z" fill="url(#qargoBlue)" />
      <path d="M124 82H149C159 82 167 90 167 100V108H124V82Z" fill="url(#qargoBlue)" />
      <circle cx="56" cy="117" r="14" fill="#0A1323" stroke="url(#qargoBlue)" strokeWidth="6" />
      <circle cx="136" cy="117" r="14" fill="#0A1323" stroke="url(#qargoBlue)" strokeWidth="6" />
      <rect x="22" y="95" width="24" height="6" rx="3" fill="#0A1323" />
      <rect x="2" y="98" width="28" height="4" rx="2" fill="url(#qargoBlue)" />
    </svg>
  );
}

const flow = [
  {
    title: 'Customer books pickup',
    copy: 'Pickup and drop are selected in seconds with dynamic map hints.'
  },
  {
    title: 'QARGO dispatches nearest driver',
    copy: 'Matching engine uses location, ETA, and vehicle fit in real time.'
  },
  {
    title: 'Shipment tracked to delivery',
    copy: 'Driver movement and trip stage updates stay live for all parties.'
  }
];

const pricing = [
  {
    plan: 'Go',
    value: 'INR 500 / month',
    copy: 'City drivers and solo operators.',
    tone: 'go'
  },
  {
    plan: 'Pro',
    value: 'INR 1000 / month',
    copy: 'High-frequency drivers with priority support.',
    tone: 'pro'
  },
  {
    plan: 'Enterprise',
    value: 'Contact sales',
    copy: 'Fleet partners and contract logistics.',
    tone: 'enterprise'
  }
];

const stats = [
  { value: '5s', label: 'Location ping interval' },
  { value: '<60s', label: 'Median driver match target' },
  { value: '100k+', label: 'Driver scale architecture' },
  { value: '24x7', label: 'Ops + dispatch readiness' }
];

export default function LandingPage() {
  return (
    <main className="landing">
      <div className="halo halo-a" />
      <div className="halo halo-b" />
      <div className="grid-film" />

      <header className="nav wrap">
        <div className="brand">
          <QargoLogoMark />
          <div>
            <p className="brand-word">QARGO</p>
            <p className="brand-tag">simply deliver</p>
          </div>
        </div>
        <nav className="nav-links">
          <a href="#flow">Flow</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <section className="hero wrap">
        <div className="hero-copy reveal-up">
          <p className="kicker">India Logistics Network</p>
          <h1>Move goods. Stay on time. Scale without friction.</h1>
          <p>
            QARGO connects customers, drivers, and enterprise operations on one live movement layer with dispatch,
            tracking, and payment workflows built for Bharat.
          </p>
          <div className="hero-actions">
            <a className="action solid" href="#contact">
              Book Product Demo
            </a>
            <a className="action ghost" href="#pricing">
              View Pricing
            </a>
          </div>
        </div>

        <div className="hero-route reveal-up delay-2">
          <p className="route-label">Live movement arc</p>
          <svg className="route-svg" viewBox="0 0 600 260" aria-hidden="true">
            <defs>
              <linearGradient id="routePaint" x1="20" y1="20" x2="580" y2="240" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7CD6FF" />
                <stop offset="0.5" stopColor="#2FA3FF" />
                <stop offset="1" stopColor="#1C5DFF" />
              </linearGradient>
            </defs>
            <path
              d="M40 210C140 30 270 40 330 140C400 250 500 220 560 110"
              stroke="url(#routePaint)"
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="40" cy="210" r="10" fill="#7CD6FF" />
            <circle cx="330" cy="140" r="10" fill="#2FA3FF" />
            <circle cx="560" cy="110" r="10" fill="#1C5DFF" />
          </svg>
          <div className="route-legend">
            <span>Pick-up</span>
            <span>Driver Match</span>
            <span>Delivered</span>
          </div>
        </div>
      </section>

      <section className="stats wrap" aria-label="QARGO metrics">
        {stats.map((item) => (
          <article key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </section>

      <section id="flow" className="flow wrap reveal-up delay-2">
        <p className="kicker">How It Works</p>
        <h2>One seamless cycle from booking to proof of delivery</h2>
        <ol>
          {flow.map((step, index) => (
            <li key={step.title}>
              <span className="step-index">0{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="pricing wrap reveal-up delay-3">
        <p className="kicker">Driver Subscription Model</p>
        <h2>Drivers keep ride earnings. Platform fee starts after 90-day free window.</h2>
        <p className="trial-line">First 90 days: INR 0 subscription. Full earnings stay with the driver.</p>
        <div className="pricing-rail">
          {pricing.map((entry) => (
            <article key={entry.plan} className={`plan ${entry.tone}`}>
              <h3>{entry.plan}</h3>
              <p className="plan-value">{entry.value}</p>
              <p>{entry.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="contact" className="contact">
        <div className="wrap contact-inner">
          <div>
            <p className="kicker">Launch Ready</p>
            <h2>Put QARGO on your domain and start taking bookings.</h2>
            <p>Designed for customers, drivers, and operations teams from day one.</p>
          </div>
          <div className="contact-actions">
            <a className="action solid" href="mailto:hello@qargo.in?subject=QARGO%20Launch%20Demo">
              Contact Team
            </a>
            <a className="action ghost" href="tel:+919844259899">
              Call 9844259899
            </a>
          </div>
        </div>
      </section>

      <footer className="wrap footer">
        <div className="brand small">
          <QargoLogoMark />
          <div>
            <p className="brand-word">QARGO</p>
            <p className="brand-tag">simply deliver</p>
          </div>
        </div>
        <p>Copyright {new Date().getFullYear()} QARGO Logistics</p>
      </footer>
    </main>
  );
}
