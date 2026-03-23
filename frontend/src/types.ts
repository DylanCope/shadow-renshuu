export interface FuriganaSegment {
  base: string;
  reading?: string;
}

export interface Sentence {
  id: number;
  text: string;
  start: number;
  end: number;
  segmentUrls: string[];  // array to support merged sentences
  translation?: string;
  furigana?: FuriganaSegment[];
}

export interface Session {
  session_id: string;
  sentences: Sentence[];
  audioUrl: string;
}

export interface AnalysisResult {
  score: number;
  tips: string[];
  phonetic_notes: string;
  overall: string;
  user_transcript?: string;
}

export type PracticeMode = 'listen' | 'shadow' | 'record' | 'feedback' | 'multi';

export interface SentenceProgress {
  sentence_id: number;
  attempts: number;
  best_score: number | null;
  latest_score: number | null;
  last_result: AnalysisResult | null;
}
