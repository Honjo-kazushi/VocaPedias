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

export function detectDeviceGroup(): DeviceGroup {
  if (typeof navigator === "undefined") return "fallback";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS can advertise itself as a Mac.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/windows|macintosh|linux|cros/i.test(ua)) return "desktop";
  return "fallback";
}

function matchingNamedVoices(
  voices: readonly SpeechSynthesisVoice[],
  preference: CharacterVoicePreferences["fallback"],
  allowAppleSuffixes: boolean,
): SpeechSynthesisVoice[] {
  const preferredVoices = preference.preferredVoices
    ?? (preference.preferredNames ?? []).map((name) => ({ name, lang: undefined }));
  const matched: SpeechSynthesisVoice[] = [];
  for (const { name, lang } of preferredVoices) {
    const normalizedName = name.toLowerCase();
    const voice = voices.find((candidate) => {
      if (matched.includes(candidate)) return false;
      const candidateName = candidate.name.toLowerCase();
      const nameMatches = candidateName === normalizedName || (allowAppleSuffixes && candidateName.includes(normalizedName));
      return nameMatches && (!lang || normalizeLang(candidate.lang) === normalizeLang(lang));
    });
    if (voice) matched.push(voice);
  }
  return matched;
}

export function getCharacterVoiceCandidates(
  characterId: CharacterId,
  availableVoices: readonly SpeechSynthesisVoice[],
  options: { deviceGroup?: DeviceGroup; locale?: "en-US" | "ja-JP"; limit?: number } = {},
): SpeechSynthesisVoice[] {
  const profile: CharacterProfile = CHARACTER_PROFILES[characterId];
  const locale = options.locale ?? (profile.conversationLanguage === "ja" ? "ja-JP" : "en-US");
  const preferences: CharacterVoicePreferences = locale === "ja-JP"
    ? profile.japaneseVoicePreferences ?? profile.voicePreferences
    : profile.voicePreferences;
  const requestedGroup = options.deviceGroup ?? detectDeviceGroup();
  const deviceGroup = requestedGroup !== "fallback" && preferences[requestedGroup] ? requestedGroup : "fallback";
  const preference = (deviceGroup === "fallback" ? undefined : preferences[deviceGroup]) ?? preferences.fallback;
  const prefix = locale === "ja-JP" ? "ja" : "en";
  const eligible = availableVoices.filter((voice) => new RegExp(`^${prefix}(?:-|$)`).test(normalizeLang(voice.lang)));
  const named = matchingNamedVoices(eligible, preference, deviceGroup === "ios");
  const remaining = eligible.filter((voice) => !named.includes(voice));
  const preferredLangs = (preference.preferredLangs ?? []).map(normalizeLang);
  remaining.sort((left, right) => {
    const rank = (voice: SpeechSynthesisVoice) => {
      const lang = normalizeLang(voice.lang);
      const index = preferredLangs.findIndex((preferred) => lang === preferred || lang.startsWith(`${preferred}-`));
      return index < 0 ? preferredLangs.length : index;
    };
    return rank(left) - rank(right) || Number(right.localService) - Number(left.localService) || left.name.localeCompare(right.name);
  });
  return [...named, ...remaining].slice(0, options.limit ?? 3);
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

  voice = matchingNamedVoices(languageVoices, preference, deviceGroup === "ios")[0];
  if (voice) selectionReason = "preferredName";
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
