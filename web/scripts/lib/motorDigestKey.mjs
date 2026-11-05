// Diameter is keyed to 0.1 mm: whole millimeters would merge Apogee's 10.5 mm motors with 11 mm ones.

const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** @param {number} diameterMm the motor's diameter in millimeters, from either database */
export const digestKey = (mfr, designation, diameterMm) =>
  `${norm(mfr)}|${norm(designation)}|${Math.round(diameterMm * 10)}`;
