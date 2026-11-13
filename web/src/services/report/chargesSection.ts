import type { ChargeRow } from '../flight/recoveryCharges';
import { effectiveBay, type BayPins, type DesignBay } from '../flight/recoveryBays';
import { NO_VALUE } from '../../i18n/noValue';
import { stagePrefixed } from '../../i18n/format';
import { heading, kvGrid, len, q, qv, sectionBreak, sub, table, type Col, type PdfPage } from './pdfPage';

export function writeChargesSection(p: PdfPage, rows: readonly ChargeRow[], bays: readonly DesignBay[] = []): void {
  const { t, CW, units } = p;
  sectionBreak(p);
  heading(p, t('charges.title'));
  const grams = (kg: number | null) => (kg == null ? NO_VALUE : qv(p, 'mass', kg, 2));
  if (rows.length) {
    const cols: Col[] = [
      { title: t('charges.role'), w: CW * 0.25 },
      { title: t('charges.bay'), w: CW * 0.35 },
      { title: `${t('charges.primary')} (${units.mass})`, w: CW * 0.2, align: 'right' },
      { title: `${t('charges.backup')} (${units.mass})`, w: CW * 0.2, align: 'right' },
    ];
    table(
      p,
      cols,
      rows.map((r) => [
        t(`charges.role_${r.role}`),
        stagePrefixed(t, r.stageName, r.tubeName || NO_VALUE),
        grams(r.primaryKg),
        grams(r.backupKg),
      ]),
    );
  }

  const pinsCell = (pins: BayPins | null) =>
    !pins || pins.count === 0
      ? t('bays.noPins')
      : `${pins.count} × ${pins.size ? `#${pins.size}` : q(p, 'force', pins.forceN)}`;

  for (const bay of bays) {
    const s = effectiveBay(bay);
    sub(
      p,
      stagePrefixed(
        t,
        bay.stageName,
        t('bays.title', { role: t(`charges.role_${bay.role}`), tube: bay.tubeName || t('ejectionBay.unnamedTube') }),
      ),
      9,
    );
    kvGrid(p, [
      [t('ejectionTool.bore'), len(p, s.boreM)],
      [t('ejectionTool.length'), len(p, s.lengthM)],
      [t('ejectionTool.pressure'), q(p, 'pressure', s.pressurePa)],
      [t('ejectionTool.pins'), pinsCell(s.pins)],
    ]);
    if (!bay.record.tests.length) continue;
    const cols: Col[] = [
      { title: t('bays.date'), w: CW * 0.16 },
      { title: `${t('bays.charge')} (${units.mass})`, w: CW * 0.14, align: 'right' },
      { title: t('ejectionTool.pins'), w: CW * 0.18 },
      { title: t('bays.result'), w: CW * 0.2 },
      { title: t('bays.notes'), w: CW * 0.32 },
    ];
    table(
      p,
      cols,
      bay.record.tests.map((x) => [
        x.id === bay.record.flownTestId ? `${x.date} *` : x.date,
        grams(x.chargeKg),
        pinsCell(x.pins),
        t(`bays.result_${x.result}`),
        x.notes || NO_VALUE,
      ]),
    );
    if (bay.record.flownTestId) sub(p, t('bays.flownMark'), 8);
  }
}
