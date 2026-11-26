import { PAGES, SITE, UPDATED } from "../data/site";

export const GET = () => {
  const urls = PAGES.map(
    (p) =>
      `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${UPDATED}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
  ).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
