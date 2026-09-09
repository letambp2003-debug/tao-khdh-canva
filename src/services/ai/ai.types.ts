export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiGenerateOptions {
  apiKey?: string;
  systemPrompt?: string;
  userMessage: string;
  model?: 'pro' | 'flash' | string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
}

export interface AiGenerateResult {
  text: string;
  usage: TokenUsage;
  model: string;
  durationMs: number;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  message: string;
  maskedKey?: string;
}
