export type Platform = "X" | "Reddit" | "Telegram";
export type Emotion = "Excitement" | "Supportive" | "Anxiety" | "Sarcasm" | "Against" | "Neutral";

export type NarrativeSentiment = "Positive" | "Negative" | "Uncertain" | "Neutral";

export interface NarrativePlatformShare {
  platform: Platform;
  count: number;
}

export interface NarrativePost {
  id: string | number;
  platform: Platform;
  author: string;
  avatarBg?: string;
  text: string;
  timestamp: string;
  likes?: string | number;
  reposts?: string | number;
}

export interface Narrative {
  id: string;
  title: string;
  description?: string;
  assignedPostsCount: number;
  activitySeries?: number[];
  sentiment?: NarrativeSentiment;
  platforms?: NarrativePlatformShare[];
  growth?: number;
  updatedAt?: string | number;
  posts?: NarrativePost[];
  emo?: Record<string, number>;
}

export type Trend = {
  id: string; name: string; category: string; description: string;
  mentions: number; reach: number; growth: number; leadingEmotion: Emotion;
  keywords: string[]; hubs: string[]; series: number[];
  emotion: Record<Emotion, number>; platforms: { name: Platform; share: number; color: string }[];
  events: { label: string; value: string; at: number }[];
  narratives?: Narrative[];
};

