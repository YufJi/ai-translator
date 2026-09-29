export type Attrs = Record<string, unknown>;
export type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") element.className = String(value);
    else if (key === "dataset" && typeof value === "object") {
      for (const [dataKey, dataValue] of Object.entries(value as Record<string, unknown>)) {
        element.dataset[dataKey] = String(dataValue);
      }
    } else if (key === "style" && typeof value === "object") {
      Object.assign(element.style, value as Record<string, string>);
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value as EventListener, false);
    } else if (key === "value" && element instanceof HTMLInputElement) {
      element.value = String(value);
    } else if (value === true) element.setAttribute(key, "");
    else element.setAttribute(key, String(value));
  }
  append(element, children);
  return element;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Element not found for selector: ${selector}`);
  return found;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function textareaRows(value: string, minimumRows: number): number {
  return Math.max(minimumRows, Math.min(12, value.split("\n").length + 1));
}

