import type { Phrase } from "../ports/PhraseRepository";
import type { PhraseRepository } from "../ports/PhraseRepository";
import type { PickLog } from "../../ui/pages/HomePage";
export type PickReason = {
    rule: string;
    detail: string;
};
export type PickResult = {
    phrase: Phrase;
    reason: PickReason;
};
export declare function getNextPhrase(repo: PhraseRepository, lastPhraseId: string | undefined, pickLogs: PickLog[], starState: Set<string>): Promise<PickResult>;
