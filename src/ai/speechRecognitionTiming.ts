import type { DeviceGroup } from "../sound/selectCharacterVoice";

export function ttsRecognitionRestartDelayMs(deviceGroup: DeviceGroup): number {
  return deviceGroup === "ios" ? 750 : 250;
}
