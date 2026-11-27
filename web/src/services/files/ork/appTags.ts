// The app's own .ork elements: the writers emit them and the passthrough must not copy them again. Named as desktop
// OpenRocket names its own, beside the tags they sit with, so it can adopt them as they are.
/** In a body tube: its ejection charge bays and their ground tests. */
export const BAYS_TAG = 'ejectionbays';
/** In a recovery device: `true` for the stage's main, beside OpenRocket's `isdrogue`. */
export const MAIN_TAG = 'ismain';
/** In a recovery device: the airframe joint its deployment opens. */
export const OPENS_TAG = 'deployjoint';
/** In the rocket: the kit maker, part number and dated revision log. */
export const NOTES_TAG = 'designnotes';
/** In <conditions>: `rail` for a launch rail; absent is a rod, as desktop flies either. */
export const LAUNCHER_TAG = 'launchguide';
