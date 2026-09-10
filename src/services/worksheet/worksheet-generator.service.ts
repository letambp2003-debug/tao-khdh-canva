import { GeminiService } from '@/services/ai/gemini.service';
import { ContentNormalizer } from '@/services/export/content-normalizer';
import { WorksheetData, GenerateWorksheetRequest } from '@/types/worksheet.types';
import { getEnv } from '@/config/env';

export class WorksheetGeneratorService {
  /**
   * Tạo Phiếu học tập phân hóa từ Bản thảo KHDH
   */
  public static async generateFromKhdh(req: GenerateWorksheetRequest): Promise<{
    worksheet: WorksheetData;
    markdown: string;
    keyUsed?: string;
    tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  }> {
    const env = getEnv();
    const keyPool = GeminiService.resolveKeyPool(undefined, req.apiKeys);

    const systemPrompt = [
      'Bạn là Chuyên gia Khảo thí & Sư phạm Toán học V10.1 FINAL.',
      'Nhiệm vụ của bạn là đọc Bản thảo Kế hoạch bài dạy (KHDH) được cung cấp và tạo ra một PHIẾU HỌC TẬP PHÂN HÓA 3 MỨC ĐỘ hoàn chỉnh, chuẩn sư phạm, sẵn sàng in cho học sinh.',
      '',
      '## NGUYÊN TẮC BẮT BUỘC:',
      '1. Bám sát 100% kiến thức, thuật ngữ, công thức và dữ kiện từ KHDH.',
      '2. Mọi công thức toán học PHẢI được viết chuẩn cú pháp LaTeX trong cặp dấu $...$ (inline) hoặc $$...$$ (display).',
      '3. Cấu trúc Phiếu học tập bắt buộc gồm 3 phần:',
      '   - KHUNG THÔNG TIN: Trường, Lớp, Họ và tên học sinh, Nhóm, Thời gian làm bài.',
      '   - PHẦN I: KIẾN THỨC TRỌNG TÂM CẦN NHỚ (Tóm tắt ngắn gọn 3-5 gạch đầu dòng các công thức/định nghĩa cốt lõi nhất).',
      '   - PHẦN II: BÀI TẬP LUYỆN TẬP PHÂN HÓA 3 MỨC ĐỘ:',
      '     * ★ MỨC 1 (Nhận biết - Thông hiểu): 2-3 câu trắc nghiệm 4 lựa chọn (A, B, C, D) hoặc điền khuyết công thức.',
      '     * ★★ MỨC 2 (Vận dụng): 2 bài toán tính toán / chứng minh / rút gọn có yêu cầu trình bày lời giải chi tiết (để sẵn khoảng trống làm bài).',
      '     * ★★★ MỨC 3 (Vận dụng cao / Thực tế): 1 bài toán mở hoặc bài toán mô hình hóa thực tiễn liên hệ đời sống.',
      '   - PHẦN III: GÓC TỰ ĐÁNH GIÁ (Bảng Rubric mức độ hoàn thành bài học: Đã hiểu & Tự tin / Cần luyện tập thêm / Cần GV hướng dẫn lại).',
      '4. TUYỆT ĐỐI KHÔNG xuất JSON envelope, không chèn metadata chatbot râu ria ở đầu.',
      '5. Bắt đầu trực tiếp bằng: # PHIẾU HỌC TẬP: [TÊN BÀI HỌC]',
    ].join('\n');

    const userMessage = [
      `MÃ BÀI HỌC: ${req.lessonCode || 'TOÁN BÀI TẬP'}`,
      'DƯỚI ĐÂY LÀ BẢN THẢO KHDH ĐỂ BÓC TÁCH NỘI DUNG:',
      '----------------------------------------',
      req.khdhDraft,
      '----------------------------------------',
      'Hãy phân tích KHDH trên và tạo Phiếu học tập phân hóa 3 mức độ chất lượng cao nhất.',
    ].join('\n');

    const result = await GeminiService.generateContent({
      apiKeys: keyPool,
      systemPrompt,
      userMessage,
      model: 'flash',
    });

    const cleanMarkdown = ContentNormalizer.normalize(result.text);

    // Xây dựng cấu trúc WorksheetData
    const worksheetData: WorksheetData = {
      schoolName: env.SCHOOL_NAME,
      department: env.DEPARTMENT,
      worksheetTitle: `PHIẾU HỌC TẬP: ${req.lessonCode || 'BÀI HỌC'}`,
      lessonCode: req.lessonCode || 'TOAN-8',
      grade: 'Lớp 8',
      subject: 'Toán học',
      durationMinutes: 20,
      coreKnowledgeBox: this.extractCoreKnowledge(cleanMarkdown),
      sections: [],
      rubricEvaluation: [
        {
          criteria: 'Mức độ nắm vững kiến thức & công thức',
          levels: ['🌟 Tự tin giải đúng', '👍 Hiểu cơ bản', '⚠️ Cần thầy cô giảng lại'],
        },
        {
          criteria: 'Mức độ hoàn thành các bài tập',
          levels: ['Hoàn thành 100%', 'Hoàn thành Mức 1 & 2', 'Chỉ hoàn thành Mức 1'],
        },
      ],
      markdownContent: cleanMarkdown,
    };

    return {
      worksheet: worksheetData,
      markdown: cleanMarkdown,
      keyUsed: result.keyUsed,
      tokenUsage: result.usage,
    };
  }

  private static extractCoreKnowledge(markdown: string): string[] {
    const lines = markdown.split('\n');
    const items: string[] = [];
    let inSection = false;

    for (const line of lines) {
      if (line.includes('KIẾN THỨC TRỌNG TÂM') || line.includes('KIẾN THỨC CẦN NHỚ')) {
        inSection = true;
        continue;
      }
      if (inSection && line.startsWith('## ')) {
        break;
      }
      if (inSection && (line.trim().startsWith('-') || line.trim().startsWith('*'))) {
        items.push(line.trim().replace(/^[-*]\s*/, ''));
      }
    }

    if (items.length === 0) {
      items.push('Nắm vững các khái niệm, định nghĩa và tính chất cơ bản trong bài học.');
      items.push('Vận dụng đúng quy tắc và công thức toán học vào bài tập tính toán.');
      items.push('Rèn luyện kỹ năng trình bày logic và giải quyết bài toán thực tiễn.');
    }

    return items;
  }
}
