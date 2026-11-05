// Desktop's `ComponentPreset.Type.valueOf` rejects our lowercase row types.

/** A Map: the key comes from a file and `__proto__` would hit Object.prototype. */
const TO_KERNEL = new Map<string, string>(
  Object.entries({
    nosecone: 'NOSE_CONE',
    bodytube: 'BODY_TUBE',
    transition: 'TRANSITION',
    centeringring: 'CENTERING_RING',
    tubecoupler: 'TUBE_COUPLER',
    bulkhead: 'BULK_HEAD',
    engineblock: 'ENGINE_BLOCK',
    launchlug: 'LAUNCH_LUG',
    railbutton: 'RAIL_BUTTON',
    parachute: 'PARACHUTE',
    streamer: 'STREAMER',
  }),
);

const TO_APP = new Map<string, string>([...TO_KERNEL].map(([k, v]) => [v, k]));

export const kernelPresetType = (type: string | undefined): string => (type ? (TO_KERNEL.get(type) ?? '') : '');

export const appPresetType = (type: string | undefined): string =>
  type ? (TO_APP.get(type) ?? type.toLowerCase()) : '';
