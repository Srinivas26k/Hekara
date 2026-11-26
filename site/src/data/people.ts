// People shown on the About page. Edit this file to update the site.

export const MAINTAINER = {
  name: "Nampalli Srinivas",
  role: "Creator and maintainer of Hekara · CTO, CyberArcMSP Consulting Services",
  location: "Hyderabad, India",
  photo: "", // e.g. "people/srinivas.jpg" in site/public. Leave empty to show initials.
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/srinivas-nampalli/" },
    { label: "GitHub", href: "https://github.com/Srinivas26k" },
    { label: "X / Twitter", href: "https://x.com/Srinivas26k" },
    { label: "SrvDB", href: "https://github.com/Srinivas26k/srvdb" },
  ],
  // Paragraphs shown on the About page. Plain text only.
  bio: [
    "I'm Nampalli Srinivas, Chief Technology Officer at CyberArcMSP Consulting Services, where I lead technology across cybersecurity, governance, risk and compliance (GRC) and AI. I build open-source systems software, and I care most about the place where security, privacy and real-world operations meet.",
    "Alongside Hekara, I created SrvDB, an open-source embedded vector database written in Rust for offline, privacy-first AI, and I'm a co-founder of FlowCRM. I was a winner at IBM Qiskit Fall Fest 2025, and I took part in the CXO Round Table at ISACA Hyderabad's Fusion 2026 conference.",
    "I'm currently studying for a BS in Data Science at IIT Madras, and I trained first as a mechanical engineer, so I tend to approach software the way an engineer approaches a machine: understand the constraints, design for failure, and document how it works.",
    "I started Hekara because small and mid-size home health agencies are stuck between spreadsheets and expensive per-seat software they can't change or fully control, while handling some of the most sensitive data there is. Hekara gives them a secure operations system they own outright. When an agency or health-tech team needs it customised, deployed in their own cloud or prepared for a HIPAA, SOC 2 or ISO 27001 audit, they work with me directly. I take on these projects independently, as a freelance consultant.",
  ],
  // Short facts shown beside the bio.
  facts: [
    ["Current role", "CTO, CyberArcMSP Consulting Services"],
    ["Open source", "Hekara (health-tech operations), SrvDB (Rust vector database)"],
    ["Expertise", "Security engineering, GRC, AI systems, Rust and TypeScript"],
    ["Education", "BS in Data Science (in progress), IIT Madras · Diploma in Mechanical Engineering"],
    ["Available for", "Freelance projects: custom builds, tenant deployments, compliance readiness"],
    ["Recognition", "Winner, IBM Qiskit Fall Fest 2025"],
  ],
};

export interface Contributor {
  name: string;
  github?: string; // username
  url?: string; // personal or company site
  logo?: string; // path in site/public, e.g. "contributors/acme.svg"; self-hosted, no external images
  kind: "person" | "company";
  contribution: string; // one line, e.g. "Cloudflare adapter"
}

// Add people and organisations here as they contribute or sponsor.
// The About page shows a "Be the first" card while these lists are empty.
export const CONTRIBUTORS: Contributor[] = [];
export const SPONSORS: Contributor[] = [];
