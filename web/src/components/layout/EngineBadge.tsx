import { useTranslation } from 'react-i18next';
import { useEngineStore } from '../../state/engineStore';

export function EngineBadge() {
  const { t } = useTranslation();
  const backend = useEngineStore((s) => s.backend);

  if (!backend) return null;
  return (
    <span
      title={t(backend === 'wasm' ? 'engine.wasmTip' : 'engine.jsTip')}
      className={`text-[9px] font-semibold uppercase tracking-wide ${
        backend === 'wasm' ? 'text-ok-300' : 'text-ink-muted'
      }`}
    >
      {backend}
    </span>
  );
}
