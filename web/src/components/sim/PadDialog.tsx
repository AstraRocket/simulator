import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchConditions } from '../../services/design/orkTree';
import { Dialog } from '../common/Dialog';
import { DialogActions, DialogButton } from '../common/DialogButton';
import { LazyBoundary } from '../common/ErrorBoundary';
import { lazyNamed } from '../common/lazyNamed';
import { token } from '../common/colorTokens';
import { shownDeclination } from '../../services/flight/bearing';
import { useSettings } from '../../state/useSettings';
import { useLauncherKind } from '../common/useLauncher';
import type { LauncherKind } from '../../services/design/launcher';

// Lazy: three.js loads only when the pad is opened.
const PadPreview3D = lazyNamed(() => import('../canvas/PadPreview3D'), 'PadPreview3D');

/** The pad as the launch panel sets it, in 3D: the rod, the ground compass rose and the pad wind. */
export function PadDialog({ launch, onClose }: { launch: LaunchConditions; onClose: () => void }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  // The simulation's choice, else what the design's lugs or buttons suggest.
  const designLauncher = useLauncherKind();
  const launcher = launch.launcher ?? designLauncher ?? 'rod';
  const loading = <div className="grid h-full place-items-center text-sm text-ink-faint">{t('view.loading3d')}</div>;
  return (
    <Dialog
      id="pad3d"
      title={t('flight.padSetup')}
      onClose={onClose}
      // The launch panel can itself sit inside the Settings dialog.
      layer="over"
      size="3xl"
      layout="pad"
    >
      <div className="space-y-2">
        <p className="text-xs text-ink-faint">{t('launch.pad3dHint')}</p>
        <div className="h-[26rem] overflow-hidden rounded-lg ring-1 ring-line/10">
          <LazyBoundary fallback={loading}>
            <PadPreview3D launch={launch} launcher={launcher} />
          </LazyBoundary>
        </div>
        <PadLegend
          launcher={launcher}
          magnetic={shownDeclination(settings.northReference, launch.latitudeDeg, launch.longitudeDeg) !== null}
        />
      </div>
      {/* As the wind profile dialog: its actions close the padded body. */}
      <DialogActions>
        <DialogButton variant="primary" size="sm" onClick={onClose}>
          {t('common.close')}
        </DialogButton>
      </DialogActions>
    </Dialog>
  );
}

const SWATCH = 'h-3 w-5 shrink-0';

/** The 3D marks by shape as well as color: a lone triangle, dashes, an arrow, a line with a ball. */
function PadLegend({ magnetic, launcher }: { magnetic: boolean; launcher: LauncherKind }) {
  const { t } = useTranslation();
  const north = token('scene-north');
  const item = (key: string, mark: ReactNode, context?: LauncherKind) => (
    <span key={key} className="flex items-center gap-1">
      <svg viewBox="-2 -6 20 12" className={SWATCH} aria-hidden>
        {mark}
      </svg>
      {t(key, { context })}
    </span>
  );
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-ink-soft">
      {item('launch.legendTrueNorth', <path d="M8 -5L13 4H3Z" style={{ fill: north }} />)}
      {magnetic &&
        item(
          'launch.legendMagneticNorth',
          <path d="M0 0H16" style={{ stroke: north }} strokeWidth={2} strokeDasharray="3 2.5" />,
        )}
      {item(
        'launch.figLegendWind',
        <>
          <path d="M0 0H10" style={{ stroke: token('scene-wind') }} strokeWidth={2.4} />
          <path d="M9 -4.5L16 0L9 4.5Z" style={{ fill: token('scene-wind') }} />
        </>,
      )}
      {item(
        'launch.figLegendRod',
        // As the 3D draws them: a rail is a square bar, a rod a thin line with a cap on its tip.
        launcher === 'rail' ? (
          <path d="M0 0H16" style={{ stroke: token('scene-rod') }} strokeWidth={4} />
        ) : (
          <>
            <path d="M0 0H13" style={{ stroke: token('scene-rod') }} strokeWidth={1.6} />
            <circle cx={14} cy={0} r={2.5} style={{ fill: token('scene-rod') }} />
          </>
        ),
        launcher,
      )}
    </div>
  );
}
