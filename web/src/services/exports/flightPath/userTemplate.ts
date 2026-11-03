import Mustache from 'mustache';
import { neutralizeFormula } from '../csvCell';
import { CSV_MIME } from '../csvExport';
import { escapeXml } from '../../files/xmlUtil';
import type { FlightPathModel } from './model';

// ---------------------------------------------------------------------------
// User-supplied Mustache templates
// ---------------------------------------------------------------------------

/** Choose the value escaper by output extension (mirrors the desktop exporter). */
function escaperFor(extension: string): (raw: string) => string {
  switch (extension.toLowerCase()) {
    // Markup formats take the XML escaper too, so a component name from a shared
    // file cannot become a live element in the generated page.
    // A KML viewer may set a value into HTML as well as show it as text:
    // Google Earth's default balloon places a feature's `<name>` there. So a
    // KML value carries no `<` or `>` at all, and cannot become markup. Text
    // inside `{{#htmlBalloon}}` is HTML-escaped before it gets here, so it
    // keeps every character.
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
      // Neutralize spreadsheet formula injection: a file-sourced value (e.g. a
      // rocket named `=HYPERLINK(...)`) must not execute when the CSV is opened
      // in Excel/Sheets. The shared rule neutralizes a trigger at the start and
      // after an embedded separator, then quotes are doubled for RFC-4180 (the
      // template wraps values in quotes).
      //
      // The pre-formatted numeric fields (longitude, altitude, distance) go
      // through this same escaper; the shared rule leaves a value that is
      // entirely a number alone, so `-80.600000` stays a number while
      // `-1+HYPERLINK(...)` is neutralized.
      return (raw) => neutralizeFormula(raw).replace(/"/g, '""');
    case 'tsv':
      // A TSV opens straight into a spreadsheet just as a CSV does, so the same
      // formula rule applies. TSV has no quoting: a tab or line break inside a
      // value would start a new cell or row, so C0 controls and DEL become a
      // space after the triggers behind them are neutralized.
      return (raw) => stripControls(neutralizeFormula(raw));
    case 'json':
      // JSON's own string escaping, via the one function guaranteed to agree
      // with every parser. `JSON.stringify` quotes what it returns, so the
      // quotes are sliced off: the template supplies them, exactly as it does
      // for the csv and xml cases.
      return (raw) => JSON.stringify(raw).slice(1, -1);
    default:
      // A template is named by the user, and `parseTemplateFilename` defaults a
      // bare name to `txt`, so this branch renders real values into a format
      // whose quoting rules nothing here knows. It cannot invent them, but it
      // can refuse to emit the characters that corrupt a text file whatever the
      // format: C0 controls and DEL, which is what a crafted component name
      // would use to forge a record boundary. Printable punctuation is left
      // alone, because in an unknown format it is as likely to be content.
      return stripControls;
  }
}

/**
 * The value with every C0 control and DEL replaced by a space. Matched per
 * character and compared by code point rather than with a control-character
 * class, which `no-control-regex` rejects because a literal control in a
 * pattern is usually a mistake. Keeping the test out of the pattern avoids
 * switching the rule off.
 */
function stripControls(raw: string): string {
  return raw.replace(/./gsu, (ch) => (ch < ' ' || ch === '' ? ' ' : ch));
}

/** Best-effort MIME type for a downloaded export file, by extension. */
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

/**
 * Render a user-supplied Mustache template against the model, escaping values by
 * the output extension. The model's field names are the ones OpenRocket's
 * flight path export templates use, so a template written for it renders
 * here. Only the rendered text is ever downloaded, never injected into the
 * DOM, so a template cannot script the app.
 */
export function renderUserTemplate(source: string, extension: string, model: FlightPathModel): string {
  // Mustache.escape is a module-level hook; set it for this synchronous render
  // and restore it so concurrent callers/formats are unaffected.
  const previous = Mustache.escape;
  const escape = escaperFor(extension);
  Mustache.escape = escape;
  // `{{#htmlBalloon}}...{{/htmlBalloon}}` marks text that a viewer reads as
  // HTML after decoding the file once, as a KML <description> is: values inside
  // it are escaped for HTML first, so a name cannot become markup.
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
