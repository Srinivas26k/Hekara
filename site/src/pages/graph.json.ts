import { GRAPH } from "../data/site";

export const GET = () =>
  new Response(JSON.stringify(GRAPH, null, 2), {
    headers: { "Content-Type": "application/ld+json; charset=utf-8" },
  });
