// Single source of truth for site-wide facts, structured data and the sitemap.

export const SITE = "https://srinivas26k.github.io/Hekara/";
export const REPO = "https://github.com/Srinivas26k/Hekara";
export const UPDATED = "2026-11-26";

export const PAGES = [
  { path: "", priority: "1.0", changefreq: "weekly" },
  { path: "services/", priority: "0.9", changefreq: "monthly" },
  { path: "contact/", priority: "0.8", changefreq: "monthly" },
  { path: "sponsor/", priority: "0.6", changefreq: "monthly" },
  { path: "privacy/", priority: "0.2", changefreq: "yearly" },
  { path: "terms/", priority: "0.2", changefreq: "yearly" },
  { path: "refunds/", priority: "0.2", changefreq: "yearly" },
];

const id = (frag: string) => `${SITE}#${frag}`;

export const GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": id("org"),
      name: "Hekara",
      url: SITE,
      logo: `${SITE}logo-symbol.svg`,
      sameAs: [REPO, "https://www.producthunt.com/products/hekara"],
      founder: { "@id": id("maintainer") },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "sales",
        url: `${SITE}contact/`,
        availableLanguage: ["en"],
      },
    },
    {
      "@type": "Person",
      "@id": id("maintainer"),
      name: "Nampalli Srinivas",
      url: "https://github.com/Srinivas26k",
    },
    {
      "@type": "WebSite",
      "@id": id("website"),
      url: SITE,
      name: "Hekara",
      description: "Open-source, self-hosted operations software for home health agencies.",
      publisher: { "@id": id("org") },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": id("software"),
      name: "Hekara",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Home health agency scheduling and operations",
      operatingSystem: "Web; self-hosted on Node.js and PostgreSQL",
      softwareVersion: "0.1 (alpha)",
      url: SITE,
      downloadUrl: REPO,
      screenshot: `${SITE}images/schedule.png`,
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Live day and week schedule of caregivers and visits",
        "One-click open-shift filling with skill, overlap and weekly-limit checks",
        "Rule-based Copilot suggestions and overtime watch",
        "Credential expiry tracking (CPR, TB, background checks)",
        "Encrypted patient records and care plans",
        "Billing and claims workflow; reports with CSV export",
        "Four roles: admin, scheduler, caregiver, billing",
        "Passkeys, TOTP and a hash-chained audit log",
        "Field-level AES-256-GCM encryption of patient data",
      ],
      audience: { "@type": "BusinessAudience", audienceType: "Home health and home care agencies" },
      publisher: { "@id": id("org") },
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": id("source"),
      name: "Hekara source code",
      codeRepository: REPO,
      programmingLanguage: ["TypeScript", "SQL"],
      runtimePlatform: "Node.js",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      targetProduct: { "@id": id("software") },
    },
    ...[
      ["implementation", "Hekara implementation in your cloud tenant", "Production deployment of Hekara inside the client's own AWS, Azure, Google Cloud, Kubernetes or on-premises environment, with encryption keys, backups, SSO and a handover runbook."],
      ["custom", "Hekara custom development and integrations", "Custom features, workflows, SSO (SAML, OIDC, SCIM), EHR, payroll and claims integrations built on Hekara."],
      ["compliance", "HIPAA, SOC 2 and ISO 27001 readiness", "Gap assessment, risk assessment, policies, control mapping and audit evidence preparation. Advisory; audit reports are issued by independent firms."],
      ["support", "Hekara support plans and commercial licensing", "Response-time support, upgrades, training, and a commercial licence for use without the AGPL network clause."],
    ].map(([key, name, description]) => ({
      "@type": "Service",
      "@id": id(`service-${key}`),
      name,
      description,
      provider: { "@id": id("org") },
      serviceType: name,
      areaServed: "Worldwide",
      url: `${SITE}services/`,
    })),
  ],
};
