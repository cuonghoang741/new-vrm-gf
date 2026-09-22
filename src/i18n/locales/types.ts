/**
 * One flat table of translation keys per language.
 *
 * Flat rather than nested on purpose: the keys already carry their namespace
 * ("play.greeting4"), and a flat map is what makes a missing key visible as a
 * single grep across ten files.
 */
export type Dict = Record<string, string>;
