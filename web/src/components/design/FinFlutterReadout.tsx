import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtNum } from '../../i18n/format';
import { useWorkspaceStore, selectActive, selectOutdated } from '../../state/store';
import { finMountOf } from '../../tree/finPlanform';
import {
  finStockFor,
  flutterFin,
  flutterSpeed,
  flutterSpeedIn,
  flutterVerdict,
  worstFlutterPoint,
} from '../../services/flight/finFlutter';
import { chooseFinStock, finStockChoice, useFinStockChoices, type FinStock } from '../../state/finFlutterChoices';
import { Dialog } from '../common/Dialog';
import { FinStockFields, FlutterMarginRows, FlutterSpeedRow } from '../tools/FlutterFields';
import { smallButton } from '../common/smallButton';

/**
 * Fin flutter for a selected fin set, opened from its editor as a dialog: the
 * Fin flutter tool's estimate with the fin, the site and the flight taken from
 * the design and its active simulation.
 *
 * The margin is read at every sample of the last run, in the air the run flew
 * through (`worstFlutterPoint`), not only at the top speed, since the air thins
 * on the way up and a lower, slower point can be the closer one. That is the
 * stack's flight (branch 0), which is what a booster's fins fly too until it
 * separates, and slower after. The speed at the pad is the run's first sample's
 * air too, or the standard atmosphere at the site before there is a run.
 *
 * The material is the one input a design does not carry: the catalog's
 * materials have a density and nothing else. A stock the estimate has a figure
 * for is matched by the material's name; any other leaves the shear modulus to
 * be typed. The choice is kept per fin set (`finFlutterChoices`), where the
 * flight warnings read it too.
 */
export function FinFlutterReadout({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line/5 pt-3">
      <button type="button" onClick={() => setOpen(true)} className={smallButton('sm', 'ink', 'w-full')}>
        {t('finFlutter.open')}
      </button>
      {open && (
        <Dialog
          id="fin-flutter"
          title={t('finFlutter.title')}
          onClose={() => setOpen(false)}
          layer="over"
          layout="pad"
          size="md"
        >
          <FlutterBody node={node} />
        </Dialog>
      )}
    </div>
  );
}

function FlutterBody({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const u = useUnits();
  const lengthUnit = u.at(unitScope('flutter', 'tip'), 'length');
  const speedUnit = u.at(unitScope('flutter', 'speed'), 'velocity');
  const tree = useWorkspaceStore((s) => s.tree);
  const siteM = useWorkspaceStore((s) => selectActive(s).launch.launchAltitudeM) ?? 0;
  const outdated = useWorkspaceStore(selectOutdated);
  const result = useWorkspaceStore((s) => selectActive(s).result);

  const materialName = typeof node.materialName === 'string' ? node.materialName : '';
  const matched = finStockFor(materialName);
  const choice = finStockChoice(node, useFinStockChoices());
  const choose = (stock: FinStock, shearPa: number | null) => {
    if (node.id) chooseFinStock(node.id, { stock, shearPa });
  };

  const fin = useMemo(() => flutterFin(node, node.id ? finMountOf(tree, node.id) : null), [node, tree]);
  const current = result && !outdated ? result : null;
  const padP = current?.series['P']?.[0];
  const padA = current?.series['Vs']?.[0];
  const atPad =
    fin && choice.shearPa != null
      ? padP != null && padA != null
        ? flutterSpeedIn(fin, choice.shearPa, padP, padA)
        : flutterSpeed(fin, choice.shearPa, siteM)
      : null;
  const worst = useMemo(
    () =>
      fin && choice.shearPa != null && current ? worstFlutterPoint(fin, choice.shearPa, current.series, siteM) : null,
    [fin, choice.shearPa, current, siteM],
  );

  const material = materialName || t('finFlutter.unnamedMaterial');
  const hint = matched ? t('finFlutter.fromMaterial', { material }) : t('finFlutter.noStock', { material });

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-ink-muted">{t('finFlutter.intro')}</p>
      {fin ? (
        node.type !== 'trapezoidfinset' && (
          <p className="text-xs text-ink-muted">
            {t('finFlutter.equivalent', { tip: lengthUnit.fmtSym(fin.tipChordM) })}
          </p>
        )
      ) : (
        <p className="text-xs text-warn-400">{t('finFlutter.noFin')}</p>
      )}
      <FinStockFields stock={choice.stock} shearPa={choice.shearPa} onChange={choose} hint={hint} />
      {atPad && (
        <div className="space-y-2 border-t border-line/5 pt-3">
          <FlutterSpeedRow label={t('finFlutter.atPad')} speedMs={atPad.speedMs} mach={atPad.mach} />
          {worst ? (
            <>
              <FlutterMarginRows ratio={worst.ratio} verdict={flutterVerdict(worst.ratio)} />
              <p className="text-xs text-ink-muted">
                {t('finFlutter.worstAt', {
                  time: fmtNum(worst.time, 2),
                  speed: speedUnit.fmtSym(worst.speedMs, 0),
                  altitude: u.fmtSym('distance', worst.altitudeM),
                  flutter: speedUnit.fmtSym(worst.flutterMs, 0),
                })}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-muted">
              {t(outdated && result ? 'finFlutter.outdated' : 'finFlutter.needsRun')}
            </p>
          )}
          <p className="text-[10px] text-ink-faint">{t('flutterTool.estimate')}</p>
        </div>
      )}
    </div>
  );
}
