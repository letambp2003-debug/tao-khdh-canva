import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/config/env';
import { GeminiService } from '@/services/ai/gemini.service';
import { SourceDocumentService } from '@/services/documents/source-document.service';
import { SourceContextBuilder } from '@/services/documents/source-context-builder';
import { ContentNormalizer } from '@/services/export/content-normalizer';
import { checkRateLimit } from '@/lib/rate-limiter';
import { resolveUserProjectIdFromRequest } from '@/lib/user-workspace';
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
      sectionStage, // 'ALL' | 'STAGE_1_MUC_TIEU_KHOI_DONG' | 'STAGE_2_HINH_THANH_KT' | 'STAGE_3_LUYEN_TAP' | 'STAGE_4_VAN_DUNG_HUONG_DAN'
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
    const targetProject = await resolveUserProjectIdFromRequest(request, projectId);

    // Xác định giai đoạn (Section Stage) nếu có
    const effectiveStage = sectionStage || (
      command.toUpperCase().includes('PHAN_A') ? 'STAGE_1_MUC_TIEU_KHOI_DONG' :
      command.toUpperCase().includes('PHAN_B') ? 'STAGE_2_HINH_THANH_KT' :
      command.toUpperCase().includes('PHAN_C') ? 'STAGE_3_LUYEN_TAP' :
      command.toUpperCase().includes('PHAN_D') ? 'STAGE_4_VAN_DUNG_HUONG_DAN' :
      'ALL'
    );

    // Xác định chế độ xuất KHDH
    const isContinuous4Section =
      formatMode === 'CONTINUOUS_4SECTION' ||
      command.toUpperCase().includes('KHONG_TACH_TIET') ||
      command.toUpperCase().includes('4PHAN') ||
      command.toUpperCase().includes('4_PHAN') ||
      command.toUpperCase().includes('V11') ||
      effectiveStage !== 'ALL';

    // 1. Lấy danh sách tài liệu nguồn sẵn sàng (Source Documents)
    let activeDocs = await SourceDocumentService.getActiveReady(targetProject);
    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      activeDocs = activeDocs.filter((d) => documentIds.includes(d.id));
    }

    // Nếu lệnh là DANH_MUC: Trích xuất danh mục và ma trận bài học trực tiếp
    if (command.toUpperCase().includes('DANH_MUC')) {
      const { CatalogExtractorService } = await import('@/services/catalog/catalog-extractor.service');
      const { markdownSummary, keyUsed } = await CatalogExtractorService.extractCatalog({
        grade: lockedConfig?.grade || 'Lớp 8',
        subject: lockedConfig?.subject || 'Toán học',
        term: lockedConfig?.term || 'Học kỳ I',
        apiKeys: keyPool,
        documentIds,
        projectId: targetProject,
      });

      return NextResponse.json({
        status: 'OK',
        job_id: activeJobId,
        command,
        format_mode: isContinuous4Section ? 'CONTINUOUS_4SECTION' : 'SPLIT_PERIODS',
        lesson_code: lessonCode || 'DANH_MUC_GDPT2018',
        khdh_draft: markdownSummary,
        token_usage: { inputTokens: 500, outputTokens: 1200, totalTokens: 1700 },
        model: 'Gemini (Catalog Extractor)',
        duration_ms: 1200,
        key_used: keyUsed,
        sources_used: activeDocs.map((d) => ({ id: d.id, name: d.displayName, type: d.documentType, version: d.version })),
        source_readiness: SourceContextBuilder.checkReadiness(activeDocs),
      });
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

    // 2. Đọc file kỹ năng / form mẫu tương ứng
    let skillContent = '';
    try {
      const v11FormPath = join(process.cwd(), '03_FORM_KHDH_V11_2_4PHAN_KHONG_TACHTIET.MD');
      skillContent = await readFile(v11FormPath, 'utf-8');
    } catch {
      skillContent = 'Soạn KHDH V11-2 FINAL 4 phần A-B-C-D không tách tiết, bảng 2 cột CV 5512.';
    }

    // Cấu hình prompt chuyên biệt cho từng Stage
    let stageInstructions = '';
    let stageUserRequirement = '';

    if (effectiveStage === 'STAGE_1_MUC_TIEU_KHOI_DONG') {
      stageInstructions = [
        '### NHIỆM VỤ GIAI ĐOẠN 1 (PHẦN ĐẦU + MỤC TIÊU + THIẾT BỊ + A. KHỞI ĐỘNG):',
        'Bắt buộc xuất hoàn chỉnh các phần sau (KHÔNG xuất phần B, C, D):',
        '1. TIÊU ĐỀ & PHẦN ĐẦU KHDH (Trường, Tổ, Giáo viên, Tên bài, Lớp, Thời lượng, PPCT, Tuần).',
        '2. # I. MỤC TIÊU (Đầy đủ: ## 1. Kiến thức - danh từ/cụm từ ngắn gọn; ## 2. Năng lực - hành động quan sát được; ## 3. Phẩm chất - hành vi cụ thể).',
        '3. # II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU (## 1. Giáo viên, ## 2. Học sinh).',
        '4. # III. TIẾN TRÌNH DẠY HỌC',
        '5. ## A. HOẠT ĐỘNG KHỞI ĐỘNG (Đầy đủ 4 bước a) Mục tiêu, b) Nội dung bài toán/tình huống thực tế mở đầu, c) Sản phẩm câu trả lời, d) Tổ chức thực hiện bảng 2 cột: HOẠT ĐỘNG CỦA GV VÀ HS | SẢN PHẨM DỰ KIẾN kèm Prompt tạo ảnh nếu có).',
      ].join('\n');
      stageUserRequirement = 'Soạn hoàn chỉnh Giai đoạn 1: Phần đầu -> # I. MỤC TIÊU -> # II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU -> # III. TIẾN TRÌNH DẠY HỌC -> ## A. HOẠT ĐỘNG KHỞI ĐỘNG.';
    } else if (effectiveStage === 'STAGE_2_HINH_THANH_KT') {
      stageInstructions = [
        '### NHIỆM VỤ GIAI ĐOẠN 2 (B. HOẠT ĐỘNG HÌNH THÀNH KIẾN THỨC MỚI - CHUYÊN SÂU & CHI TIẾT):',
        'Tập trung 100% dung lượng soạn cực kỳ chi tiết, không rút gọn cho phần B:',
        '1. Bắt đầu trực tiếp bằng: ## B. HOẠT ĐỘNG HÌNH THÀNH KIẾN THỨC MỚI',
        '2. Phân chia rõ từng Hoạt động cụ thể (Hoạt động 1, Hoạt động 2, ... tương ứng các đơn vị kiến thức cốt lõi của bài học).',
        '3. Mỗi hoạt động có đầy đủ 4 phần chuẩn CV 5512: a) Mục tiêu, b) Nội dung, c) Sản phẩm (định nghĩa, công thức, ví dụ giải mẫu chi tiết), d) Tổ chức thực hiện (Bước 1: Chuyển giao, Bước 2: Thực hiện, Bước 3: Báo cáo thảo luận, Bước 4: Kết luận nhận định) trong BẢNG 2 CỘT chuẩn.',
        '4. Chèn mã TikZ / Overleaf cho các hình vẽ hình học chính xác và PROMPT TẠO ẢNH cho các hình ảnh minh họa thực tế.',
      ].join('\n');
      stageUserRequirement = 'Soạn hoàn chỉnh Giai đoạn 2: ## B. HOẠT ĐỘNG HÌNH THÀNH KIẾN THỨC MỚI với đầy đủ các hoạt động thành phần, chi tiết sâu, bảng 2 cột, công thức LaTeX và mã TikZ/Prompt ảnh.';
    } else if (effectiveStage === 'STAGE_3_LUYEN_TAP') {
      stageInstructions = [
        '### NHIỆM VỤ GIAI ĐOẠN 3 (C. HOẠT ĐỘNG LUYỆN TẬP - HỆ THỐNG BÀI TẬP PHÂN HÓA):',
        'Tập trung 100% dung lượng soạn bài bản, đầy đủ hệ thống bài tập cho phần C:',
        '1. Bắt đầu trực tiếp bằng: ## C. HOẠT ĐỘNG LUYỆN TẬP',
        '2. Có đầy đủ a) Mục tiêu củng cố kiến thức và rèn luyện kỹ năng, b) Nội dung (Gồm cả bài tập trắc nghiệm củng cố và hệ thống bài tập tự luận phân hóa từ mức độ Nhận biết -> Thông hiểu -> Vận dụng), c) Sản phẩm (Lời giải chi tiết, đáp án mẫu từng bài), d) Tổ chức thực hiện (Giao nhiệm vụ, hoạt động cá nhân/nhóm, báo cáo, đánh giá nhận xét) trong BẢNG 2 CỘT.',
      ].join('\n');
      stageUserRequirement = 'Soạn hoàn chỉnh Giai đoạn 3: ## C. HOẠT ĐỘNG LUYỆN TẬP với hệ thống bài tập phong phú, lời giải chi tiết và bảng 2 cột chuẩn 5512.';
    } else if (effectiveStage === 'STAGE_4_VAN_DUNG_HUONG_DAN') {
      stageInstructions = [
        '### NHIỆM VỤ GIAI ĐOẠN 4 (D. HOẠT ĐỘNG VẬN DỤNG + IV. HƯỚNG DẪN VỀ NHÀ):',
        '1. ## D. HOẠT ĐỘNG VẬN DỤNG: a) Mục tiêu vận dụng vào thực tiễn/liên môn, b) Nội dung bài toán thực tế/dự án nhỏ, c) Sản phẩm giải quyết vấn đề, d) Tổ chức thực hiện bảng 2 cột.',
        '2. # IV. HƯỚNG DẪN VỀ NHÀ: Nội dung ôn tập, bài tập về nhà trong SGK/SBT, chuẩn bị cho bài học tiếp theo.',
      ].join('\n');
      stageUserRequirement = 'Soạn hoàn chỉnh Giai đoạn 4: ## D. HOẠT ĐỘNG VẬN DỤNG và # IV. HƯỚNG DẪN VỀ NHÀ.';
    }

    // Xây dựng System Prompt
    const systemPrompt = isContinuous4Section
      ? [
          'Bạn là KhdhBuilderAgent V11-2 FINAL — Chế độ SOẠN KHDH 4 PHẦN LIỀN MẠCH, KHÔNG TÁCH TIẾT (Theo Form 03_FORM_KHDH_V11_2_4PHAN_KHONG_TACHTIET.MD).',
          `Trường: ${env.SCHOOL_NAME}`,
          `Tổ chuyên môn: ${env.DEPARTMENT}`,
          `Giáo viên thực hiện: ${env.TEACHER_NAME}`,
          '',
          '## QUY TẮC BẮT BUỘC:',
          '1. Tiến trình dạy học CHỈ DÙNG ĐÚNG 2 CỘT: HOẠT ĐỘNG CỦA GV VÀ HS | SẢN PHẨM DỰ KIẾN.',
          '2. Mỗi hoạt động có đủ 4 phần: a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện (Bước 1, 2, 3, 4).',
          '3. Công thức toán dùng chuẩn LaTeX $...$ hoặc $$...$$.',
          '4. Hình học chính xác dùng mã TikZ / Overleaf; ảnh minh họa thực tế dùng PROMPT TẠO ẢNH.',
          '5. TUYỆT ĐỐI KHÔNG xuất JSON metadata, code fence markdown ở ngoài.',
          '',
          stageInstructions,
          '',
          lockedConfigSection,
          '',
          sourceContextText,
          '',
          '## HƯỚNG DẪN CẤU TRÚC FORM CHUẨN:',
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
          '2. Tiến trình dạy học CHỈ DÙNG ĐÚNG 2 CỘT: HOẠT ĐỘNG CỦA GV VÀ HS | SẢN PHẨM DỰ KIẾN.',
          '3. Mỗi hoạt động có đủ 4 phần: a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện.',
          '4. Công thức toán dùng chuẩn LaTeX $...$ hoặc $$...$$.',
          '',
          stageInstructions,
          '',
          lockedConfigSection,
          '',
          sourceContextText,
        ].join('\n');

    const userMessage = [
      `LỆNH THỰC THI: ${command} ${lessonCode || ''}`,
      `GIAI ĐOẠN SOẠN (STAGE): ${effectiveStage}`,
      `CHẾ ĐỘ SOẠN: ${isContinuous4Section ? 'V11 FINAL - 4 PHẦN A-B-C-D' : 'V10.1 - TÁCH TIẾT'}`,
      `MÃ BÀI HỌC: ${lockedConfig?.lessonTitle || lessonCode || 'TỰ ĐỘNG'}`,
      `MÃ CÔNG VIỆC: ${activeJobId}`,
      lockedConfigSection,
      '',
      stageUserRequirement || (
        isContinuous4Section
          ? 'Hãy thực thi lệnh và tạo bản Kế hoạch bài dạy hoàn chỉnh theo đúng FORM V11-2. BẮT BUỘC XUẤT ĐẦY ĐỦ TỪ: Phần đầu KHDH -> # I. MỤC TIÊU -> # II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU -> # III. TIẾN TRÌNH DẠY HỌC (A, B, C, D bảng 2 cột) -> # IV. HƯỚNG DẪN VỀ NHÀ.'
          : 'Hãy thực thi lệnh và tạo bản Kế hoạch bài dạy hoàn chỉnh, chi tiết theo đúng định dạng Tách tiết V10.1.'
      ),
    ].join('\n');

    const result = await GeminiService.generateContent({
      apiKeys: keyPool,
      systemPrompt,
      userMessage,
      model: 'pro',
      maxTokens: 8192,
    });

    const cleanDraft = ContentNormalizer.cleanMetadata(result.text);

    return NextResponse.json({
      status: 'OK',
      job_id: activeJobId,
      command,
      section_stage: effectiveStage,
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
