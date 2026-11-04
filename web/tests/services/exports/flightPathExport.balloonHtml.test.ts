// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildFlightPathModel, defaultExportOptions, renderKml } from '../../../src/services/exports/flightPathExport';
import type { FlightResult } from '../../../src/engine/openRocketEngine';
import type { LaunchConditions } from '../../../src/services/design/orkTree';
import en from '../../../src/i18n/locales/en.json';
import { localeTranslator } from '../../testing/localeTranslator';

// No CDATA: the XML parser would not decode Mustache's escapes inside it. Values are escaped twice: HTML, then XML.

const NAME = `Bill & Ted's <Excellent> Rocket`;

const result = {
  summary: { maxAltitude: 100, maxVelocity: 50, maxAcceleration: 20, timeToApogee: 1, flightTime: 2 },
  series: {
    time: [0, 1, 2],
    altitude: [0, 100, 0],
    velocity: [0, 50, 10],
    acceleration: [20, 5, -9.8],
    Px: [0, 50, 100],
    Py: [0, 100, 200],
  },
  events: [
    { type: 'LIFTOFF', time: 0 },
    { type: 'APOGEE', time: 1 },
    { type: 'GROUND_HIT', time: 2 },
  ],
} as unknown as FlightResult;

const launch = { latitudeDeg: 40, longitudeDeg: -105, launchAltitudeM: 1600 } as LaunchConditions;

const kml = () =>
  renderKml(
    buildFlightPathModel(
      result,
      launch,
      { simName: 'Sim 1', rocketName: NAME, motorName: 'C6' },
      defaultExportOptions(),
      localeTranslator(en),
    ),
  );

describe('balloon HTML', () => {
  it('parses as XML, with the markup decoded to tags and the name still HTML-escaped', () => {
    const doc = new DOMParser().parseFromString(kml(), 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();

    const description = doc.getElementsByTagName('description')[0]!.textContent!;
    expect(description.startsWith(`<b>Rocket:</b> Bill &amp; Ted's &lt;Excellent&gt; Rocket<br/>`)).toBe(true);
  });

  it('renders as the intended elements once the balloon HTML is parsed', () => {
    const doc = new DOMParser().parseFromString(kml(), 'application/xml');
    const host = document.createElement('div');
    host.innerHTML = doc.getElementsByTagName('description')[0]!.textContent!;
    expect(host.querySelector('b')?.textContent).toBe('Rocket:');
    expect(host.querySelectorAll('br').length).toBeGreaterThan(1);
    expect(host.textContent).toContain(`Rocket: ${NAME}`);
    expect(host.querySelector('Excellent')).toBeNull();
  });

  it('keeps markup in a file-sourced name out of every balloon', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const text = renderKml(
      buildFlightPathModel(
        result,
        launch,
        { simName: 'Sim 1', rocketName: evil, motorName: 'C6' },
        defaultExportOptions(),
        localeTranslator(en),
      ),
    );
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    for (const d of doc.getElementsByTagName('description')) {
      const host = document.createElement('div');
      host.innerHTML = d.textContent!;
      expect(host.querySelector('img')).toBeNull();
    }
    const host = document.createElement('div');
    host.innerHTML = doc.getElementsByTagName('description')[0]!.textContent!;
    expect(host.textContent).toContain(evil);
    // The document name is not HTML, so it is escaped once.
    expect(doc.getElementsByTagName('name')[0]!.textContent).not.toContain('&lt;');
  });
});
