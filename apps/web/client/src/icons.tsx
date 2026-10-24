import { Dynamic } from "solid-js/web";
import add from "@carbon/icons/es/add/20.js";
import aiGenerate from "@carbon/icons/es/ai-generate/20.js";
import calendar from "@carbon/icons/es/calendar/20.js";
import chartBar from "@carbon/icons/es/chart--bar/20.js";
import chevronDown from "@carbon/icons/es/chevron--down/20.js";
import chevronUp from "@carbon/icons/es/chevron--up/20.js";
import close from "@carbon/icons/es/close/20.js";
import dashboard from "@carbon/icons/es/dashboard/20.js";
import help from "@carbon/icons/es/help/20.js";
import home from "@carbon/icons/es/home/20.js";
import listChecked from "@carbon/icons/es/list--checked/20.js";
import notification from "@carbon/icons/es/notification/20.js";
import receipt from "@carbon/icons/es/receipt/20.js";
import search from "@carbon/icons/es/search/20.js";
import security from "@carbon/icons/es/security/20.js";
import settings from "@carbon/icons/es/settings/20.js";
import stethoscope from "@carbon/icons/es/stethoscope/20.js";
import time from "@carbon/icons/es/time/20.js";
import userAdmin from "@carbon/icons/es/user--admin/20.js";
import userFollow from "@carbon/icons/es/user--follow/20.js";
import userMultiple from "@carbon/icons/es/user--multiple/20.js";

interface CarbonNode {
  elem: string;
  attrs: Record<string, string | number>;
  content?: CarbonNode[];
}

/** Draws a Carbon icon descriptor with real DOM elements (no innerHTML), so the strict CSP and the XSS guard test stay intact. */
function Draw(props: { node: CarbonNode; root?: boolean }) {
  return (
    <Dynamic
      component={props.node.elem}
      {...props.node.attrs}
      {...(props.root ? { "aria-hidden": "true", focusable: "false" } : {})}
    >
      {props.node.content?.map((child) => (
        <Draw node={child} />
      ))}
    </Dynamic>
  );
}

const make = (node: CarbonNode) => () => <Draw node={node} root />;

/** Icons from IBM's Carbon Design System (Apache-2.0). Sized by the surrounding CSS. */
export const Icon = {
  grid: make(dashboard),
  users: make(userMultiple),
  steth: make(stethoscope),
  cal: make(calendar),
  house: make(home),
  list: make(listChecked),
  spark: make(aiGenerate),
  receipt: make(receipt),
  shield: make(security),
  chart: make(chartBar),
  gear: make(settings),
  user: make(userAdmin),
  userPlus: make(userFollow),
  plus: make(add),
  search: make(search),
  help: make(help),
  bell: make(notification),
  clock: make(time),
  chevUp: make(chevronUp),
  chevDown: make(chevronDown),
  close: make(close),
};
