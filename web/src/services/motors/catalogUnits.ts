import { M_TO_MM } from '../../prefs/units';

// `CatalogMotor` sizes are mm and masses g (thrustcurve data); the rest of the app is SI.

export const CATALOG_TO_SI = 0.001;

export const toCatalogMm = (m: number): number => m * M_TO_MM;
