/** Marks the element that is recording a new shortcut; global handlers skip
 *  keystrokes aimed at it so pressing a bound chord rebinds instead of firing. */
export const RECORDING_ATTRIBUTE = "data-recording-keys";

export function isRecordingKeys(event: KeyboardEvent): boolean {
  return event.target instanceof HTMLElement && event.target.closest(`[${RECORDING_ATTRIBUTE}]`) !== null;
}
