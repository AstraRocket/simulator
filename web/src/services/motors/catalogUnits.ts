import { M_TO_MM } from '../../prefs/units';

/**
 * The catalog's own units. A `CatalogMotor` states its diameter and length in
 * millimeters and its masses in grams, a thousandth of the SI unit each, as the
 * thrustcurve data does; everything else in the app works in SI.
 */

/** The scale from a catalog size or mass to SI. */
export const CATALOG_TO_SI = 0.001;

/** SI meters to the catalog's millimeters, to set a seated motor or a mount beside a catalog row. */
export const toCatalogMm = (m: number): number => m * M_TO_MM;
