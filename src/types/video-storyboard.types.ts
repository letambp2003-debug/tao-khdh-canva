/**
 * Video Storyboard & AI Video Prompt Types
 * KHDH AUTO V10.1
 */

export interface StoryboardScene {
  sceneNumber: number;
  title: string;
  duration: string;
  visualDescription: string;
  onScreenText: string;
  imagePrompt: string;    // Prompt tạo ảnh Keyframe (Midjourney v6 / Flux / DALL-E 3)
  videoPrompt: string;    // Prompt tạo chuyển động Video (Runway Gen-3 Alpha / Kling 1.5 / Sora)
  aiVideoPrompt?: string; // Legacy alias for videoPrompt
  voiceoverScript: string;// Lời thoại / Thuyết minh tiếng Việt chuẩn sư phạm
  audioPrompt: string;    // Nhạc nền BGM & Hiệu ứng âm thanh SFX
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
