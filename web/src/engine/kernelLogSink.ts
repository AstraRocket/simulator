// TeaVM reads these globals once at module evaluation, so import this above vendor/openrocket-engine.mjs.

const drop = (): void => {};

const g = globalThis as Record<string, unknown>;
if (typeof g.$rt_putStdoutCustom !== 'function') g.$rt_putStdoutCustom = drop;
if (typeof g.$rt_putStderrCustom !== 'function') g.$rt_putStderrCustom = drop;
