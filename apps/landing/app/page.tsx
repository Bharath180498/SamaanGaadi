import Image from 'next/image';

const LOGO_SRC = '/brand/qargo-logo.svg';

const features = [
  {
    tag: 'Booking',
    title: 'Instant pickup scheduling',
    body: 'Book in seconds with route and vehicle selection.'
  },
  {
    tag: 'Tracking',
    title: 'Live trip timeline',
    body: 'See status updates and ETA changes in real time.'
  },
  {
    tag: 'Proof',
    title: 'Photo + signature closure',
    body: 'Every delivery can close with digital proof.'
  },
  {
    tag: 'Pricing',
    title: 'Clear fare and discount lines',
    body: 'Compare-at price, savings, and final payable are visible.'
  }
];

const corridors = [
  {
    city: 'North India',
    route: 'Metro + NCR loops',
    eta: 'High-frequency',
    note: 'Fast city transfers and business dispatch.'
  },
  {
    city: 'West & Central',
    route: 'Commerce corridors',
    eta: 'City delivery active',
    note: 'Intercity routes are coming soon.'
  },
  {
    city: 'South & East',
    route: 'Tech + industrial belts',
    eta: 'Volume ready',
    note: 'Designed for repeat shipments at scale.'
  }
];

const flow = [
  {
    step: '01',
    title: 'Set route and load',
    body: 'Pickup, drop, goods, and vehicle.'
  },
  {
    step: '02',
    title: 'Confirm fare and book',
    body: 'Transparent pricing before checkout.'
  },
  {
    step: '03',
    title: 'Track and close',
    body: 'Live updates until proof of delivery.'
  }
];

const plans = [
  {
    badge: 'Launch Offer',
    name: 'Free 90 Days',
    price: 'Rs 0 for first 90 days',
    copy: 'Start free with unlimited rides for 3 months.',
    cta: 'Start Free Plan',
    perks: ['Unlimited rides', 'Live tracking', 'Proof of delivery']
  },
  {
    badge: 'Most Popular',
    name: 'Growth 50',
    price: 'Rs 800 / month',
    copy: 'Best for regular operators with controlled monthly volume.',
    cta: 'Choose Growth 50',
    recommended: true,
    perks: ['Up to 50 rides per month', 'AI dispatch', 'Priority support']
  },
  {
    badge: 'Unlimited',
    name: 'Pro Unlimited',
    price: 'Rs 2000 / month',
    copy: 'Unlimited rides every month for high-frequency drivers.',
    cta: 'Go Unlimited',
    perks: ['Unlimited rides per month', 'Priority dispatch lane', 'Performance insights']
  }
];

const previewShots = [
  {
    title: 'Customer App',
    caption: 'Booking and live tracking',
    src: '/mockups/customer-app.svg'
  },
  {
    title: 'Driver App',
    caption: 'Trip flow and proof capture',
    src: '/mockups/driver-app.svg'
  },
  {
    title: 'Ops Console',
    caption: 'Dispatch and performance view',
    src: '/mockups/ops-console.svg'
  }
];

type CollageTone = 'saffron' | 'indigo' | 'leaf' | 'gold';

type CollageShot = {
  src: string;
  title: string;
  tone: CollageTone;
};

const sectionVisuals: Record<'platform' | 'network' | 'flow', { label: string; shots: CollageShot[] }> = {
  platform: {
    label: 'App Layers',
    shots: [
      { src: '/mockups/customer-app.svg', title: 'Customer booking', tone: 'saffron' },
      { src: '/mockups/driver-app.svg', title: 'Driver trip state', tone: 'indigo' },
      { src: '/mockups/ops-console.svg', title: 'Ops command', tone: 'leaf' }
    ]
  },
  network: {
    label: 'Coverage Views',
    shots: [
      { src: '/mockups/ops-console.svg', title: 'Region dashboard', tone: 'indigo' },
      { src: '/mockups/customer-app.svg', title: 'City demand', tone: 'gold' },
      { src: '/mockups/driver-app.svg', title: 'Supply pulse', tone: 'leaf' }
    ]
  },
  flow: {
    label: 'Journey Stack',
    shots: [
      { src: '/mockups/customer-app.svg', title: 'Book', tone: 'saffron' },
      { src: '/mockups/driver-app.svg', title: 'Move', tone: 'leaf' },
      { src: '/mockups/ops-console.svg', title: 'Close', tone: 'indigo' }
    ]
  }
};

const footerColumns = [
  {
    title: 'Company',
    links: ['About Us', 'Careers', 'Blog', 'Partner Program']
  },
  {
    title: 'Quick Links',
    links: ['API Integrations', 'Packers & Movers', 'Two Wheelers', 'Trucks', 'Enterprise']
  },
  {
    title: 'Support',
    links: [
      'Contact Us',
      'Privacy Policy',
      'Terms of Service',
      'Insurance FAQs',
      'Driver Partner Terms',
      'Zero Tolerance Policy'
    ]
  },
  {
    title: 'Countries',
    links: ['India']
  }
];

const domesticCities = [
  'Bangalore',
  'Mysuru',
  'Mangaluru',
  'Hubballi',
  'Dharwad',
  'Belagavi',
  'Kalaburagi',
  'Shivamogga',
  'Tumakuru',
  'Davanagere',
  'Ballari',
  'Vijayapura',
  'Raichur',
  'Udupi',
  'Hassan',
  'Mandya',
  'Chikkamagaluru',
  'Kolar'
];

const socialLabels = ['f', 'x', 'ig', 'in', 'yt'];

function SectionCollage({
  label,
  shots,
  className
}: {
  label: string;
  shots: CollageShot[];
  className?: string;
}) {
  return (
    <aside className={`section-collage ${className ?? ''} fade-in-up delay-2`} aria-hidden="true">
      <p className="section-collage-label">{label}</p>
      <div className="section-collage-track">
        {shots.map((shot, index) => (
          <figure key={`${label}-${shot.title}-${index}`} className={`section-shot tone-${shot.tone} shot-${index + 1}`}>
            <Image src={shot.src} alt="" width={960} height={600} />
            <figcaption>{shot.title}</figcaption>
          </figure>
        ))}
      </div>
      <span className="section-cross section-cross-a" />
      <span className="section-cross section-cross-b" />
    </aside>
  );
}

export default function LandingPage() {
  return (
    <main className="page home-page">
      <header className="topbar fade-in-up">
        <a className="brand" href="#hero" aria-label="QARGO home">
          <Image src={LOGO_SRC} alt="QARGO logo" width={92} height={76} className="brand-logo-nav" priority />
          <div>
            <p className="brand-word">QARGO</p>
            <p className="brand-tag">simply deliver</p>
          </div>
        </a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#platform">Platform</a>
          <a href="#network">Network</a>
          <a href="#pricing">Pricing</a>
          <a href="/about">About</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <section className="hero" id="hero">
        <div className="hero-content">
          <p className="kicker fade-in-up delay-1">Welcome to the new AI era of logistics</p>
          <h1 className="hero-title fade-in-up delay-2">
            <span className="hero-brand">QARGO</span>
          </h1>
          <p className="hero-copy fade-in-up delay-3">
            Max driver profits through AI dispatch and smarter routing, with effortless booking and live tracking for
            customers across India.
          </p>
          <div className="actions fade-in-up delay-4">
            <a className="btn solid" href="#contact">
              Start With QARGO
            </a>
            <a className="btn ghost" href="#pricing">
              View Service Plans
            </a>
          </div>
          <div className="hero-pills fade-in-up delay-5" aria-label="Core strengths">
            <span>AI Dispatch</span>
            <span>Higher Driver Earnings</span>
            <span>Easy Customer Booking</span>
            <span>Live Tracking</span>
          </div>
        </div>
      </section>

      <section id="preview" className="band section-preview">
        <div className="section-head fade-in-up">
          <p className="eyebrow">Product Experience</p>
          <h2>One platform. Three seamless workflows.</h2>
        </div>
        <div className="preview-grid">
          {previewShots.map((shot, index) => (
            <article key={shot.title} className={`preview-card fade-in-up delay-${index + 1}`}>
              <div className="preview-media">
                <Image src={shot.src} alt={`${shot.title} preview`} width={1200} height={720} />
              </div>
              <div className="preview-meta">
                <h3>{shot.title}</h3>
                <p>{shot.caption}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="platform" className="band section-platform">
        <div className="section-head fade-in-up">
          <p className="eyebrow">Platform</p>
          <h2>Core capabilities for India-scale logistics.</h2>
        </div>
        <SectionCollage
          label={sectionVisuals.platform.label}
          shots={sectionVisuals.platform.shots}
          className="section-collage-platform"
        />
        <div className="feature-grid">
          {features.map((feature, index) => (
            <article key={feature.title} className={`feature-card fade-in-up delay-${(index % 3) + 1}`}>
              <p className="feature-tag">{feature.tag}</p>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="network" className="band section-network">
        <div className="section-head fade-in-up">
          <p className="eyebrow">India Network</p>
          <h2>Built for intra-city demand. Intercity coming soon.</h2>
          <p className="note">City operations are live now. City-to-city expansion is on roadmap.</p>
        </div>
        <SectionCollage
          label={sectionVisuals.network.label}
          shots={sectionVisuals.network.shots}
          className="section-collage-network"
        />
        <div className="corridor-grid">
          {corridors.map((item, index) => (
            <article key={item.route} className={`corridor-card fade-in-up delay-${index + 1}`}>
              <p className="corridor-city">{item.city}</p>
              <h3>{item.route}</h3>
              <p className="corridor-eta">{item.eta}</p>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="flow" className="band section-flow">
        <div className="section-head fade-in-up">
          <p className="eyebrow">How It Works</p>
          <h2>Booking to delivery in three steps.</h2>
        </div>
        <ol className="flow-grid">
          {flow.map((item, index) => (
            <li key={item.step} className={`flow-card fade-in-up delay-${index + 1}`}>
              <span className="flow-step">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="band section-pricing">
        <div className="section-head fade-in-up">
          <p className="eyebrow">Service Plans</p>
          <h2>Simple lanes for personal, business, and fleet operations.</h2>
          <p className="note">Choose your lane and scale when volume grows.</p>
        </div>
        <div className="pricing-grid">
          {plans.map((plan, index) => (
            <article
              key={plan.name}
              className={`pricing-card${plan.recommended ? ' recommended' : ''} fade-in-up delay-${index + 1}`}
            >
              <p className="pricing-badge">{plan.badge}</p>
              <h3>{plan.name}</h3>
              <p className="price">{plan.price}</p>
              <p className="plan-copy">{plan.copy}</p>
              <ul>
                {plan.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
              <a className={`btn ${plan.recommended ? 'solid' : 'ghost'}`} href="#contact">
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="contact" className="band cta fade-in-up">
        <p className="eyebrow">Contact QARGO</p>
        <h2>Move faster with an India-ready logistics stack.</h2>
        <p>Reach out for business onboarding, enterprise rollout, or partner integration support.</p>
        <div className="actions">
          <a className="btn solid" href="mailto:hello@qargo.in?subject=QARGO%20India%20Logistics%20Inquiry">
            Contact Team
          </a>
          <a className="btn ghost" href="tel:+919844259899">
            Call 9844259899
          </a>
        </div>
      </section>

      <footer className="mega-footer" id="footer">
        <div className="mega-footer-top">
          <section className="mega-brand-col" aria-label="Brand and social">
            <p className="mega-brand-word">QARGO</p>
            <p className="mega-brand-sub">Nationwide logistics, built for India.</p>

            <div className="mega-divider" />

            <p className="mega-follow-label">Follow us on</p>
            <div className="mega-social-row" aria-label="Social links">
              {socialLabels.map((label) => (
                <a key={label} href="#" className="mega-social-dot" aria-label={`QARGO on ${label}`}>
                  {label}
                </a>
              ))}
            </div>

            <p className="mega-app-inline">App available on iOS and Android.</p>
          </section>

          <section className="mega-links-grid" aria-label="Footer links">
            {footerColumns.map((column) => (
              <article key={column.title} className="mega-link-col">
                <h3>{column.title}</h3>
                <ul>
                  {column.links.map((item) => (
                    <li key={item}>
                      <a href="#">{item}</a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </div>

        <section className="mega-cities" aria-label="Domestic cities">
          <h3>Domestic Cities</h3>
          <ul className="mega-cities-grid">
            {domesticCities.map((city) => (
              <li key={city}>{city}</li>
            ))}
          </ul>
        </section>

        <section className="mega-legal" aria-label="Registered office information">
          <h4>Registered Office:</h4>
          <p>© {new Date().getFullYear()} Sarathi India Logistics Private Limited.</p>
          <p>Address: Aradeshanahalli gate, 151, Doddaballapura Main Rd, Suradhenupura, Bengaluru, Karnataka 562110</p>
          <p>CIN: U00000KA2026PTC000000</p>
          <p>Email: admin@qargo.in · Phone: 85169 96169</p>
        </section>
      </footer>
    </main>
  );
}
