import { describe, it, expect } from 'vitest';
import { renderUserTemplate, type FlightPathModel } from '../../../src/services/exports/flightPathExport';

describe('renderUserTemplate escapers', () => {
  const m = { title: '' } as unknown as FlightPathModel;
  const render = (ext: string, title: string) => renderUserTemplate('{{title}}', ext, { ...m, title });
  const NUL = String.fromCharCode(0);
  const DEL = String.fromCharCode(127);

  it('escapes XML-family output', () => {
    for (const ext of ['gpx', 'xml', 'html', 'htm', 'xhtml', 'svg', 'HTML']) {
      expect(render(ext, '<a & "b">'), ext).toBe('&lt;a &amp; &quot;b&quot;&gt;');
    }
  });

  it('leaves angle brackets out of KML values, which a viewer may set into HTML', () => {
    for (const ext of ['kml', 'KML']) expect(render(ext, '<a & "b">'), ext).toBe('a &amp; &quot;b&quot;');
  });

  it("escapes JSON output with JSON's own rules", () => {
    expect(render('json', 'a"b\\c')).toBe('a\\"b\\\\c');
    expect(render('json', 'line\nbreak')).toBe('line\\nbreak');
    expect(JSON.parse(`"${render('json', 'a"b')}"`)).toBe('a"b');
  });

  it('neutralizes spreadsheet formulas in TSV output', () => {
    expect(render('tsv', '=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(render('TSV', '@SUM(A1)')).toBe("'@SUM(A1)");
    expect(render('tsv', '-80.6')).toBe('-80.6');
    expect(render('tsv', 'a\t=1+1')).toBe("a '=1+1");
    expect(render('tsv', 'row\n+forged')).toBe("row '+forged");
  });

  it('strips control characters for an unknown extension', () => {
    expect(render('txt', `a${NUL}b`)).toBe('a b');
    expect(render('txt', 'row\r\nforged')).toBe('row  forged');
    expect(render('txt', `del${DEL}here`)).toBe('del here');
  });

  it('leaves printable punctuation alone for an unknown extension', () => {
    expect(render('txt', 'Rocket "Mk <2>" & co')).toBe('Rocket "Mk <2>" & co');
  });
});
