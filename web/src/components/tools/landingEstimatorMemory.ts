import { rememberedSlot } from './remembered';
import type { LandingRun } from '../../services/landing/landingEstimate';
import type { DescentPlan } from '../../services/landing/descentDrift';
import type { ToolSite } from './SiteFields';
import { ForecastState } from '../common/useForecastRequest';

type Recovery = 'single' | 'dual';

export interface EstimateInputs {
  latitudeDeg: number;
  longitudeDeg: number;
  padElevationM: number | null;
  date: string;
  hour: number;
  plan: DescentPlan;
}

export type State = ForecastState<{ run: LandingRun; inputs: EstimateInputs }>;

interface Remembered {
  site: ToolSite;
  date: string;
  hour: number;
  apogee: number | null;
  recovery: Recovery;
  singleRate: number | null;
  drogueRate: number | null;
  mainRate: number | null;
  mainAgl: number | null;
  state: State;
}

export const remembered = rememberedSlot<Remembered>();

export function forgetLandingEstimator(): void {
  remembered.forget();
}
