import type { LessonReview, SpokenReviewPart } from "./conversationTypes";
import type { ConversationLanguage } from "../characters/characterProfiles";

export type ReviewDisplayModel = {
  sections: LessonReview["sections"];
  visibleSectionCount: number;
  usedFallback: boolean;
};

const ENGLISH_SECTION_KEYS = ["goodPoints", "corrections", "alternatives"] as const;

export function buildReviewDisplayModel(
  sections: LessonReview["sections"],
  spokenReview: readonly SpokenReviewPart[],
  language: ConversationLanguage,
): ReviewDisplayModel {
  if (language === "ja") {
    return {
      sections,
      visibleSectionCount: sections.todayPoints.length > 0 ? 1 : 0,
      usedFallback: false,
    };
  }

  const visibleSectionCount = ENGLISH_SECTION_KEYS.filter((key) => sections[key].length > 0).length;
  if (visibleSectionCount > 0 || spokenReview.length === 0) {
    return { sections, visibleSectionCount, usedFallback: false };
  }

  const japaneseParts = spokenReview.filter((part) => part.lang === "ja-JP").map((part) => part.text.trim()).filter(Boolean);
  const englishExample = spokenReview.find((part) => part.lang === "en-US" && part.text.trim())?.text.trim();
  const fallbackSections: LessonReview["sections"] = {
    ...sections,
    goodPoints: japaneseParts[0] ? [japaneseParts[0]] : [],
    corrections: japaneseParts[1] ? [japaneseParts[1]] : [],
    alternatives: englishExample ? [`別表現：${englishExample}`] : [],
  };
  const fallbackVisibleSectionCount = ENGLISH_SECTION_KEYS.filter((key) => fallbackSections[key].length > 0).length;

  return {
    sections: fallbackSections,
    visibleSectionCount: fallbackVisibleSectionCount,
    usedFallback: fallbackVisibleSectionCount > 0,
  };
}
