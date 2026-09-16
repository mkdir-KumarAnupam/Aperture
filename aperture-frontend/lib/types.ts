export type Platform = "X" | "Instagram" | "Reddit" | "Telegram";
export type Emotion = "Excitement" | "Supportive" | "Anxiety" | "Sarcasm" | "Against" | "Neutral";

export type Trend = {
  id: string; name: string; category: string; description: string;
  mentions: number; reach: number; growth: number; leadingEmotion: Emotion;
  keywords: string[]; hubs: string[]; series: number[];
  emotion: Record<Emotion, number>; platforms: { name: Platform; share: number; color: string }[];
  events: { label: string; value: string; at: number }[];
};
