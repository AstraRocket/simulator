const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export const xmlText = (s) =>
  s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] !== '#') return XML_ENTITIES[ref] ?? whole;
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return String.fromCodePoint(code);
  });

/** Directory order differs between Windows and Linux, and row order sets the manifest hash. */
export const byFileName = (files) => [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const LEN = { in: 0.0254, mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, '': 1 };

/** A repeated element keeps the last one, as desktop's JAXB loader does. */
export function tag(block, name) {
  const all = [...block.matchAll(new RegExp(`<${name}(\\s+[^>]*)?>([^<]*)</${name}>`, 'g'))];
  const m = all.at(-1);
  if (!m) return null;
  const unit = (m[1] || '').match(/Unit="([^"]*)"/)?.[1] ?? '';
  return { value: xmlText(m[2]).trim(), unit };
}

/** Meters. */
export const lenM = (block, name) => {
  const t = tag(block, name);
  if (!t || t.value === '') return null;
  const n = Number(t.value);
  return Number.isFinite(n) ? n * (LEN[t.unit] ?? 1) : null;
};

export const num = (block, name) => {
  const t = tag(block, name);
  const n = t ? Number(t.value) : NaN;
  return Number.isFinite(n) ? n : null;
};

export const str = (block, name) => tag(block, name)?.value ?? null;
