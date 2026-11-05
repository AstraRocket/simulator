import { KeyedError } from '../../i18n/keyedError';

// XML 1.0 parsers reject the whole file over one forbidden char; word-processor pastes carry U+000B.
export function escapeXml(s: string): string {
  return stripXmlForbidden(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// By code unit, since `no-control-regex` rejects a control-character class.
function stripXmlForbidden(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue;
    if (c === 0xfffe || c === 0xffff) continue;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i]! + s[i + 1]!;
        i++;
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    out += s[i];
  }
  return out;
}

// DOMParser returns a document even on failure, hence the `parsererror` check.
export function parseXmlText(xml: string, format: string): Document {
  if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new KeyedError('errors.file.xmlInvalid', { format });
  return doc;
}

export function xmlText(el: Element, selector: string): string | null {
  const t = el.querySelector(selector)?.textContent;
  return t == null || t.trim() === '' ? null : t.trim();
}
