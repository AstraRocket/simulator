// `CatalogMotor` sizes are mm and masses g (thrustcurve data); the rest of the app is SI.

export const CATALOG_TO_SI = 0.001;

/** A catalog mm or g in SI. Divides, so a value handed to the kernel is the nearest double to the stated one. */
export const fromCatalog = (v: number): number => v / 1000;

export const toCatalogMm = (m: number): number => m * 1000;
