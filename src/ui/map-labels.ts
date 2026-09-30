export interface LabelRect { x: number; y: number; width: number; height: number }
export interface MapLabel {
  id: string; text: string; x: number; y: number; priority: number;
  dark?: boolean; color?: string; compact?: boolean;
}
export interface PlacedLabel extends MapLabel { rect: LabelRect }
export function labelsOverlap(a: LabelRect, b: LabelRect, gap = 4) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** Layout in CSS pixels, independently of the map zoom and canvas backing size. */
export function layoutMapLabels(labels: MapLabel[], width: number, height: number, measure: (text: string) => number, reserved: LabelRect[] = []): PlacedLabel[] {
  const placed: PlacedLabel[] = [], occupied = [...reserved], seen = new Set<string>(), margin = 8;
  if (width < 40 || height < 40) return placed;
  for (const label of [...labels].sort((a,b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (seen.has(label.id) || label.priority < 90 && (label.x < 0 || label.x > width || label.y < -24 || label.y > height + 24)) continue;
    seen.add(label.id);
    const maxWidth = Math.min(260, width - margin * 2), padding = label.compact ? 8 : 16;
    let text = label.text;
    if (measure(text) + padding > maxWidth) {
      const characters = Array.from(text);
      while (characters.length && measure(characters.join('') + '…') + padding > maxWidth) characters.pop();
      text = characters.join('') + '…';
    }
    const boxWidth = measure(text) + padding, boxHeight = label.compact ? 18 : 24;
    // Ordinary labels stay at their object; only focused labels move to nearby free rows.
    const preferredY = Math.max(margin, Math.min(height - margin - boxHeight, label.y - boxHeight / 2));
    const offsets = label.priority >= 50 ? [0, -30, 30, -60, 60, -90, 90] : [0];
    for (const offset of offsets) {
      const rect = { x: Math.max(margin, Math.min(width - margin - boxWidth, label.x - boxWidth / 2)), y: Math.max(margin, Math.min(height - margin - boxHeight, preferredY + offset)), width: boxWidth, height: boxHeight };
      if (occupied.some(other => labelsOverlap(rect, other))) continue;
      placed.push({ ...label, text, rect }); occupied.push(rect); break;
    }
  }
  return placed;
}
