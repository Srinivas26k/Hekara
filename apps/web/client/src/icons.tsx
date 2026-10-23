import type { JSX } from "solid-js";

const Svg = (p: { children: JSX.Element }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {p.children}
  </svg>
);

export const Icon = {
  grid: () => <Svg><rect x="4" y="4" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" /></Svg>,
  users: () => <Svg><circle cx="12" cy="9" r="3" /><path d="M6.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /><path d="M2.5 17c.4-1.8 1.6-2.8 3.2-2.9M21.5 17c-.4-1.8-1.6-2.8-3.2-2.9" /></Svg>,
  steth: () => <Svg><path d="M6 3v5a4 4 0 0 0 8 0V3" /><path d="M10 12v2a5 5 0 0 0 10 0v-1" /><circle cx="20" cy="11" r="2" /></Svg>,
  cal: () => <Svg><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></Svg>,
  house: () => <Svg><path d="M4 20V10l6-5 6 5v10" /><path d="M16 12h4v8M2 20h20M8 13h4M8 16h4" /></Svg>,
  list: () => <Svg><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6.5h9M11 12.5h9M11 18.5h9" /></Svg>,
  spark: () => <Svg><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /><path d="M5 17l-1.5 3.5M18 4l1-1.5M19 16l1.5 1" /></Svg>,
  receipt: () => <Svg><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Svg>,
  shield: () => <Svg><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></Svg>,
  chart: () => <Svg><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 16v-4M12 16V8M16 16v-6" /></Svg>,
  gear: () => <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2.5l2 2.2 3-.4.6 2.9 2.6 1.6-1.2 2.7 1.2 2.7-2.6 1.6-.6 2.9-3-.4-2 2.2-2-2.2-3 .4-.6-2.9-2.6-1.6L4.6 12 3.4 9.3 6 7.7l.6-2.9 3 .4z" /></Svg>,
  user: () => <Svg><circle cx="10" cy="8" r="4" /><path d="M3 20c.6-3.5 3.4-5.5 7-5.5 1.4 0 2.6.3 3.6.8" /><circle cx="17.5" cy="17.5" r="3" /></Svg>,
  userPlus: () => <Svg><circle cx="10" cy="8" r="4" /><path d="M3 20c.6-3.5 3.4-5.5 7-5.5s6.4 2 7 5.5zM18 4v4M16 6h4" /></Svg>,
  plus: () => <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  search: () => <Svg><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Svg>,
  help: () => <Svg><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></Svg>,
  bell: () => <Svg><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Svg>,
  clock: () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>,
  chevUp: () => <Svg><path d="M6 15l6-6 6 6" /></Svg>,
  chevDown: () => <Svg><path d="M6 9l6 6 6-6" /></Svg>,
  close: () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>,
};
