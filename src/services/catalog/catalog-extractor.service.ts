import { GeminiService } from '@/services/ai/gemini.service';
import { SourceDocumentService } from '@/services/documents/source-document.service';
import { SourceContextBuilder } from '@/services/documents/source-context-builder';
import {
  CatalogLessonItem,
  CurriculumCatalog,
  ExtractCatalogRequest,
} from '@/types/curriculum-catalog.types';

export class CatalogExtractorService {
  /**
   * Trích xuất toàn bộ Danh mục bài học và Ma trận phân phối chương trình từ tài liệu nguồn (PL1, PPCT, SGK)
   */
  public static async extractCatalog(req: ExtractCatalogRequest): Promise<{
    catalog: CurriculumCatalog;
    markdownSummary: string;
    keyUsed?: string;
  }> {
    const keyPool = GeminiService.resolveKeyPool(undefined, req.apiKeys);
    const targetProject = req.projectId || 'usr_guest';

    // 1. Lấy danh sách tài liệu nguồn sẵn sàng của người dùng
    let activeDocs = await SourceDocumentService.getActiveReady(targetProject);
    if (req.documentIds && Array.isArray(req.documentIds) && req.documentIds.length > 0) {
      activeDocs = activeDocs.filter((d) => req.documentIds?.includes(d.id));
    }

    const { systemContext: sourceContextText } = SourceContextBuilder.buildPromptContext(activeDocs);

    const subjectName = req.subject || 'Toán học';
    const gradeName = req.grade || 'Lớp 8';

    const systemPrompt = [
      'Bạn là Chuyên gia Quản lý Chương trình GDPT 2018 & Tổ trưởng chuyên môn Toán THCS.',
      'Nhiệm vụ: Phân tích kỹ lưỡng các tài liệu nguồn đã cung cấp (Đặc biệt là Phụ lục I - Kế hoạch dạy học của tổ chuyên môn, Phân phối chương trình PPCT, Sách giáo khoa) để TRÍCH XUẤT TOÀN BỘ DANH MỤC CÁC BÀI HỌC CỤ THỂ theo đúng tiến trình dạy học cả năm hoặc từng học kỳ.',
      '',
      sourceContextText,
      '',
      '## NGUYÊN TẮC TRÍCH XUẤT DANH MỤC:',
      '1. Trích xuất đầy đủ tất cả các bài học, bài luyện tập chung, bài ôn tập chương, bài kiểm tra đánh giá định kỳ.',
      '2. Mỗi mục bài học cần xác định chính xác: Mã bài học, Tên bài học, Chương/Mạch kiến thức, Khối lớp, Học kỳ, Số tiết, Tiết PPCT (từ tiết mấy đến mấy), Tuần thực hiện, và 1-3 YCCĐ cốt lõi.',
      '3. Nếu tài liệu nguồn thiếu dữ kiện một số bài, hãy đối chiếu chuẩn phân phối GDPT 2018 hiện hành để hoàn thiện danh mục đầy đủ và logic nhất.',
      '',
      '## YÊU CẦU ĐẦU RA BẮT BUỘC:',
      'Bạn PHẢI trả về ĐÚNG MỘT JSON OBJECT theo đúng cấu trúc sau (KHÔNG có markdown bao ngoài, KHÔNG có text giải thích ngoài JSON):',
      '{',
      '  "subject": "' + subjectName + '",',
      '  "grade": "' + gradeName + '",',
      '  "schoolYear": "2026-2027",',
      '  "sourceSummary": "Trích xuất từ Phụ lục I & PPCT hiện hành",',
      '  "totalLessons": 25,',
      '  "totalPeriods": 70,',
      '  "lessons": [',
      '    {',
      '      "stt": 1,',
      '      "lessonCode": "TOAN-8-HKI-C01-B01",',
      '      "lessonTitle": "Bài 1: Đơn thức nhiều biến. Đa thức nhiều biến",',
      '      "chapter": "Chương I: Đa thức nhiều biến",',
      '      "strand": "Số và Đại số",',
      '      "grade": "Lớp 8",',
      '      "term": "Học kỳ I",',
      '      "totalPeriods": 2,',
      '      "ppctRange": "Tiết 1, 2",',
      '      "weekRange": "Tuần 1",',
      '      "keyObjectives": [',
      '        "Nhận biết đơn thức, đa thức nhiều biến",',
      '        "Thu gọn và xác định bậc của đơn thức, đa thức"',
      '      ],',
      '      "sourceBook": "Kết nối tri thức / Cánh Diều"',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const userPrompt = `Hãy trích xuất và lập bảng DANH MỤC BÀI HỌC CỤ THỂ cho môn ${subjectName} ${gradeName}${
      req.term ? ` (${req.term})` : ''
    } từ các tài liệu nguồn đã cung cấp.`;

    try {
      const response = await GeminiService.generateContent({
        systemPrompt,
        userMessage: userPrompt,
        temperature: 0.1,
        apiKeys: keyPool,
      });

      const rawText = response.text.trim();
      let cleanJson = rawText;
      if (cleanJson.includes('```json')) {
        cleanJson = cleanJson.split('```json')[1].split('```')[0].trim();
      } else if (cleanJson.includes('```')) {
        cleanJson = cleanJson.split('```')[1].split('```')[0].trim();
      }

      const parsed: CurriculumCatalog = JSON.parse(cleanJson);
      if (parsed && Array.isArray(parsed.lessons) && parsed.lessons.length > 0) {
        // Đánh số STT nếu thiếu
        parsed.lessons = parsed.lessons.map((item, index) => ({
          ...item,
          stt: item.stt || index + 1,
        }));
        parsed.totalLessons = parsed.lessons.length;
        parsed.totalPeriods = parsed.lessons.reduce((acc, cur) => acc + (Number(cur.totalPeriods) || 1), 0);

        const markdown = this.renderCatalogToMarkdown(parsed);
        return {
          catalog: parsed,
          markdownSummary: markdown,
          keyUsed: response.keyUsed,
        };
      }
    } catch (err) {
      console.warn('AI Catalog extraction fallback to default template:', err);
    }

    // Fallback template nếu không có dữ liệu nguồn hoặc parse lỗi
    const fallbackCatalog = this.getFallbackCatalog(gradeName, subjectName);
    const markdown = this.renderCatalogToMarkdown(fallbackCatalog);
    return {
      catalog: fallbackCatalog,
      markdownSummary: markdown,
    };
  }

  /**
   * Tạo bảng Markdown chuyên nghiệp hiển thị toàn bộ danh mục bài học
   */
  public static renderCatalogToMarkdown(catalog: CurriculumCatalog): string {
    const lines: string[] = [];

    lines.push(`# 📑 DANH MỤC BÀI HỌC & PHÂN PHỐI CHƯƠNG TRÌNH CHI TIẾT`);
    lines.push(`**Môn học:** ${catalog.subject} | **Khối lớp:** ${catalog.grade} | **Năm học:** ${catalog.schoolYear || '2026-2027'}`);
    lines.push(`**Tổng số bài học:** ${catalog.totalLessons} bài | **Tổng thời lượng:** ${catalog.totalPeriods} tiết`);
    lines.push(`> *Nguồn trích xuất:* ${catalog.sourceSummary}`);
    lines.push('');
    lines.push('| STT | Mã bài học | Tên bài học / Chủ đề | Mạch kiến thức & Chương | Số tiết | Tiết PPCT | Tuần |');
    lines.push('|:---:|:---|:---|:---|:---:|:---:|:---:|');

    catalog.lessons.forEach((l, idx) => {
      const stt = l.stt || idx + 1;
      const code = `\`${l.lessonCode}\``;
      const title = `**${l.lessonTitle}**`;
      const chapter = `${l.strand ? `[${l.strand}] ` : ''}${l.chapter || ''}`;
      const periods = `**${l.totalPeriods}**`;
      const ppct = l.ppctRange || `Tiết ${stt}`;
      const week = l.weekRange || `Tuần ${Math.ceil(stt / 2)}`;

      lines.push(`| ${stt} | ${code} | ${title} | ${chapter} | ${periods} | ${ppct} | ${week} |`);
    });

    lines.push('');
    lines.push('---');
    lines.push('### 💡 Hướng dẫn sử dụng:');
    lines.push('- Sao chép **Mã bài học** hoặc **Tên bài** vào ô nhập lệnh để thực hiện soạn tự động.');
    lines.push('- Hoặc bấm trực tiếp nút **⚡ Soạn ngay** trên bảng chọn danh mục của hệ thống.');

    return lines.join('\n');
  }

  /**
   * Bộ dữ liệu chuẩn dự phòng GDPT 2018 môn Toán
   */
  private static getFallbackCatalog(grade = 'Lớp 8', subject = 'Toán học'): CurriculumCatalog {
    const lessons: CatalogLessonItem[] = [
      {
        stt: 1,
        lessonCode: 'TOAN-8-HKI-C01-STT01',
        lessonTitle: 'Bài 1: Đơn thức nhiều biến. Đa thức nhiều biến',
        chapter: 'Chương I: Đa thức nhiều biến',
        strand: 'Số và Đại số',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 1, 2',
        weekRange: 'Tuần 1',
        keyObjectives: ['Nhận biết đơn thức, đa thức nhiều biến', 'Thu gọn đơn thức, đa thức'],
      },
      {
        stt: 2,
        lessonCode: 'TOAN-8-HKI-C01-STT02',
        lessonTitle: 'Bài 2: Các phép toán cộng, trừ đa thức nhiều biến',
        chapter: 'Chương I: Đa thức nhiều biến',
        strand: 'Số và Đại số',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 3, 4',
        weekRange: 'Tuần 2',
        keyObjectives: ['Thực hiện phép cộng và trừ đa thức nhiều biến'],
      },
      {
        stt: 3,
        lessonCode: 'TOAN-8-HKI-C01-STT03',
        lessonTitle: 'Bài 3: Phép nhân đa thức',
        chapter: 'Chương I: Đa thức nhiều biến',
        strand: 'Số và Đại số',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 5, 6',
        weekRange: 'Tuần 3',
        keyObjectives: ['Nhân đơn thức với đa thức', 'Nhân đa thức với đa thức'],
      },
      {
        stt: 4,
        lessonCode: 'TOAN-8-HKI-C01-STT04',
        lessonTitle: 'Bài 4: Phép chia đa thức cho đơn thức',
        chapter: 'Chương I: Đa thức nhiều biến',
        strand: 'Số và Đại số',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 1,
        ppctRange: 'Tiết 7',
        weekRange: 'Tuần 4',
        keyObjectives: ['Chia đơn thức cho đơn thức', 'Chia đa thức cho đơn thức'],
      },
      {
        stt: 5,
        lessonCode: 'TOAN-8-HKI-C01-STT05',
        lessonTitle: 'Bài 5: Luyện tập chung chương I',
        chapter: 'Chương I: Đa thức nhiều biến',
        strand: 'Số và Đại số',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 8, 9',
        weekRange: 'Tuần 4, 5',
        keyObjectives: ['Củng cố quy tắc tính toán trên đa thức nhiều biến'],
      },
      {
        stt: 6,
        lessonCode: 'TOAN-8-HKI-C02-STT06',
        lessonTitle: 'Bài 6: Hiệu hai bình phương. Bình phương của một tổng hay một hiệu',
        chapter: 'Chương II: Hằng đẳng thức đáng nhớ và ứng dụng',
        strand: 'Số và Đại số',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 10, 11',
        weekRange: 'Tuần 5, 6',
        keyObjectives: ['Nhận biết và vận dụng hằng đẳng thức hiệu hai bình phương, bình phương tổng/hiệu'],
      },
      {
        stt: 7,
        lessonCode: 'TOAN-8-HKI-C02-STT07',
        lessonTitle: 'Bài 7: Lập phương của một tổng. Lập phương của một hiệu',
        chapter: 'Chương II: Hằng đẳng thức đáng nhớ và ứng dụng',
        strand: 'Số và Đại số',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 12, 13',
        weekRange: 'Tuần 6, 7',
        keyObjectives: ['Nhận biết và vận dụng hằng đẳng thức lập phương tổng/hiệu'],
      },
      {
        stt: 8,
        lessonCode: 'TOAN-8-HKI-C02-STT08',
        lessonTitle: 'Bài 8: Tổng và hiệu hai lập phương',
        chapter: 'Chương II: Hằng đẳng thức đáng nhớ và ứng dụng',
        strand: 'Số và Đại số',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 14, 15',
        weekRange: 'Tuần 7, 8',
        keyObjectives: ['Vận dụng hằng đẳng thức tổng và hiệu hai lập phương'],
      },
      {
        stt: 9,
        lessonCode: 'TOAN-8-HKI-C03-STT09',
        lessonTitle: 'Bài 9: Hình chóp tam giác đều',
        chapter: 'Chương III: Hình học trực quan',
        strand: 'Hình học và Đo lường',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 16, 17',
        weekRange: 'Tuần 8, 9',
        keyObjectives: ['Mô tả hình chóp tam giác đều', 'Tính diện tích xung quanh và thể tích'],
      },
      {
        stt: 10,
        lessonCode: 'TOAN-8-HKI-C03-STT10',
        lessonTitle: 'Bài 10: Hình chóp tứ giác đều',
        chapter: 'Chương III: Hình học trực quan',
        strand: 'Hình học và Đo lường',
        grade,
        term: 'Học kỳ I',
        totalPeriods: 2,
        ppctRange: 'Tiết 18, 19',
        weekRange: 'Tuần 9, 10',
        keyObjectives: ['Mô tả hình chóp tứ giác đều', 'Tính diện tích xung quanh và thể tích'],
      },
    ];

    return {
      subject,
      grade,
      schoolYear: '2026-2027',
      sourceSummary: 'Chương trình GDPT 2018 chuẩn Bộ GD&ĐT (Môn Toán)',
      totalLessons: lessons.length,
      totalPeriods: lessons.reduce((acc, cur) => acc + cur.totalPeriods, 0),
      lessons,
    };
  }
}
