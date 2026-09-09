import { GoogleGenAI } from '@google/genai';
import { getEnv } from '@/config/env';
import { AiGenerateOptions, AiGenerateResult } from './ai.types';
import { MissingApiKeyError, parseAiError } from './ai.errors';

export const FLASH_MODEL_CASCADE = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

export const FLASH_LITE_MODEL_CASCADE = [
  'gemini-3.8-flash-lite',
  'gemini-3.7-flash-lite',
  'gemini-3.6-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
];

export class GeminiService {
  public static resolveApiKey(customKey?: string): string {
    if (customKey && customKey.trim()) {
      return customKey.trim();
    }
    const env = getEnv();
    if (env.GOOGLE_AI_API_KEY && env.GOOGLE_AI_API_KEY.trim()) {
      return env.GOOGLE_AI_API_KEY.trim();
    }
    return '';
  }

  public static resolveModelName(modelOption?: string, agentName?: string): string {
    const env = getEnv();
    if (modelOption && modelOption !== 'pro' && modelOption !== 'flash') {
      return modelOption;
    }

    if (modelOption === 'flash') {
      return env.GOOGLE_AI_FLASH_MODEL;
    }
    if (modelOption === 'pro') {
      return env.GOOGLE_AI_MODEL;
    }

    const proAgents = ['KhdhBuilderAgent', 'SlideAgent', 'CanvaNotebookAgent', 'QAAgent'];
    if (agentName && proAgents.includes(agentName)) {
      return env.GOOGLE_AI_MODEL;
    }
    return env.GOOGLE_AI_FLASH_MODEL;
  }

  /**
   * Tạo danh sách các model dự phòng theo thứ tự phân cấp
   */
  public static getCandidateModels(primaryModel: string): string[] {
    const candidates = [primaryModel];
    for (const m of FLASH_MODEL_CASCADE) {
      if (!candidates.includes(m)) {
        candidates.push(m);
      }
    }
    return candidates;
  }

  public static async generateContent(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const apiKey = this.resolveApiKey(options.apiKey);
    if (!apiKey) {
      throw new MissingApiKeyError();
    }

    const env = getEnv();
    const primaryModel = this.resolveModelName(options.model);
    const candidateModels = this.getCandidateModels(primaryModel);
    const startTime = Date.now();

    const ai = new GoogleGenAI({ apiKey });
    let lastError: unknown = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: options.userMessage,
          config: {
            systemInstruction: options.systemPrompt,
            maxOutputTokens: options.maxTokens ?? env.GOOGLE_AI_MAX_TOKENS,
            temperature: options.temperature ?? env.GOOGLE_AI_TEMPERATURE,
            topP: options.topP ?? env.GOOGLE_AI_TOP_P,
          },
        });

        const text = response.text || '';
        const usage = {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
        };

        return {
          text,
          usage,
          model: modelName,
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error;
        const errStr = String(error).toLowerCase();
        // Nếu lỗi do model không tồn tại / 404 / unsupported, thử model tiếp theo trong cascade
        if (
          errStr.includes('not found') ||
          errStr.includes('404') ||
          errStr.includes('unsupported') ||
          errStr.includes('is not supported')
        ) {
          console.warn(`⚠️ Model ${modelName} không khả dụng, tự động chuyển xuống model tiếp theo...`);
          continue;
        }
        // Với các lỗi khác (ví dụ: API Key sai), ném lỗi ngay
        throw parseAiError(error);
      }
    }

    throw parseAiError(lastError);
  }

  public static async testApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
    try {
      const resolved = this.resolveApiKey(apiKey);
      if (!resolved) {
        throw new MissingApiKeyError();
      }

      const env = getEnv();
      const ai = new GoogleGenAI({ apiKey: resolved });
      const testModels = [
        env.GOOGLE_AI_FLASH_MODEL,
        ...FLASH_LITE_MODEL_CASCADE,
        ...FLASH_MODEL_CASCADE,
      ];

      for (const model of testModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: 'Ping test. Reply "OK"',
            config: {
              maxOutputTokens: 5,
              temperature: 0.1,
            },
          });

          if (response.text) {
            return {
              success: true,
              message: `API Key hoạt động chính xác! (Kết nối qua mô hình: ${model})`,
            };
          }
        } catch (error) {
          const errStr = String(error).toLowerCase();
          if (
            errStr.includes('not found') ||
            errStr.includes('404') ||
            errStr.includes('unsupported')
          ) {
            continue;
          }
          throw parseAiError(error);
        }
      }

      return { success: false, message: 'Google AI không trả về phản hồi hợp lệ.' };
    } catch (error) {
      const parsed = parseAiError(error);
      return { success: false, message: parsed.userMessage };
    }
  }
}

