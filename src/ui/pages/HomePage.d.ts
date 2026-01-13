import "../../styles/style.css";
export type PickLog = {
    time: number;
    order: number;
    phraseId: string;
    primaryTag: string | null;
    rule: string;
    detail: string;
    revealed: boolean;
    revealAtSec: number | null;
    timeout: boolean;
    elapsedTotal: number;
    tagOrder: number;
    consecutiveSameTag: number;
};
export default function HomePage(): import("react/jsx-runtime").JSX.Element;
