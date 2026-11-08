import Mustache from 'mustache';
import { neutralizeFormula } from '../csvCell';
import { CSV_MIME } from '../csvExport';
import { escapeXml } from '../../files/xmlUtil';
import type { FlightPathModel } from './model';

function escaperFor(extension: string): (raw: string) => string {
  switch (extension.toLowerCase()) {
    // Google Earth's default balloon puts `<name>` into HTML, so KML values drop `<` and `>`.
    case 'kml':
      return (raw) => escapeXml(raw.replace(/[<>]/g, '')).replace(/'/g, '&apos;');
    case 'gpx':
    case 'xml':
    case 'html':
    case 'htm':
    case 'xhtml':
    case 'svg':
      return (raw) => escapeXml(raw).replace(/'/g, '&apos;');
    case 'csv':
      // Security: blocks spreadsheet formula injection from file-sourced names.
      return (raw) => neutralizeFormula(raw).replace(/"/g, '""');
    case 'tsv':
      return (raw) => stripControls(neutralizeFormula(raw));
    case 'json':
      // The template supplies the quotes.
      return (raw) => JSON.stringify(raw).slice(1, -1);
    default:
      return stripControls;
  }
}

/** Compared per character, not by regex class, to satisfy `no-control-regex`. */
function stripControls(raw: string): string {
  return raw.replace(/./gsu, (ch) => (ch < ' ' || ch === '' ? ' ' : ch));
}

export function mimeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'kml':
      return 'application/vnd.google-earth.kml+xml';
    case 'gpx':
      return 'application/gpx+xml';
    case 'csv':
      return CSV_MIME;
    case 'xml':
      return 'application/xml;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
    default:
      return 'text/plain;charset=utf-8';
  }
}

// Security: the output is only downloaded, never injected into the DOM.
export function renderUserTemplate(source: string, extension: string, model: FlightPathModel): string {
  // Mustache.escape is a module-level global; restored after this synchronous render.
  const previous = Mustache.escape;
  const escape = escaperFor(extension);
  Mustache.escape = escape;
  const htmlBalloon = () => (text: string, render: (t: string) => string) => {
    Mustache.escape = (raw: string) => escape(escapeXml(raw));
    try {
      return render(text);
    } finally {
      Mustache.escape = escape;
    }
  };
  try {
    return Mustache.render(source, { ...model, htmlBalloon });
  } finally {
    Mustache.escape = previous;
  }
}
