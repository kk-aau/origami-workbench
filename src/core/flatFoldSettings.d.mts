export interface FlatFoldSettings {
 startingFace: [number, number][];
 /** Valid only with an independently checked indexed material graph. */
 materialFace?: number;
}
export function validateFlatFoldSettings(value: unknown): asserts value is FlatFoldSettings;
