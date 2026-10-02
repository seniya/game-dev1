const mobile = matchMedia('(max-width: 760px)');

function jumpTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
}

export function revealInspector() {
  if (mobile.matches && !document.body.classList.contains('immersive')) jumpTo('resident-inspector');
}

/** Move the existing live panels; never clone controls or replace their state. */
export function setupResponsiveUI() {
  const layout = document.getElementById('world-view')!;
  const map = document.getElementById('map-panel')!;
  const feed = document.createElement('section');
  feed.id = 'world-feed';
  feed.tabIndex = -1;
  feed.setAttribute('aria-label', '마을 소식과 현황');
  const first = document.getElementById('stats')!;
  while (first.nextSibling) feed.append(first.nextSibling);
  feed.prepend(first);
  map.append(feed);

  const disclosures = ['world-tools', 'connection-details', 'map-options'].map(id => document.getElementById(id) as HTMLDetailsElement);
  function updateLayout() {
    (mobile.matches ? layout : map).append(feed);
    for (const disclosure of disclosures) disclosure.open = !mobile.matches;
  }
  updateLayout();
  mobile.addEventListener('change', updateLayout);
  layout.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-world-jump]');
    if (button) jumpTo(button.dataset.worldJump!);
  });

  const tools = disclosures[0];
  document.addEventListener('click', event => {
    if (mobile.matches && !tools.contains(event.target as Node)) tools.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobile.matches && tools.open) {
      tools.open = false;
      tools.querySelector('summary')?.focus();
    }
  });
}
