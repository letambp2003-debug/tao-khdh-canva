/**
 * Video Storyboard & AI Video Prompt Types
 * KHDH AUTO V10.1
 */

export interface StoryboardScene {
  sceneNumber: number;
  title: string;
  duration: string;
  visualDescription: string;
  voiceoverScript: string;
  onScreenText: string;
  aiVideoPrompt: string; // Runway Gen-3 Alpha / Kling AI / Sora prompt in English
  audioPrompt: string;   // Sound effects & BGM guidance
}

export interface VideoStoryboardData {
  lessonTitle: string;
  lessonCode: string;
  totalDuration: string;
  videoStyle: string;
  targetAudience: string;
  scenes: StoryboardScene[];
  masterPromptSummary: string;
}

export interface GenerateStoryboardRequest {
  khdhDraft: string;
  lessonCode?: string;
  apiKeys?: string[];
  videoStyle?: string;
  targetDuration?: string;
}

export interface GenerateStoryboardResponse {
  success: boolean;
  storyboard?: VideoStoryboardData;
  message?: string;
  keyUsed?: string;
}
