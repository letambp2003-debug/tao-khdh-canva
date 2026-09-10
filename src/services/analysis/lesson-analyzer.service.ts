import { GeminiService } from '@/services/ai/gemini.service';
import { SourceDocumentService } from '@/services/documents/source-document.service';
import { SourceContextBuilder } from '@/services/documents/source-context-builder';
import {
  AnalyzeLessonRequest,
  LessonRequirementAnalysis,
} from '@/types/lesson-analysis.types';

export class LessonAnalyzerService {
  /**
   * Phân tích mã bài học / tham số kết hợp với tài liệu nguồn (PL1, PPCT, SGK)
   * Trích xuất các YCCĐ, số tiết, tiến trình để giáo viên cố định cấu hình trước khi soạn.
   */
  public static async analyzeLesson(req: AnalyzeLessonRequest): Promise<{
    analysis: LessonRequirementAnalysis;
    keyUsed?: string;
  }> {
    const keyPool = GeminiService.resolveKeyPool(undefined, req.apiKeys);
    const targetProject = req.projectId || 'default';

    // Lấy tài liệu nguồn sẵn sàng
    let activeDocs = await SourceDocumentService.getActiveReady(targetProject);
    if (req.documentIds && Array.isArray(req.documentIds) && req.documentIds.length > 0) {
      activeDocs = activeDocs.filter((d) => req.documentIds?.includes(d.id));
    }

    const { systemContext: sourceContextText } = SourceContextBuilder.buildPromptContext(activeDocs);

    const systemPrompt = [
      'Bạn là Chuyên viên Phân tích Sư phạm & Thẩm định Chương trình GDPT 2018 (Toán học).',
      'Nhiệm vụ: Phân tích Mã bài học hoặc Tên bài/Yêu cầu của giáo viên, tra cứu và đối chiếu với Tài liệu nguồn (Phụ lục I, PPCT, SGK) để trích xuất CẤU HÌNH YÊU CẦU BÀI HỌC CHUẨN.',
      '',
      sourceContextText,
      '',
      '## YÊU CẦU ĐẦU RA JSON BẮT BUỘC:',
      'Bạn PHẢI trả về ĐÚNG MỘT JSON OBJECT theo đúng cấu trúc sau (KHÔNG có markdown bao ngoài, KHÔNG có text giải thích ngoài JSON):',
      '{',
      '  "lessonTitle": "Tên bài học chuẩn (Ví dụ: Bài 1: Đơn thức và đa thức nhiều biến)",',
      '  "lessonCode": "' + (req.lessonCode || 'TOAN-8') + '",',
      '  "subject": "Toán học",',
      '  "grade": "Lớp 8",',
      '  "term": "Học kỳ I",',
      '  "totalPeriods": 2,',
      '  "periodBreakdown": [',
      '    "Tiết 1: Đơn thức nhiều biến và thu gọn đơn thức",',
      '    "Tiết 2: Đa thức nhiều biến và cộng trừ đa thức"',
      '  ],',
      '  "objectives": {',
      '    "knowledge": [',
      '      "Nhận biết được đơn thức, đa thức nhiều biến",',
      '      "Nhận biết được đơn thức đồng dạng và bậc của đơn thức"',
      '    ],',
      '    "competencies": [',
      '      "Năng lực tư duy và lập luận toán học",',
      '      "Năng lực giải quyết vấn đề toán học",',
      '      "Năng lực mô hình hóa toán học thông qua các bài toán thực tế"',
      '    ],',
      '    "qualities": [',
      '      "Chăm chỉ, tích cực tham gia hoạt động nhóm",',
      '      "Trách nhiệm, cẩn thận và chính xác trong tính toán"',
      '    ]',
      '  },',
      '  "keyConcepts": [',
      '    "Đơn thức nhiều biến",',
      '    "Bậc của đơn thức",',
      '    "Đơn thức đồng dạng",',
      '    "Đa thức nhiều biến"',
      '  ],',
      '  "pedagogicalMethods": [',
      '    "Dạy học khám phá và phát hiện vấn đề",',
      '    "Trực quan hóa hình học và đại số",',
      '    "Thảo luận nhóm & Khăn trải bàn"',
      '  ],',
      '  "selectedOutputs": {',
      '    "khdhDraft": true,',
      '    "worksheet": true,',
      '    "game": true,',
      '    "videoStoryboard": true,',
      '    "canvaSlides": true',
      '  },',
      '  "customNotes": "Bám sát định dạng 2 cột theo CV 5512 và chuẩn OMML"',
      '}',
    ].join('\n');

    const userMessage = [
      'MÃ BÀI HỌC / THAM SỐ ĐẦU VÀO TỪ GIÁO VIÊN: ' + (req.lessonCode || 'Chưa nhập'),
      'LỆNH QUY ĐỊNH: ' + (req.command || 'SOAN_XUAT'),
      'Hãy phân tích sâu sắc các yêu cầu bài học và trả về JSON chuẩn xác.',
    ].join('\n');

    let analysis: LessonRequirementAnalysis;
    let keyUsed: string | undefined;

    try {
      const result = await GeminiService.generateContent({
        apiKeys: keyPool,
        systemPrompt,
        userMessage,
        model: 'flash',
      });
      keyUsed = result.keyUsed;

      let cleanText = result.text.trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
      analysis = JSON.parse(cleanText);
    } catch {
      analysis = LessonAnalyzerService.buildFallbackAnalysis(req.lessonCode || 'TOAN-8-HKI-SODAISO-C01-STT01');
    }

    return {
      analysis,
      keyUsed,
    };
  }

  /**
   * Tạo bản phân tích dự phòng chuẩn mực
   */
  public static buildFallbackAnalysis(lessonInput: string): LessonRequirementAnalysis {
    let title = 'Bài 1: Đơn thức và đa thức nhiều biến';
    let grade = 'Lớp 8';
    let term = 'Học kỳ I';
    let periods = 2;

    if (lessonInput.toLowerCase().includes('7') || lessonInput.includes('-7-')) {
      grade = 'Lớp 7';
    } else if (lessonInput.toLowerCase().includes('6') || lessonInput.includes('-6-')) {
      grade = 'Lớp 6';
    } else if (lessonInput.toLowerCase().includes('9') || lessonInput.includes('-9-')) {
      grade = 'Lớp 9';
    }

    if (lessonInput.toLowerCase().includes('hkii') || lessonInput.toLowerCase().includes('hk2')) {
      term = 'Học kỳ II';
    }

    if (lessonInput.length > 5 && !lessonInput.startsWith('TOAN-')) {
      title = lessonInput;
    }

    return {
      lessonTitle: title,
      lessonCode: lessonInput,
      subject: 'Toán học',
      grade,
      term,
      totalPeriods: periods,
      periodBreakdown: [
        'Tiết 1: Đơn thức nhiều biến, đơn thức thu gọn và bậc của đơn thức',
        'Tiết 2: Đa thức nhiều biến, thu gọn đa thức và ứng dụng thực tế',
      ],
      objectives: {
        knowledge: [
          'Nhận biết được đơn thức, đa thức nhiều biến qua các ví dụ cụ thể.',
          'Biết cách xác định hệ số, phần biến và bậc của một đơn thức.',
          'Thực hiện thành thạo phép thu gọn đơn thức và đa thức đồng dạng.',
        ],
        competencies: [
          'Năng lực tư duy và lập luận toán học thông qua phân biệt đơn thức và đa thức.',
          'Năng lực giải quyết vấn đề toán học khi áp dụng biểu thức tính diện tích, thể tích thực tế.',
          'Năng lực giao tiếp toán học khi trình bày lời giải và thảo luận nhóm.',
        ],
        qualities: [
          'Chăm chỉ: Tích cực tìm tòi, hoàn thành phiếu học tập cá nhân.',
          'Trách nhiệm: Hợp tác nghiêm túc trong hoạt động nhóm và trò chơi tương tác.',
        ],
      },
      keyConcepts: [
        'Khái niệm đơn thức nhiều biến',
        'Hệ số, phần biến và bậc của đơn thức',
        'Đơn thức đồng dạng và quy tắc cộng/trừ',
        'Đa thức nhiều biến và thu gọn đa thức',
      ],
      pedagogicalMethods: [
        'Phương pháp dạy học khám phá (Gợi mở - Vấn đáp)',
        'Phương pháp trực quan hóa (Hình ảnh, đồ họa 3D, mô hình)',
        'Phương pháp thảo luận nhóm kết hợp Phiếu học tập phân hóa',
      ],
      selectedOutputs: {
        khdhDraft: true,
        worksheet: true,
        game: true,
        videoStoryboard: true,
        canvaSlides: true,
      },
      customNotes: 'Tuân thủ nghiêm ngặt tiến trình 2 cột Công văn 5512 và chuẩn OMML Microsoft Word.',
      isLocked: false,
    };
  }
}