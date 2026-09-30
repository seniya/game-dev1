interface RenderedPanel { identity: string; html: string }
const rendered = new WeakMap<HTMLElement, RenderedPanel>();
const pending = new Map<HTMLElement, RenderedPanel>();
document.addEventListener('selectionchange', () => {
  if (!window.getSelection()?.isCollapsed) return;
  for (const [root, next] of pending) {
    pending.delete(root);
    if (root.isConnected) updateReadingPanel(root, next.html, next.identity);
  }
});
const key = (node: Node): string | undefined => {
  if (!(node instanceof Element)) return;
  for (const attr of ['id', 'data-reading-key', 'data-detail-key', 'data-event']) {
    if (node.hasAttribute(attr)) return `${node.tagName}:${attr}:${node.getAttribute(attr)}`;
  }
  // A class identifies a section; repeated unkeyed rows retain their relative order.
  return node.className && typeof node.className === 'string' ? `${node.tagName}:${node.className}` : undefined;
};
function compatible(a: Node, b: Node) {
  return a.nodeType === b.nodeType && (!(a instanceof Element) || b instanceof Element && a.tagName === b.tagName && key(a) === key(b));
}
function reconcile(parent: Node, incoming: Node) {
  const remaining = [...parent.childNodes];
  let cursor = parent.firstChild;
  for (const desired of [...incoming.childNodes]) {
    const existing = remaining.find(node => compatible(node, desired));
    if (!existing) { parent.insertBefore(desired.cloneNode(true), cursor); continue; }
    remaining.splice(remaining.indexOf(existing), 1);
    if (existing !== cursor) parent.insertBefore(existing, cursor);
    if (existing instanceof Element && desired instanceof Element) {
      for (const attr of [...existing.attributes]) {
        if (existing instanceof HTMLDetailsElement && attr.name === 'open') continue;
        if (!desired.hasAttribute(attr.name)) existing.removeAttribute(attr.name);
      }
      for (const attr of [...desired.attributes]) {
        if (existing instanceof HTMLDetailsElement && attr.name === 'open') continue;
        if (existing.getAttribute(attr.name) !== attr.value) existing.setAttribute(attr.name, attr.value);
      }
      reconcile(existing, desired);
    } else if (existing.nodeValue !== desired.nodeValue) existing.nodeValue = desired.nodeValue;
    cursor = existing.nextSibling;
  }
  for (const node of remaining) parent.removeChild(node);
}

/** Update live facts without replacing the reader's DOM, disclosure state or focus. */
export function updateReadingPanel(root: HTMLElement, html: string, identity: string) {
  const previous = rendered.get(root);
  if (previous?.identity === identity && previous.html === html) { pending.delete(root); return; }
  const selection = window.getSelection();
  if (previous?.identity === identity && selection && !selection.isCollapsed &&
      (root.contains(selection.anchorNode) || root.contains(selection.focusNode))) { pending.set(root, { identity, html }); return; }
  pending.delete(root);
  if (previous?.identity !== identity) {
    root.innerHTML = html; root.scrollTop = 0;
  } else {
    const active = document.activeElement, anchor = readingAnchor(root);
    const anchorTop = anchor?.getBoundingClientRect().top;
    const scroll = root.scrollTop;
    const template = document.createElement('template'); template.innerHTML = html;
    reconcile(root, template.content);
    if (active instanceof HTMLElement && root.contains(active) && document.activeElement !== active) active.focus({ preventScroll: true });
    root.scrollTop = anchor?.isConnected && anchorTop !== undefined ? scroll + anchor.getBoundingClientRect().top - anchorTop : scroll;
  }
  rendered.set(root, { identity, html });
}


function readingAnchor(root: HTMLElement) {
  const { top, bottom } = root.getBoundingClientRect(), active = document.activeElement;
  const visible = (el: HTMLElement) => el.getClientRects().length > 0 && el.getBoundingClientRect().bottom > top + 8 && el.getBoundingClientRect().top < bottom;
  if (active instanceof HTMLElement && root.contains(active) && visible(active)) return active;
  return [...root.querySelectorAll<HTMLElement>('summary, p, .need-row, .section-label, .memory-card, .causal-button')].find(visible);
}

// Header wrapping can resize the scroll area before the body's own diff begins.
export function withReadingPosition(root: HTMLElement, update: () => void) {
  const identity = rendered.get(root)?.identity, anchor = readingAnchor(root), top = anchor?.getBoundingClientRect().top;
  update();
  if (identity !== undefined && rendered.get(root)?.identity === identity && anchor?.isConnected && top !== undefined) {
    root.scrollTop += anchor.getBoundingClientRect().top - top;
  }
}
