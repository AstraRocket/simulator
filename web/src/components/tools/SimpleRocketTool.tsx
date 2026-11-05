import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SimpleMotorGuide } from './SimpleMotorGuide';
import { simpleKey } from './simpleFlight';
import { ToolLayout, ToolForm } from './ToolLayout';
import { SimpleHelp } from './SimpleHelp';
import { ChuteCard, FinsCard, LaunchCard, MotorCard, RocketCard } from './SimpleRocketCards';
import { SimpleProblem, SimpleResultCard } from './SimpleResults';
import { useSimpleRocket } from './useSimpleRocket';
import { MotorDialog } from '../sim/MotorDialog';
import { simpleMountFit } from '../../services/flight/simpleRocket';

export function SimpleRocketTool() {
  const { t } = useTranslation();
  const rocket = useSimpleRocket();
  const { launch, inputs, motor, setMotor, ready, flying, fly, cancel, openAsDesign, setErr } = rocket;
  const { guide, setGuide, setFlown, chuteOn, chuteDiameterM, setChuteDiameterM } = rocket;
  const [picking, setPicking] = useState(false);
  const [guiding, setGuiding] = useState(false);

  return (
    <ToolLayout help>
      <ToolForm title={t('simpleTool.title')} intro={t('simpleTool.intro')}>
        <SimpleHelp at="top" />
        <RocketCard rocket={rocket} />
        <FinsCard rocket={rocket} />
        <MotorCard rocket={rocket} onPick={() => setPicking(true)} onGuide={() => setGuiding(true)} />
        <ChuteCard rocket={rocket} />
        <LaunchCard rocket={rocket} />
      </ToolForm>
      <div className="h-fit space-y-3">
        <SimpleProblem rocket={rocket} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!flying && !ready}
            onClick={flying ? cancel : () => void fly()}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              flying ? 'bg-prominent hover:bg-prominent-hover' : 'bg-accent-600 hover:bg-accent-700'
            }`}
          >
            {flying ? t('sim.cancel') : t('sim.run')}
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={openAsDesign}
            title={t('simpleTool.openDesignHint')}
            className="shrink-0 rounded-lg bg-raised px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('simpleTool.openDesign')}
          </button>
        </div>
        <SimpleResultCard rocket={rocket} />
      </div>
      <SimpleHelp at="side" />
      {picking && inputs && (
        <MotorDialog
          onClose={() => setPicking(false)}
          onSelect={(spec) => {
            setMotor(spec);
            setPicking(false);
          }}
          onError={setErr}
          mount={simpleMountFit(inputs)}
          current={motor}
        />
      )}
      {guiding && inputs && (
        <SimpleMotorGuide
          inputs={inputs}
          launch={launch}
          flownKey={simpleKey(inputs, launch)}
          guide={guide}
          onGuide={setGuide}
          onUse={(row) => {
            // Pin the canopy the guide flew, so it does not resize for this motor's casing.
            if (chuteOn && chuteDiameterM == null && inputs.chute) setChuteDiameterM(inputs.chute.diameterM);
            setMotor(row.spec);
            setFlown({ figures: row.figures, nearest: row.nearest, key: simpleKey(inputs, launch, row.spec) });
            setGuiding(false);
          }}
          onClose={() => setGuiding(false)}
        />
      )}
    </ToolLayout>
  );
}
