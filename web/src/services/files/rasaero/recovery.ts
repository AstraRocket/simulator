import type { ComponentNode } from '../../../engine/openRocketEngine';
import { FT, IN, fmt, type Cdx1Writer } from './units';
import { num, str } from '../../../tree/nodeProps';
import { walkNodes } from '../../../tree/treeWalk';
import { KERNEL_DEFAULTS, KERNEL_DEPLOYMENT } from '../../../tree/kernelDefaults';
import { KeyedError } from '../../../i18n/keyedError';
import { notePartName } from '../importNote';

/** RASAero opens device 1 at apogee and device 2 at Altitude2 whatever the event types say (RecoveryDTO). */
export function writeRecovery(w: Cdx1Writer, stagesIn: ComponentNode[]): void {
  const { emit } = w;
  let apogee: ComponentNode | undefined;
  let altitude: ComponentNode | undefined;
  for (const c of walkNodes(stagesIn.slice(0, 3).flatMap((s) => s.children ?? []))) {
    if (c.type === 'streamer') {
      w.warn({ key: 'errors.exportRasaeroStreamer', values: { name: notePartName(c) } });
      continue;
    }
    if (c.type !== 'parachute') continue;
    const ev = str(c, 'deployEvent', KERNEL_DEPLOYMENT.deployEvent);
    const extra = () => w.warn({ key: 'errors.exportRasaeroChuteExtra', values: { name: notePartName(c) } });
    if (ev === 'ejection' || ev === 'apogee') {
      // No ejection charge in RASAero; desktop writes it as apogee (RASAeroExport.warning14).
      if (ev === 'ejection') w.warn({ key: 'errors.exportRasaeroChuteEjection', values: { name: notePartName(c) } });
      if (apogee) extra();
      else apogee = c;
    } else if (ev === 'altitude') {
      if (altitude) extra();
      else altitude = c;
    } else {
      // RASAeroExport.error21.
      throw new KeyedError('errors.rasaero.chuteEvent', {
        name: notePartName(c),
        event: { key: `deployEvent.${ev}` },
      });
    }
  }
  const slot = (c: ComponentNode | undefined, eventType: 'Apogee' | 'Altitude') => ({
    altitude: fmt(c && eventType === 'Altitude' ? num(c, 'deployAltitude', KERNEL_DEPLOYMENT.deployAltitude) * FT : 0),
    deviceType: c ? 'Parachute' : 'None',
    event: c ? 'True' : 'False',
    size: fmt(c ? num(c, 'diameter', KERNEL_DEFAULTS.parachute.diameter) * IN : 0),
    eventType: c ? eventType : 'None',
    cd: fmt(c ? num(c, 'cd', KERNEL_DEFAULTS.parachute.cd) : 0),
  });
  const slotVals = [slot(apogee, 'Apogee'), slot(altitude, 'Altitude')];
  emit('<Recovery>');
  for (const slot of [1, 2] as const) emit(`<Altitude${slot}>${slotVals[slot - 1]!.altitude}</Altitude${slot}>`);
  for (const slot of [1, 2] as const) emit(`<DeviceType${slot}>${slotVals[slot - 1]!.deviceType}</DeviceType${slot}>`);
  for (const slot of [1, 2] as const) emit(`<Event${slot}>${slotVals[slot - 1]!.event}</Event${slot}>`);
  for (const slot of [1, 2] as const) emit(`<Size${slot}>${slotVals[slot - 1]!.size}</Size${slot}>`);
  for (const slot of [1, 2] as const) emit(`<EventType${slot}>${slotVals[slot - 1]!.eventType}</EventType${slot}>`);
  for (const slot of [1, 2] as const) emit(`<CD${slot}>${slotVals[slot - 1]!.cd}</CD${slot}>`);
  emit('</Recovery>');
}
