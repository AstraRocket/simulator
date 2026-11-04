import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabs } from '../common/useTabs';
import { LandingEstimator } from './LandingEstimator';
import { ParachuteTool } from './ParachuteTool';
import { FlutterTool } from './FlutterTool';
import { EjectionTool } from './EjectionTool';
import { ExhaustTool } from './ExhaustTool';
import { TOOLS, type Tool } from '../../state/tabs';

let rememberedTool: Tool = 'landing';

export function forgetToolsPane(): void {
  rememberedTool = 'landing';
}

/** Only the open tool is mounted, so no two tools put the same field in the document. */
export function ToolsPane() {
  const { t } = useTranslation();
  const [tool, setToolState] = useState<Tool>(rememberedTool);
  const setTool = (next: Tool) => {
    rememberedTool = next;
    setToolState(next);
  };
  const tabs = useTabs(TOOLS, tool, setTool);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label={t('tools.label')}
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-line/10 px-3 pt-2"
      >
        {TOOLS.map((k) => (
          <button
            key={k}
            type="button"
            {...tabs.tab(k)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-1.5 text-xs font-semibold ${
              tool === k ? 'border-accent-400 text-accent-300' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t(`tools.tool_${k}`)}
          </button>
        ))}
      </div>
      <div
        {...tabs.panel}
        // The exhaust gallery has no focusable field, so its panel needs a tab stop to scroll.
        tabIndex={tool === 'exhaust' ? 0 : undefined}
        className="min-h-0 flex-1 overflow-auto p-3"
      >
        {tool === 'landing' && <LandingEstimator />}
        {tool === 'chute' && <ParachuteTool />}
        {tool === 'flutter' && <FlutterTool />}
        {tool === 'ejection' && <EjectionTool />}
        {tool === 'exhaust' && <ExhaustTool />}
      </div>
    </div>
  );
}
