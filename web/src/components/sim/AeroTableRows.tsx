import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useWorkspaceStore, selectActive } from '../../state/store';
import {
  AERO_TABLE_KINDS,
  aeroTableColumns,
  aeroTableExample,
  aeroTableGrid,
  aeroTableOf,
  aeroTableRange,
  aeroTableRows,
  aeroTableSources,
  aeroTablesOf,
  type AeroTableKind,
  type AeroTableRange,
  type AeroTableSource,
} from '../../services/flight/aeroTables';
import { readFileText } from '../../services/files/decodeText';
import { download } from '../../services/files/saveFile';
import { aeroTableCsv, aeroTableFilename } from '../../services/flight/aeroTableFile';
import { actionError } from '../../i18n/keyedError';
import { fmtUpTo } from '../../i18n/format';
import { useFilePick } from '../common/useFilePick';
import { smallButton } from '../common/smallButton';

const LABELS: Record<AeroTableKind, string> = { drag: 'sims.dragTable', stability: 'sims.stabilityTable' };

/** The active simulation's drag and stability tables, flown in place of the calculated values. */
export function AeroTableRows({ multi }: { multi: boolean }) {
  const { t } = useTranslation();
  const xmlExtra = useWorkspaceStore((s) => selectActive(s).xmlExtra);
  const sources = aeroTableSources(xmlExtra);
  const tables = aeroTablesOf(xmlExtra);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-wide text-ink-muted">
        {t('sims.aeroTables')}
        {multi && <span className="normal-case text-ink-faint">{t('sims.thisOneOnly')}</span>}
      </div>
      <p className="text-[11px] text-ink-faint">{t('sims.aeroTableUnits')}</p>
      {AERO_TABLE_KINDS.map((kind) => (
        <AeroTableRow
          key={kind}
          kind={kind}
          source={sources[kind]}
          rows={aeroTableOf(tables, kind)}
          onError={setError}
        />
      ))}
      {error && (
        <p role="alert" className="text-[11px] text-warn-300">
          {error}
        </p>
      )}
    </div>
  );
}

function AeroTableRow({
  kind,
  source,
  rows,
  onError,
}: {
  kind: AeroTableKind;
  source: AeroTableSource | undefined;
  rows: readonly string[] | undefined;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const setAeroTable = useWorkspaceStore((s) => s.setAeroTable);
  const simName = useWorkspaceStore((s) => selectActive(s).name);
  const [shown, setShown] = useState(false);
  const gridId = useId();
  const label = t(LABELS[kind]);
  const columns = ['mach', ...aeroTableColumns(kind)].join(', ');
  const range = useMemo(() => (rows ? aeroTableRange(rows) : null), [rows]);

  const onFile = async (file: File) => {
    try {
      setAeroTable(kind, { file: file.name, rows: aeroTableRows(await readFileText(file), kind) });
      onError(null);
    } catch (e) {
      onError(actionError('sims.aeroTableFailed', e, t, { file: file.name }));
    }
  };
  // Desktop's chooser offers .csv, .txt and .dat.
  const csv = useFilePick({ accept: '.csv,.txt,.dat,text/csv', onFile: (f) => void onFile(f), label });

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-ink-soft">{label}</span>
        <button
          type="button"
          onClick={csv.pick}
          aria-label={`${label}, ${t(source ? 'sims.aeroTableReplace' : 'sims.aeroTableUpload')}`}
          className={smallButton('tight', 'accent')}
        >
          {t(source ? 'sims.aeroTableReplace' : 'sims.aeroTableUpload')}
        </button>
        {source && (
          <button
            type="button"
            onClick={() => {
              setAeroTable(kind, null);
              onError(null);
            }}
            aria-label={`${label}, ${t('sims.aeroTableRemove')}`}
            className={smallButton('tight', 'muted')}
          >
            {t('sims.aeroTableRemove')}
          </button>
        )}
        {csv.input}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <p className={`min-w-0 flex-1 text-[11px] ${source && !source.rows ? 'text-warn-300' : 'text-ink-faint'}`}>
          {!source
            ? t('sims.aeroTableNone', { columns })
            : source.rows
              ? [source.file || t('sims.aeroTableInFile'), range && rangeText(range, t)].filter(Boolean).join(' · ')
              : t('sims.aeroTableUnreadable', { file: source.file })}
        </p>
        {rows && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-expanded={shown}
            aria-controls={gridId}
            aria-label={`${label}, ${t(shown ? 'sims.aeroTableHide' : 'sims.aeroTableShow')}`}
            className="text-[11px] font-medium text-accent-300 hover:underline"
          >
            {t(shown ? 'sims.aeroTableHide' : 'sims.aeroTableShow')}
          </button>
        )}
        {rows && (
          <button
            type="button"
            onClick={() => download(aeroTableFilename(source, simName, kind), aeroTableCsv(rows))}
            aria-label={`${label}, ${t('sims.aeroTableDownload')}`}
            className="text-[11px] font-medium text-accent-300 hover:underline"
          >
            {t('sims.aeroTableDownload')}
          </button>
        )}
      </div>
      {!source && (
        <div className="mt-0.5 text-[11px] text-ink-faint">
          {t('sims.aeroTableExample')}
          <pre className="mt-0.5 overflow-x-auto rounded bg-raised px-2 py-1 font-mono text-[10px] text-ink-soft">
            {aeroTableExample(kind).join('\n')}
          </pre>
        </div>
      )}
      {rows && shown && <AeroTableGrid id={gridId} caption={label} rows={rows} />}
    </div>
  );
}

function rangeText(range: AeroTableRange, t: TFunction): string {
  const mach = { min: fmtUpTo(range.mach[0], 2), max: fmtUpTo(range.mach[1], 2) };
  return range.aoa
    ? t('sims.aeroTableRangeAoa', { ...mach, aoaMin: fmtUpTo(range.aoa[0], 1), aoaMax: fmtUpTo(range.aoa[1], 1) })
    : t('sims.aeroTableRange', mach);
}

function AeroTableGrid({ id, caption, rows }: { id: string; caption: string; rows: readonly string[] }) {
  const { header, body } = useMemo(() => aeroTableGrid(rows), [rows]);
  return (
    <div id={id} className="mt-1 max-h-48 overflow-auto rounded-md ring-1 ring-line/10">
      <table className="w-full text-right text-[11px] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-raised text-ink-muted">
          <tr>
            {header.map((h, i) => (
              <th key={i} scope="col" className="px-2 py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-ink-soft">
          {body.map((cells, r) => (
            <tr key={r} className="odd:bg-surface even:bg-raised/40">
              {header.map((_, c) => (
                <td key={c} className="px-2 py-0.5">
                  {cells[c] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
