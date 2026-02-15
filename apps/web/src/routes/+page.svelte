<svelte:head>
  <title>PolyGoneWild | Free Geometric Template Maker</title>
  <meta
    name="description"
    content="Create precise 3D forms and printable templates for pottery, papercraft, and design. Free, browser-based, no CAD required."
  />
</svelte:head>

<main class="landing">
  <section class="card hero">
    <div>
      <p class="kicker">Free & Open Source</p>
      <h1>Design printable 3D forms in seconds.</h1>
      <p class="lead">
        Create precise templates for pottery, papercraft, and geometric design. Customize dimensions, preview in real-time, and export ready-to-cut files.
      </p>
      <div class="cta-row">
        <a class="button button-primary" href="/app?start=guided">Start with a sample project</a>
        <a class="button" href="/app">Open blank workspace</a>
      </div>
    </div>

    <aside class="hero-panel">
      <h2>Why use PolyGoneWild?</h2>
      <ul>
        <li>100% free, runs in browser</li>
        <li>No CAD experience needed</li>
        <li>Export SVG, PDF, and STL</li>
      </ul>
    </aside>
  </section>

  <section class="card">
    <h2>How It Works</h2>
    <div class="steps">
      <article>
        <h3>1. Choose a Shape</h3>
        <p>Start with a simple prism, pyramid, or select from our library of polyhedra.</p>
      </article>
      <article>
        <h3>2. Customize</h3>
        <p>Adjust height, width, and seams. Watch your 2D and 3D previews update instantly.</p>
      </article>
      <article>
        <h3>3. Fabricate</h3>
        <p>Download clean SVG/PDF patterns for cutting, or STL files for 3D printing.</p>
      </article>
    </div>
  </section>

  <section class="card">
    <h2>What You Get</h2>
    <div class="proof-grid">
      <figure>
        <img
          src="/landing/polyhedron-dodecahedron-net.svg"
          alt="2D net template preview of a dodecahedron"
          loading="lazy"
        />
        <figcaption>2D template preview (dodecahedron)</figcaption>
      </figure>
      <figure>
        <img
          src="/landing/polyhedron-dodecahedron-wireframe.svg"
          alt="3D wireframe preview of a dodecahedron"
          loading="lazy"
        />
        <figcaption>3D form preview (dodecahedron)</figcaption>
      </figure>
      <article class="proof-copy">
        <h3>Production Ready</h3>
        <p>
          Get clean, layered files with cut and score lines. Support for tabbed seams and allowances makes assembly easy.
        </p>
        <a class="button button-primary" href="/app?start=guided">Try guided setup</a>
      </article>
    </div>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
  }

  .landing {
    --lp-bg-0: #0f1727;
    --lp-bg-1: #1a2538;
    --lp-card: #202d43;
    --lp-card-2: #273751;
    --lp-line: #384a66;
    --lp-ink: #f1f5fb;
    --lp-muted: #b8c5db;
    --lp-accent: #3c78ff;
    --lp-accent-2: #2f63d4;
    min-height: 100vh;
    width: 100%;
    margin: 0;
    padding: 1.2rem;
    box-sizing: border-box;
    display: grid;
    gap: 1rem;
    color: var(--lp-ink);
    font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
    background:
      radial-gradient(circle at 85% 10%, rgba(86, 154, 255, 0.25), transparent 38%),
      radial-gradient(circle at 15% 75%, rgba(67, 101, 172, 0.26), transparent 40%),
      linear-gradient(155deg, var(--lp-bg-0), var(--lp-bg-1));
  }

  .card {
    width: min(1100px, 100%);
    margin: 0 auto;
    border: 1px solid var(--lp-line);
    border-radius: 16px;
    padding: 1rem;
    background: var(--lp-card);
    box-shadow: 0 16px 34px rgba(3, 8, 18, 0.45);
  }

  .hero {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 0.9rem;
    align-items: stretch;
  }

  .hero-panel {
    border: 1px solid var(--lp-line);
    border-radius: 12px;
    padding: 0.8rem;
    background: var(--lp-card-2);
  }

  .hero-panel ul {
    margin: 0.5rem 0 0;
    padding-left: 1rem;
  }

  .hero-panel li {
    color: var(--lp-muted);
    margin-bottom: 0.3rem;
    font-size: 0.9rem;
  }

  .kicker {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #9fc1ff;
  }

  h1 {
    margin: 0.3rem 0 0;
    line-height: 1.15;
    font-size: clamp(1.7rem, 3vw, 2.4rem);
  }

  h2 {
    margin: 0 0 0.6rem;
    font-size: 1.22rem;
  }

  h3 {
    margin: 0;
    font-size: 1.02rem;
  }

  p {
    margin: 0.45rem 0;
    color: var(--lp-muted);
  }

  .lead {
    max-width: 58ch;
  }

  .cta-row {
    margin-top: 0.9rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    border: 1px solid #4f6487;
    border-radius: 10px;
    padding: 0.62rem 0.9rem;
    background: #324666;
    color: #e8eef9;
    font-weight: 600;
    transition: background 140ms ease, transform 140ms ease;
  }

  .button:hover {
    background: #3a5177;
    transform: translateY(-1px);
  }

  .button-primary {
    border-color: var(--lp-accent);
    background: var(--lp-accent);
    color: #f8fbff;
  }

  .button-primary:hover {
    background: var(--lp-accent-2);
  }

  .steps,
  .proof-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .steps article,
  figure,
  .proof-copy {
    margin: 0;
    border: 1px solid var(--lp-line);
    border-radius: 12px;
    padding: 0.75rem;
    background: var(--lp-card-2);
  }

  figure img {
    width: 100%;
    height: 185px;
    object-fit: contain;
    border: 1px solid #4f6487;
    border-radius: 9px;
    background: #d6dcea;
  }

  figcaption {
    margin-top: 0.4rem;
    color: #c7d4ea;
    font-size: 0.84rem;
  }

  .proof-copy {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .proof-copy .button {
    width: fit-content;
    margin-top: 0.55rem;
  }

  @media (max-width: 940px) {
    .hero,
    .steps,
    .proof-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
