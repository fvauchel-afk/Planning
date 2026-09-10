const PALETTE = [
  { bg: "#c45c26", fg: "#fffaf5" },
  { bg: "#2f5d50", fg: "#f4fbf7" },
  { bg: "#3d5a80", fg: "#f4f7fb" },
  { bg: "#7b2d8e", fg: "#fcf5ff" },
  { bg: "#0e7490", fg: "#f0fbfd" },
  { bg: "#9f1239", fg: "#fff5f6" },
  { bg: "#3f6212", fg: "#f7fbe9" },
  { bg: "#1e3a5f", fg: "#f3f7fb" },
  { bg: "#854d0e", fg: "#fff8eb" },
  { bg: "#be123c", fg: "#fff1f2" },
  { bg: "#0f766e", fg: "#f0fdfa" },
  { bg: "#6d28d9", fg: "#f5f3ff" },
];

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function colorForChantier(chantierId: string): { bg: string; fg: string } {
  return PALETTE[hashId(chantierId) % PALETTE.length];
}
