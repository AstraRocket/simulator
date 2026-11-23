import type { BackendPref, FlightResult, RocketTree, SimulationOptions } from './openRocketEngine';
import type { FlightConfig } from '../services/flight/flightConfigs';
import type { Keyed } from '../i18n/keyedError';
import type { OptPoint } from '../services/flight/optimizer/optGoals';
import type { OptPointPayload } from '../services/flight/optimizer/optPoint';

// Types only: the worker must never import simClient.ts (it would spawn a nested worker).
export interface SimPayload {
  tree: RocketTree;
  config: FlightConfig;
  options: SimulationOptions;
  lengthUnit?: string;
}

export type WorkerCall =
  | { method: 'ping'; args: null }
  | { method: 'simulate'; args: SimPayload }
  | { method: 'optimizePoint'; args: OptPointPayload };

export type WorkerMethod = WorkerCall['method'];

export interface WorkerResults {
  ping: 'ok';
  simulate: FlightResult;
  optimizePoint: OptPoint;
}

/** `engine` is resolved on the main thread; a worker cannot read `?engine=` or localStorage. */
export type WorkerRequest = { id: number; engine: BackendPref; lengthUnit: string } & WorkerCall;

/** A call's own timeout runs from this message. */
export interface WorkerReady {
  ready: true;
}

export type WorkerResponse<M extends WorkerMethod = WorkerMethod> =
  | { id: number; ok: true; result: WorkerResults[M] }
  | {
      id: number;
      ok: false;
      error: string;
      keyed?: Keyed;
      fatal?: true;
    };
