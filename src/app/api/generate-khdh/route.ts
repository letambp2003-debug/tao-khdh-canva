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
    const {
      command,
      lessonCode,
      jobId,
      apiKey,
      apiKeys,
      documentIds,
      projectId,
      lockedConfig,
      formatMode, // 'SPLIT_PERIODS' | 'CONTINUOUS_4SECTION'
    } = body;

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

    // Xác định chế độ xuất KHDH
    const isContinuous4Section =
      formatMode === 'CONTINUOUS_4SECTION' ||
      command.toUpperCase().includes('KHONG_TACH_TIET') ||
      command.toUpperCase().includes('4PHAN') ||
      command.toUpperCase().includes('V11');

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

    // 2. Đọc file kỹ năng / form mẫu tương ứng với chế độ được chọn
    let skillContent = '';
    if (isContinuous4Section) {
      try {
        const v11FormPath = join(process.cwd(), '03_FORM_KHDH_V11_4PHAN_KHONG_TACHTIET.MD');
        skillContent = await readFile(v11FormPath, 'utf-8');
      } catch {
        try {
          const docsV11Path = join(process.cwd(), 'docs', '03_FORM_KHDH_V11_4PHAN_KHONG_TACHTIET.MD');
          skillContent = await readFile(docsV11Path, 'utf-8');
        } catch {
          skillContent = 'Soạn KHDH V11 FINAL 4 phần A-B-C-D không tách tiết, bảng 2 cột CV 5512.';
        }
      }
    } else {
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
    }

    // Xây dựng System Prompt cho từng chế độ
    const systemPrompt = isContinuous4Section
      ? [
          'Bạn là KhdhBuilderAgent V11 FINAL — Chế độ SOẠN KHDH 4 PHẦN LIỀN MẠCH, KHÔNG TÁCH TIẾT (Theo Form 03_FORM_KHDH_V11_4PHAN_KHONG_TACHTIET.MD).',
          `Trường: ${env.SCHOOL_NAME}`,
          `Tổ chuyên môn: ${env.DEPARTMENT}`,
          `Giáo viên thực hiện: ${env.TEACHER_NAME}`,
          '',
          '## HỢP ĐỒNG VÀ QUY TẮC BẮT BUỘC CHO CHẾ ĐỘ V11 KHÔNG TÁCH TIẾT:',
          '1. Toàn bộ tiến trình dạy học tổ chức thống nhất thành đúng 4 phần lớn:',
          '   A. HOẠT ĐỘNG KHỞI ĐỘNG',
          '   B. HOẠT ĐỘNG HÌNH THÀNH KIẾN THỨC (Các Hoạt động 1, 2, ... nối tiếp nhau)',
          '   C. HOẠT ĐỘNG LUYỆN TẬP',
          '   D. HOẠT ĐỘNG VẬN DỤNG',
          '2. TUYỆT ĐỐI KHÔNG chia thành các tiêu đề TIẾT 1, TIẾT 2 trong bản KHDH xuất cuối. Tổng thời lượng = Số tiết × 45 phút và phân bổ liền mạch cho 4 phần A-B-C-D.',
          '3. Quy ước gạch đầu dòng: Tất cả các ý liệt kê trong mục I (Kiến thức, Năng lực, Phẩm chất), II (Thiết bị), IV (Hướng dẫn về nhà) dùng dấu gạch ngang `-` hoặc `\\-` ở đầu dòng. KHÔNG dùng bullet chấm tròn `•`.',
          '4. Mục I.1 KIẾN THỨC chỉ liệt kê tên danh mục ngắn gọn (2-12 từ), KHÔNG giải thích, KHÔNG công thức, KHÔNG chép YCCĐ.',
          '5. Tiến trình dạy học CHỈ DÙNG ĐÚNG 2 CỘT: HOẠT ĐỘNG CỦA GV VÀ HS | SẢN PHẨM DỰ KIẾN.',
          '6. Mỗi hoạt động có đủ 4 phần: a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện (Bước 1, 2, 3, 4).',
          '7. Hình học chính xác dùng mã TikZ / Overleaf ngay dưới nội dung cần vẽ; Ảnh minh họa thực tế dùng PROMPT TẠO ẢNH ngay dưới nội dung.',
          '8. Có mục IV. HƯỚNG DẪN VỀ NHÀ và mục V. KẾ HOẠCH ĐÁNH GIÁ NỘI DUNG CỦA BÀI/CHỦ ĐỀ (Bảng 5 cột: Mục đích đánh giá | Hình thức | Phương pháp | Công cụ | Ghi chú).',
          '9. Công thức toán dùng chuẩn LaTeX $...$ hoặc $$...$$.',
          '10. TUYỆT ĐỐI KHÔNG xuất khối JSON AgentMessage, metadata JSON hay code block markdown ở đầu bản thảo. Bắt đầu trực tiếp bằng tiêu đề giáo án hoặc phần đầu KHDH.',
          '',
          lockedConfigSection,
          '',
          sourceContextText,
          '',
          '## HƯỚNG DẪN CẤU TRÚC V11 CHUẨN:',
          skillContent,
        ].join('\n')
      : [
          'Bạn là KhdhBuilderAgent V10.1 FINAL - Chế độ SOẠN KHDH TÁCH TIẾT THEO PPCT (Chuẩn Bộ Giáo dục & CV 5512).',
          `Trường: ${env.SCHOOL_NAME}`,
          `Tổ chuyên môn: ${env.DEPARTMENT}`,
          `Giáo viên thực hiện: ${env.TEACHER_NAME}`,
          '',
          '## HỢP ĐỒNG VÀ QUY TẮC BẮT BUỘC CHO CHẾ ĐỘ TÁCH TIẾT:',
          '1. Phân chia bài học theo từng TIẾT [PPCT] (Tiết 1, Tiết 2, ...) tương ứng với phân phối chương trình.',
          '2. Mục I.1 KIẾN THỨC chỉ liệt kê tên danh mục ngắn gọn (2-12 từ), KHÔNG giải thích, KHÔNG YCCĐ.',
          '3. Tiến trình dạy học CHỈ DÙNG ĐÚNG 2 CỘT: HOẠT ĐỘNG CỦA GV VÀ HS | SẢN PHẨM DỰ KIẾN.',
          '4. Mỗi hoạt động có đủ 4 phần: a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện (Bước 1, 2, 3, 4).',
          '5. Công thức toán dùng chuẩn LaTeX $...$ hoặc $$...$$.',
          '6. Hình học chính xác dùng mã TikZ / Overleaf; ảnh minh họa thực tế dùng PROMPT TẠO ẢNH ngay dưới nội dung.',
          '7. TUYỆT ĐỐI KHÔNG xuất khối JSON AgentMessage, metadata JSON hay code block markdown ở đầu bản thảo. Bắt đầu trực tiếp bằng tiêu đề giáo án `# KẾ HOẠCH BÀI DẠY: ...`.',
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
      `CHẾ ĐỘ SOẠN: ${isContinuous4Section ? 'V11 FINAL - KHÔNG TÁCH TIẾT (4 PHẦN A-B-C-D LIỀN MẠCH)' : 'V10.1 - TÁCH TIẾT THEO PPCT'}`,
      `MÃ BÀI HỌC: ${lockedConfig?.lessonTitle || lessonCode || 'TỰ ĐỘNG'}`,
      `MÃ CÔNG VIỆC: ${activeJobId}`,
      lockedConfigSection,
      '',
      isContinuous4Section
        ? 'Hãy thực thi lệnh và tạo bản Kế hoạch bài dạy hoàn chỉnh theo đúng FORM V11 4 PHẦN KHÔNG TÁCH TIẾT (A-B-C-D), bảng 2 cột, TikZ/Prompt ảnh ngay dưới nội dung, đầy đủ Mục IV Hướng dẫn về nhà và Mục V Bảng đánh giá 5 cột, tuân thủ nghiêm ngặt các căn cứ tài liệu nguồn.'
        : 'Hãy thực thi lệnh và tạo bản Kế hoạch bài dạy hoàn chỉnh, chi tiết, đúng định dạng Tách tiết V10.1, tuân thủ nghiêm ngặt các căn cứ tài liệu nguồn và Cấu hình đã được cố định ở trên. Bắt đầu trực tiếp bằng # KẾ HOẠCH BÀI DẠY.',
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
      format_mode: isContinuous4Section ? 'CONTINUOUS_4SECTION' : 'SPLIT_PERIODS',
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
