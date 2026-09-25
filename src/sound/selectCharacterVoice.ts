import { CHARACTER_PROFILES } from "../characters/characterProfiles";
import type { CharacterId, CharacterProfile, CharacterVoicePreferences } from "../characters/characterProfiles";

export type DeviceGroup = "desktop" | "android" | "ios" | "fallback";
export type SelectionReason = "preferredName" | "preferredLang" | "preferredLangPrefix" | "fallbackLang" | "englishVoice" | "browserDefault";
export type CharacterVoiceSelection = {
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  /** Apply this English language even when voice is null. */
  lang: string;
  deviceGroup: DeviceGroup;
  selectionReason: SelectionReason;
};

export function normalizeLang(lang: string): string {
  return lang.trim().toLowerCase().replaceAll("_", "-");
}

function detectDeviceGroup(): DeviceGroup {
  if (typeof navigator === "undefined") return "fallback";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS can advertise itself as a Mac.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/windows|macintosh|linux|cros/i.test(ua)) return "desktop";
  return "fallback";
}

/** Pass a fresh getVoices() result; call again after voiceschanged if initially empty.
 * This function only selects settings. It never starts or cancels speech.
 */
export function selectCharacterVoice(
  characterId: CharacterId,
  availableVoices: readonly SpeechSynthesisVoice[],
  options: { deviceGroup?: DeviceGroup; debug?: boolean; locale?: "en-US" | "ja-JP"; brightJapanese?: boolean; excludedVoiceNames?: readonly string[] } = {},
): CharacterVoiceSelection {
  const profile: CharacterProfile = CHARACTER_PROFILES[characterId];
  const locale = options.locale ?? (profile.conversationLanguage === "ja" ? "ja-JP" : "en-US");
  const preferences: CharacterVoicePreferences = locale === "ja-JP"
    ? options.brightJapanese
      ? profile.brightJapaneseVoicePreferences ?? profile.japaneseVoicePreferences ?? profile.voicePreferences
      : profile.japaneseVoicePreferences ?? profile.voicePreferences
    : profile.voicePreferences;
  const requestedGroup = options.deviceGroup ?? detectDeviceGroup();
  const deviceGroup = requestedGroup !== "fallback" && preferences[requestedGroup] ? requestedGroup : "fallback";
  const preference = (deviceGroup === "fallback" ? undefined : preferences[deviceGroup]) ?? preferences.fallback;
  const languagePrefix = locale === "ja-JP" ? "ja" : "en";
  const excludedVoiceNames = new Set(options.excludedVoiceNames ?? []);
  const languageVoices = availableVoices.filter((voice) =>
    !excludedVoiceNames.has(voice.name) && new RegExp(`^${languagePrefix}(?:-|$)`).test(normalizeLang(voice.lang))
  );
  const preferredLangs = (preference.preferredLangs ?? []).map(normalizeLang);
  let voice: SpeechSynthesisVoice | undefined;
  let selectionReason: SelectionReason = "browserDefault";

  for (const name of preference.preferredNames ?? []) {
    voice = languageVoices.find((candidate) => candidate.name === name);
    if (voice) { selectionReason = "preferredName"; break; }
  }
  // Apple may suffix downloaded variants (for example Enhanced/Premium),
  // while the Voice Test intentionally ranks them by their base voice name.
  if (!voice && deviceGroup === "ios") {
    for (const name of preference.preferredNames ?? []) {
      const normalizedName = name.toLowerCase();
      voice = languageVoices.find((candidate) => {
        const candidateName = candidate.name.toLowerCase();
        return candidateName === normalizedName || candidateName.includes(normalizedName);
      });
      if (voice) { selectionReason = "preferredName"; break; }
    }
  }
  if (!voice) {
    for (const lang of preferredLangs) {
      voice = languageVoices.find((candidate) => normalizeLang(candidate.lang) === lang);
      if (voice) { selectionReason = "preferredLang"; break; }
    }
  }
  if (!voice) {
    for (const lang of preferredLangs) {
      voice = languageVoices.find((candidate) => normalizeLang(candidate.lang).startsWith(`${lang}-`));
      if (voice) { selectionReason = "preferredLangPrefix"; break; }
    }
  }
  if (!voice) {
    const fallbackLangs = [...(preferences.fallback.preferredLangs ?? []), locale, ...(locale === "en-US" ? ["en-GB"] : [])].map(normalizeLang);
    for (const lang of fallbackLangs) {
      voice = languageVoices.find((candidate) => normalizeLang(candidate.lang) === lang)
        ?? languageVoices.find((candidate) => normalizeLang(candidate.lang).startsWith(`${lang}-`));
      if (voice) { selectionReason = "fallbackLang"; break; }
    }
  }
  if (!voice && languageVoices.length) {
    voice = languageVoices[0];
    selectionReason = "englishVoice";
  }
  const result: CharacterVoiceSelection = {
    voice: voice ?? null,
    rate: preference.rate,
    pitch: preference.pitch,
    lang: voice ? normalizeLang(voice.lang) : locale,
    deviceGroup,
    selectionReason,
  };
  if (import.meta.env?.DEV && options.debug) {
    console.debug("Character TTS selection", {
      character: profile.displayName,
      ...result,
      voice: result.voice?.name ?? "Browser default voice",
    });
  }
  return result;
}
