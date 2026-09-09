import { ApiKeyValidationResult } from './ai.types';

const API_KEY_SESSION_KEY = 'khdh_user_gemini_api_key';
const API_KEY_LOCAL_KEY = 'khdh_user_gemini_api_key_persistent';

export class ApiKeyService {
  public static validateFormat(apiKey: string): ApiKeyValidationResult {
    if (!apiKey || typeof apiKey !== 'string') {
      return { isValid: false, message: 'API Key không được để trống' };
    }

    const trimmed = apiKey.trim();
    if (trimmed.length < 30) {
      return { isValid: false, message: 'Độ dài API Key quá ngắn (thường 39 ký tự)' };
    }

    if (!trimmed.startsWith('AIza')) {
      return { isValid: false, message: 'Google AI API Key chuẩn thường bắt đầu bằng "AIza"' };
    }

    return {
      isValid: true,
      message: 'Định dạng API Key hợp lệ',
      maskedKey: this.maskKey(trimmed)
    };
  }

  public static maskKey(apiKey: string): string {
    if (!apiKey) return '';
    const trimmed = apiKey.trim();
    if (trimmed.length <= 8) return '••••••••';
    const last4 = trimmed.slice(-4);
    return `••••••••${last4}`;
  }

  public static saveClientKey(apiKey: string, remember = false): void {
    if (typeof window === 'undefined') return;
    const trimmed = apiKey.trim();
    sessionStorage.setItem(API_KEY_SESSION_KEY, trimmed);
    if (remember) {
      localStorage.setItem(API_KEY_LOCAL_KEY, trimmed);
    } else {
      localStorage.removeItem(API_KEY_LOCAL_KEY);
    }
  }

  public static getClientKey(): string {
    if (typeof window === 'undefined') return '';
    const sessionKey = sessionStorage.getItem(API_KEY_SESSION_KEY);
    if (sessionKey) return sessionKey;
    const localKey = localStorage.getItem(API_KEY_LOCAL_KEY);
    return localKey || '';
  }

  public static clearClientKey(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(API_KEY_SESSION_KEY);
    localStorage.removeItem(API_KEY_LOCAL_KEY);
  }
}
