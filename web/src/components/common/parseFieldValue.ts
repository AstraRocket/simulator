import { parseEntry } from '../../prefs/entryValue';

/** Clamps because HTML `min`/`max` are only spinner hints; a unit-converted field must also guard `toSi`. */
export const parseFieldValue = parseEntry;
