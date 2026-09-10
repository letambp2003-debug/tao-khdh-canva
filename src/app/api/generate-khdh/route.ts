import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/config/env';
import { GeminiService } from '@/services/ai/gemini.service';
import { SourceDocumentService } from '@/services/documents/source-document.service';
import { SourceContextBuilder } from '@/services/documents/source-context-builder';
import { ContentNormalizer } from '@/services/export/content-normalizer';
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
    const { command, lessonCode, jobId, apiKey, apiKeys, documentIds, projectId, lockedConfig } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_COMMAND', message: 'Lệnh (command) không được để trống' },
        { status: 400 }
      );
    }

    const keyPool = GeminiService.resolveKeyPool(apiKey, apiKeys);
    if (keyPool.length === 0) {
      return NextResponse.json(
        {
          error: 'MISSING_API_KEY',
          message: 'Chưa cấu hình Google AI API Key. Vui lòng nhập API Key trên giao diện hoặc trong .env.local',
        },
        { status: 401 }
      );
    }

    const env = getEnv();
    const activeJobId = jobId || `JOB-${Date.now()}`;
    const targetProject = projectId || 'default';

    // 1. Lấy danh sách tài liệu nguồn sẵn sàng (Source Documents)
    let activeDocs = await SourceDocumentService.getActiveReady(targetProject);
    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      activeDocs = activeDocs.filter((d) => documentIds.includes(d.id));
    }

    const { systemContext: sourceContextText, sourcesUsed } = SourceContextBuilder.buildPromptContext(activeDocs);
    const readinessReport = SourceContextBuilder.checkReadiness(activeDocs);

    // Xây dựng khối cấu hình cố định (nếu giáo viên đã khóa cấu hình)
    let lockedConfigSection = '';
    if (lockedConfig && typeof lockedConfig === 'object') {
      lockedConfigSection = [
        '',
        '## 🔒 CẤU HÌNH YÊU CẦU ĐÃ ĐƯỢC GIÁO VIÊN CỐ ĐỊNH (BẮT BUỘC TUÂN THỦ 100%):',
        `- Tên bài học chuẩn: ${lockedConfig.lessonTitle || ''}`,
        `- Mã bài học: ${lockedConfig.lessonCode || lessonCode || ''}`,
        `- Khối lớp & Học kỳ: ${lockedConfig.grade || 'Lớp 8'} - ${lockedConfig.subject || 'Toán học'} (${lockedConfig.term || 'Học kỳ I'})`,
        `- Tổng số tiết: ${lockedConfig.totalPeriods || 2} tiết`,
        `- Phân phối từng tiết: ${(lockedConfig.periodBreakdown || []).join(' | ')}`,
        `- Yêu cầu cần đạt về KIẾN THỨC: ${(lockedConfig.objectives?.knowledge || []).join('; ')}`,
        `- Yêu cầu cần đạt về NĂNG LỰC: ${(lockedConfig.objectives?.competencies || []).join('; ')}`,
        `- Yêu cầu cần đạt về PHẨM CHẤT: ${(lockedConfig.objectives?.qualities || []).join('; ')}`,
        `- Khái niệm trọng tâm: ${(lockedConfig.keyConcepts || []).join(', ')}`,
        `- Phương pháp dạy học: ${(lockedConfig.pedagogicalMethods || []).join(', ')}`,
        lockedConfig.customNotes ? `- Ghi chú riêng: ${lockedConfig.customNotes}` : '',
        '',
      ].join('\n');
    }

    // 2. Đọc file kỹ năng chuyên môn
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
      '6. TUYỆT ĐỐI KHÔNG xuất khối JSON AgentMessage, metadata JSON hay code block markdown ở đầu bản thảo. Bắt đầu trực tiếp bằng tiêu đề giáo án `# KẾ HOẠCH BÀI DẠY: ...`.',
      '',
      lockedConfigSection,
      '',
      sourceContextText,
      '',
      '## HƯỚNG DẪN CHUYÊN MÔN:',
      skillContent,
    ].join('\n');

    const userMessage = [
      `LỆNH THỰC THI: ${command} ${lessonCode || ''}`,
      `MÃ BÀI HỌC: ${lockedConfig?.lessonTitle || lessonCode || 'TỰ ĐỘNG'}`,
      `MÃ CÔNG VIỆC: ${activeJobId}`,
      lockedConfigSection,
      '',
      'Hãy thực thi lệnh và tạo bản Kế hoạch bài dạy hoàn chỉnh, chi tiết, đúng định dạng V10.1, tuân thủ nghiêm ngặt các căn cứ tài liệu nguồn và Cấu hình đã được cố định ở trên. Bắt đầu trực tiếp bằng # KẾ HOẠCH BÀI DẠY.',
    ].join('\n');

    const result = await GeminiService.generateContent({
      apiKeys: keyPool,
      systemPrompt,
      userMessage,
      model: 'pro',
    });

    const cleanDraft = ContentNormalizer.cleanMetadata(result.text);

    return NextResponse.json({
      status: 'OK',
      job_id: activeJobId,
      command,
      lesson_code: lessonCode || 'AUTO',
      khdh_draft: cleanDraft,
      token_usage: result.usage,
      model: result.model,
      duration_ms: result.durationMs,
      key_used: result.keyUsed,
      sources_used: sourcesUsed,
      source_readiness: readinessReport,
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
