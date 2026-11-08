import { nsKey } from '../../services/storage/storageKeys';
import { readLocalJson, writeLocalJson } from '../../services/storage/localPref';

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isRange = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

const MFRS_KEY = nsKey('motorPicker:mfrs');
export const loadMfrs = (): Set<string> => new Set(readLocalJson(MFRS_KEY, isStringList, []));
export const saveMfrs = (s: Set<string>): void => void writeLocalJson(MFRS_KEY, [...s]);

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

const HIDE_OOP_KEY = nsKey('motorPicker:hideOop');
export const loadHideOop = (): boolean => readLocalJson(HIDE_OOP_KEY, isBool, true);
export const saveHideOop = (on: boolean): void => void writeLocalJson(HIDE_OOP_KEY, on);

const HIDE_SIMILAR_KEY = nsKey('motorPicker:hideSimilar');
export const loadHideSimilar = (): boolean => readLocalJson(HIDE_SIMILAR_KEY, isBool, true);
export const saveHideSimilar = (on: boolean): void => void writeLocalJson(HIDE_SIMILAR_KEY, on);

/** Stored only from the user's own drags: a mount-seeded range would follow the user to every mount. */
const DIA_KEY = nsKey('motorPicker:dia2');
export const loadDia = (): [number, number] | null => readLocalJson<[number, number] | null>(DIA_KEY, isRange, null);
export const saveDia = (d: [number, number]): void => void writeLocalJson(DIA_KEY, d);
