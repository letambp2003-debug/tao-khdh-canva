import { NextRequest, NextResponse } from 'next/server';
import { GeminiService } from '@/services/ai/gemini.service';
import { ApiKeyService } from '@/services/ai/api-key.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { apiKey } = body;

    const keyToTest = apiKey || GeminiService.resolveApiKey();

    if (!keyToTest) {
      return NextResponse.json(
        { success: false, message: 'Chưa có API Key nào để kiểm tra. Vui lòng nhập API Key.' },
        { status: 400 }
      );
    }

    const formatCheck = ApiKeyService.validateFormat(keyToTest);
    if (!formatCheck.isValid) {
      return NextResponse.json(
        { success: false, message: formatCheck.message },
        { status: 400 }
      );
    }

    const result = await GeminiService.testApiKey(keyToTest);
    return NextResponse.json({
      success: result.success,
      message: result.message,
      maskedKey: ApiKeyService.maskKey(keyToTest),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Lỗi kiểm tra API Key: ' + String(error) },
      { status: 500 }
    );
  }
}
