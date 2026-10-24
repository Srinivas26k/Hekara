/** Carbon icons ship as plain data: an element name, attributes and children. */
declare module "@carbon/icons/es/*" {
  interface CarbonNode {
    elem: string;
    attrs: Record<string, string | number>;
    content?: CarbonNode[];
  }
  const icon: CarbonNode;
  export default icon;
}
