import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/config/env';
import { GeminiService } from '@/services/ai/gemini.service';
import { checkRateLimit } from '@/lib/rate-limiter';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: 'QUOTA_LIMIT',
          message: 'Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau 1 phút.',
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { command, lessonCode, jobId, apiKey } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_COMMAND', message: 'Lệnh (command) không được để trống' },
        { status: 400 }
      );
    }

    const resolvedApiKey = GeminiService.resolveApiKey(apiKey);
    if (!resolvedApiKey) {
      return NextResponse.json(
        {
          error: 'MISSING_API_KEY',
          message: 'Chưa cấu hình Google AI API Key. Vui lòng nhập API Key của bạn trên giao diện hoặc trong .env.local',
        },
        { status: 401 }
      );
    }

    const env = getEnv();
    const activeJobId = jobId || `JOB-${Date.now()}`;

    let skillContent = '';
    try {
      const skillPath = join(process.cwd(), 'docs', 'agents', '04_KhdhBuilderAgent', 'skill.md');
      skillContent = await readFile(skillPath, 'utf-8');
    } catch {
      try {
        const rootForm = join(process.cwd(), '03_FORM_KHDH.MD');
        skillContent = await readFile(rootForm, 'utf-8');
      } catch {
        skillContent = 'Soạn KHDH chuẩn V10.1 theo Công văn 5512 với 2 cột: HOẠT ĐỘNG CỦA GV VÀ HS | SẢN PHẨM DỰ KIẾN';
      }
    }

    const systemPrompt = [
      'Bạn là KhdhBuilderAgent V10.1 FINAL - Hệ thống tự động tạo Kế hoạch bài dạy (KHDH) chuẩn Bộ Giáo dục.',
      `Trường: ${env.SCHOOL_NAME}`,
      `Tổ chuyên môn: ${env.DEPARTMENT}`,
      `Giáo viên thực hiện: ${env.TEACHER_NAME}`,
      '',
      '## HỢP ĐỒNG VÀ QUY TẮC BẮT BUỘC:',
      '1. Mục I.1 KIẾN THỨC chỉ liệt kê tên danh mục ngắn gọn (2-12 từ), KHÔNG giải thích, KHÔNG YCCĐ.',
      '2. Tiến trình dạy học CHỈ DÙNG ĐÚNG 2 CỘT: HOẠT ĐỘNG CỦA GV VÀ HS | SẢN PHẨM DỰ KIẾN.',
      '3. Mỗi hoạt động có đủ 4 phần: a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện (Bước 1, 2, 3, 4).',
      '4. Công thức toán dùng chuẩn LaTeX $...$ hoặc $$...$$.',
      '5. Hình học chính xác dùng mã TikZ / Overleaf; ảnh minh họa thực tế dùng PROMPT TẠO ẢNH ngay dưới nội dung.',
      '',
      '## HƯỚNG DẪN CHUYÊN MÔN:',
      skillContent,
    ].join('\n');

    const userMessage = [
      `LỆNH THỰC THI: ${command} ${lessonCode || ''}`,
      `MÃ BÀI HỌC: ${lessonCode || 'TỰ ĐỘNG'}`,
      `MÃ CÔNG VIỆC: ${activeJobId}`,
      '',
      'Hãy thực thi lệnh và tạo bản Kế hoạch bài dạy hoàn chỉnh, chi tiết, đúng định dạng V10.1.',
    ].join('\n');

    const result = await GeminiService.generateContent({
      apiKey: resolvedApiKey,
      systemPrompt,
      userMessage,
      model: 'pro',
    });

    return NextResponse.json({
      status: 'OK',
      job_id: activeJobId,
      command,
      lesson_code: lessonCode || 'AUTO',
      khdh_draft: result.text,
      token_usage: result.usage,
      model: result.model,
      duration_ms: result.durationMs,
    });
  } catch (error) {
    const errStr = String(error);
    console.error('API Error in generate-khdh:', errStr);
    return NextResponse.json(
      {
        error: 'GENERATION_FAILED',
        message: errStr.includes('API key') 
          ? 'Google AI API Key không hợp lệ hoặc đã hết hạn.' 
          : 'Đã xảy ra lỗi khi tạo KHDH: ' + errStr,
      },
      { status: 500 }
    );
  }
}
