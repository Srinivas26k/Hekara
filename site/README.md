# Hekara Website

Professional, modern static website for Hekara built with [Astro](https://astro.build). Inspired by modern SaaS design (like Xenora).

## Overview

This is a next-generation static site for Hekara, designed for modern home health agencies. Features:

- **Modern SaaS Design**: Blue gradient hero, clean cards, professional layout
- **Fully Static**: Lightning-fast load times, secure, no server-side processing
- **Professional Value Propositions**: Clear messaging for operations, clinical, and finance teams
- **Responsive & Accessible**: Mobile-first design with WCAG AA compliance
- **Performance Optimized**: 112KB for entire site (6 pages)
- **GitHub Pages Ready**: Deploy automatically with GitHub Actions

## Project Structure

```
site/
├── src/
│   ├── pages/           # Route pages (auto-generate URLs)
│   │   ├── index.astro  # Homepage with hero, features, comparison
│   │   ├── sponsor.astro    # Sponsorship info
│   │   ├── contact.astro    # Contact form
│   │   ├── terms.astro      # Terms of Service
│   │   ├── privacy.astro    # Privacy Policy
│   │   └── refunds.astro    # Refund Policy
│   ├── layouts/         # Reusable templates
│   │   └── BaseLayout.astro  # Header, footer, meta tags
│   ├── styles/          # Global CSS
│   │   └── global.css   # 15KB: design tokens, components
│   └── env.d.ts         # TypeScript definitions
├── astro.config.mjs     # Build config
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript
└── README.md            # This file
```

## Installation & Development

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)

### Setup

```bash
cd site
pnpm install
```

### Commands

```bash
pnpm dev              # Local server: http://localhost:3000
pnpm build            # Build dist/ folder
pnpm preview          # Preview production build
pnpm typecheck        # Type-check TypeScript
```

## Deployment to GitHub Pages

This site is configured for GitHub Pages at `https://srinivas26k.github.io/Hekara/`.

### Automatic Deployment

A GitHub Actions workflow (`.github/workflows/deploy-site.yml`) automatically:

1. Builds when code is pushed to `main` in the `site/` folder
2. Deploys to GitHub Pages
3. Publishes live at the GitHub Pages URL

### Manual Deployment

```bash
pnpm build
# Push dist/ to gh-pages branch or commit to docs/
```

## Design System

### Modern Blue SaaS Colors

- **Primary**: #0066cc (Deep blue) → #1a7de5 (Light blue)
- **Secondary**: #00d4ff (Cyan)
- **Accent**: #ffa500 (Orange)
- **Text**: #0f1419 (Near black)
- **Background**: #ffffff / #f5f5f5

### Responsive Breakpoints

- **Desktop**: 1024px and up
- **Tablet**: 768px
- **Mobile**: 480px
- Mobile-first CSS approach

### Component Library

- **Buttons**: Primary, secondary, dark, ghost, sizes (sm, lg)
- **Cards**: Hover effects, featured variant
- **Forms**: Input, textarea, labels, validation states
- **Grid**: 2-column, 3-column, 4-column layouts
- **Typography**: 6 heading sizes, semantic text utilities

## Homepage Sections

1. **Hero** - Blue gradient background, headline, CTAs, product preview
2. **Departments** - Use cases for Operations, Clinical, Finance
3. **Key Features** - 6 feature cards (encryption, portability, etc.)
4. **Tech Stack** - Backend, database, frontend, encryption tech
5. **Comparison Table** - Hekara vs Allscripts, Amedisys, Synophagy
6. **CTA Section** - Final call to action

## Accessibility

- Skip link for keyboard navigation
- Semantic HTML (`<header>`, `<main>`, `<footer>`, `<nav>`)
- ARIA labels on interactive elements
- Visible focus states on all buttons
- Color contrast meets WCAG AA
- Responsive design works on all devices
- Form labels properly associated with inputs

## Performance

- **Static HTML**: No JS frameworks or runtime overhead
- **Minimal CSS**: 15KB uncompressed, well-organized
- **No external dependencies**: Self-hosted fonts, icons, assets
- **Build time**: < 3 seconds for all 6 pages
- **Total size**: 112KB for entire site
- **CDN delivery**: Via GitHub Pages globally

## Maintenance

### Adding a New Page

1. Create `.astro` file in `src/pages/`:

   ```astro
   ---
   import BaseLayout from "../layouts/BaseLayout.astro";
   ---

   <BaseLayout title="Page Title" description="Description">
     <section class="section">
       <div class="container">
         <!-- Content -->
       </div>
     </section>
   </BaseLayout>
   ```

2. Update nav in `BaseLayout.astro` if needed
3. Run `pnpm build`

### Updating Design Tokens

Edit `src/styles/global.css` and change CSS variables:

```css
--primary: #0066cc; /* Blue */
--accent: #ffa500; /* Orange */
--text-primary: #0f1419; /* Text color */
```

### Updating Content

Edit individual `.astro` files, run `pnpm build` to regenerate.

## Security & Privacy

- **No tracking scripts**: No Google Analytics or third-party tools
- **No cookies**: No tracking or identification cookies
- **Self-hosted assets**: All logos, fonts, icons are local
- **CSP-compliant**: External origins blocked by default
- **No data collection**: Contact form data sent to email only

See [Privacy Policy](src/pages/privacy.astro) for details.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS 14+, Android 5+)

## License

The Hekara website is part of the Hekara project, licensed under AGPL-3.0. See the main repository LICENSE file.

## Questions?

- 📖 [Astro Docs](https://docs.astro.build)
- 🐛 [GitHub Issues](https://github.com/Srinivas26k/Hekara/issues)
- 📧 [Contact](https://hekara.io/contact)
