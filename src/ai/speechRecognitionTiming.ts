import type { DeviceGroup } from "../sound/selectCharacterVoice";

export function userTurnSoftTimeoutMs(deviceGroup: DeviceGroup): number {
  return deviceGroup === "ios" || deviceGroup === "android" ? 1800 : 1500;
}

export function ttsRecognitionRestartDelayMs(deviceGroup: DeviceGroup): number {
  return deviceGroup === "ios" ? 750 : 250;
}
