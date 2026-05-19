type Child = Node | string | number | null | undefined | false;

type Attrs = Record<string, unknown> & {
  className?: string;
  text?: string;
  ariaLabel?: string;
};

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

export function svgIcon(name: string): HTMLElement {
  return h("span", { className: `icon icon-${name}`, "aria-hidden": "true" });
}

export function button(
  label: string,
  attrs: Attrs & { onClick?: (event: MouseEvent) => void } = {},
  iconName = "",
): HTMLButtonElement {
  const btn = h("button", { type: "button", ...attrs }) as HTMLButtonElement;
  if (iconName) btn.append(svgIcon(iconName));
  btn.append(document.createTextNode(label));
  return btn;
}

export function chip(label: string, tone = ""): HTMLElement {
  return h("span", { className: `chip${tone ? ` chip-${tone}` : ""}` }, label);
}

export function meter(label: string, value: number): HTMLElement {
  const safe = Math.max(0, Math.min(1, value));
  return h(
    "div",
    { className: "meter-row" },
    h("span", {}, label),
    h("div", { className: "meter-track" }, h("i", { style: `width: ${safe * 100}%` })),
    h("strong", {}, `${Math.round(safe * 100)}%`),
  );
}

export function emptyState(title: string, body: string): HTMLElement {
  return h(
    "div",
    { className: "empty-state" },
    h("strong", {}, title),
    h("p", {}, body),
  );
}

function applyAttrs(node: HTMLElement, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") {
      node.className = String(value);
      continue;
    }
    if (key === "text") {
      node.textContent = String(value);
      continue;
    }
    if (key === "ariaLabel") {
      node.setAttribute("aria-label", String(value));
      continue;
    }
    if (key === "style") {
      node.setAttribute("style", String(value));
      continue;
    }
    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      node.addEventListener(eventName, value as EventListener);
      continue;
    }
    if (key === "dataset" && typeof value === "object") {
      for (const [dataKey, dataValue] of Object.entries(value as Record<string, string>)) {
        node.dataset[dataKey] = dataValue;
      }
      continue;
    }
    node.setAttribute(key, value === true ? "" : String(value));
  }
}

function appendChildren(node: HTMLElement, children: Child[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) {
      node.append(child);
    } else {
      node.append(document.createTextNode(String(child)));
    }
  }
}
