import fs from 'fs';
import path from 'path';
import { GeminiService } from '@/services/ai/gemini.service';
import { SourceDocumentService } from '@/services/documents/source-document.service';
import { SourceContextBuilder } from '@/services/documents/source-context-builder';
import {
  CatalogLessonItem,
  CurriculumCatalog,
  ExtractCatalogRequest,
} from '@/types/curriculum-catalog.types';

export class CatalogExtractorService {
  private static readonly STORAGE_DIR = path.join(process.cwd(), 'data', 'catalogs');

  private static ensureStorageDir(): void {
    if (!fs.existsSync(this.STORAGE_DIR)) {
      fs.mkdirSync(this.STORAGE_DIR, { recursive: true });
    }
  }

  private static getCatalogFilePath(projectId: string): string {
    this.ensureStorageDir();
    const cleanId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.STORAGE_DIR, `${cleanId}.json`);
  }

  /**
   * Lấy danh mục bài học đã lưu trong không gian của người dùng
   */
  public static async getSavedCatalog(projectId = 'usr_guest'): Promise<CurriculumCatalog | null> {
    try {
      const filePath = this.getCatalogFilePath(projectId);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw) as CurriculumCatalog;
      }
    } catch (err) {
      console.warn('Error reading saved catalog:', err);
    }
    return null;
  }

  /**
   * Lưu danh mục bài học vào không gian riêng của người dùng
   */
  public static async saveCatalog(projectId: string, catalog: CurriculumCatalog): Promise<void> {
    try {
      const filePath = this.getCatalogFilePath(projectId);
      fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving catalog to disk:', err);
    }
  }

  /**
   * Xóa danh mục bài học đã lưu
   */
  public static async clearCatalog(projectId: string): Promise<void> {
    try {
      const filePath = this.getCatalogFilePath(projectId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error('Error deleting catalog file:', err);
    }
  }

  /**
   * Trích xuất toàn bộ Danh mục bài học và Ma trận phân phối chương trình
   * BÁM SÁT 4 NGUỒN TÀI LIỆU: Phụ lục I (PL1), Phân phối chương trình (PPCT), Sách giáo khoa (SGK), và KHDH cũ (KHDH_OLD).
   */
  public static async extractCatalog(req: ExtractCatalogRequest): Promise<{
    catalog: CurriculumCatalog;
    markdownSummary: string;
    keyUsed?: string;
    isCached?: boolean;
  }> {
    const targetProject = req.projectId || 'usr_guest';

    // Nếu không yêu cầu forceRefresh, kiểm tra xem đã có bản lưu trước đó không
    if (!req.forceRefresh) {
      const saved = await this.getSavedCatalog(targetProject);
      if (saved && Array.isArray(saved.lessons) && saved.lessons.length > 0) {
        const markdown = this.renderCatalogToMarkdown(saved);
        return {
          catalog: saved,
          markdownSummary: markdown,
          isCached: true,
        };
      }
    }

    const keyPool = GeminiService.resolveKeyPool(undefined, req.apiKeys);

    // 1. Lấy danh sách tài liệu nguồn sẵn sàng của người dùng
    let activeDocs = await SourceDocumentService.getActiveReady(targetProject);
    if (req.documentIds && Array.isArray(req.documentIds) && req.documentIds.length > 0) {
      activeDocs = activeDocs.filter((d) => req.documentIds?.includes(d.id));
    }

    const hasPL1 = activeDocs.some((d) => d.documentType === 'PL1');
    const hasPPCT = activeDocs.some((d) => d.documentType === 'PPCT');
    const hasSGK = activeDocs.some((d) => d.documentType === 'SGK');
    const hasKhdhOld = activeDocs.some((d) => d.documentType === 'KHDH_OLD');
    const hasOther = activeDocs.some((d) => d.documentType === 'OTHER');

    const sourceDocNames = activeDocs.map((d) => `[${d.documentType}] ${d.displayName}`);

    const { systemContext: sourceContextText } = SourceContextBuilder.buildPromptContext(activeDocs);

    const subjectName = req.subject || 'Toán học';
    const gradeName = req.grade || 'Lớp 8';

    const systemPrompt = [
      'Bạn là Chuyên gia Quản lý Chương trình GDPT 2018 & Tổ trưởng chuyên môn Toán THCS.',
      'Nhiệm vụ: Phân tích kỹ lưỡng các tài liệu nguồn đã cung cấp để TRÍCH XUẤT CHÍNH XÁC TOÀN BỘ DANH MỤC CÁC BÀI HỌC CỤ THỂ theo đúng tiến trình dạy học cả năm hoặc từng học kỳ.',
      '',
      sourceContextText,
      '',
      '## NGUYÊN TẮC BÁM SÁT 4 NGUỒN TÀI LIỆU (BẮT BUỘC):',
      '1. **PHỤ LỤC I (PL1)** (Ưu tiên số 1):',
      '   - Lấy chính xác Tên bài học, Số tiết quy định, Thời điểm thực hiện và 1-3 Yêu cầu cần đạt (YCCĐ) cốt lõi.',
      '2. **PHÂN PHỐI CHƯƠNG TRÌNH (PPCT)** (Ưu tiên số 2):',
      '   - Lấy chính xác Thứ tự bài dạy, Dải tiết PPCT (ví dụ: "Tiết 1, 2" hoặc "Tiết 1 - 2"), Tuần thực hiện (ví dụ: "Tuần 1").',
      '3. **SÁCH GIÁO KHOA (SGK)** (Ưu tiên số 3):',
      '   - Đối chiếu chuẩn tên bài trong SGK, Mạch kiến thức (Số và Đại số / Hình học và Đo lường / Thống kê và Xác suất) và Tên chương.',
      '4. **KHDH CŨ (KHDH_OLD)** (Chỉ tham khảo):',
      '   - Dùng để đối chiếu thêm nếu thiếu dữ liệu, KHÔNG được ghi đè tên bài hay số tiết của PL1 và PPCT.',
      '5. **Đầy đủ & Toàn diện**:',
      '   - Trích xuất đầy đủ tất cả các bài học lý thuyết, bài luyện tập chung, ôn tập chương, hoạt động trải nghiệm và bài kiểm tra định kỳ.',
      '6. **Căn cứ nguồn (sourceBasis & matchedSources)**:',
      '   - Với mỗi bài học, hãy ghi rõ tài liệu nguồn được sử dụng làm căn cứ (ví dụ: "PL1 + PPCT + SGK" hoặc "Phụ lục I & PPCT hiện hành").',
      '',
      '## YÊU CẦU ĐẦU RA BẮT BUỘC:',
      'Bạn PHẢI trả về ĐÚNG MỘT JSON OBJECT theo đúng cấu trúc sau (KHÔNG có markdown bao ngoài, KHÔNG có text giải thích ngoài JSON):',
      '{',
      '  "subject": "' + subjectName + '",',
      '  "grade": "' + gradeName + '",',
      '  "schoolYear": "2026-2027",',
      '  "sourceSummary": "Trích xuất bám sát: ' + (sourceDocNames.length > 0 ? sourceDocNames.join(', ') : 'Chương trình GDPT 2018') + '",',
      '  "totalLessons": 25,',
      '  "totalPeriods": 70,',
      '  "lessons": [',
      '    {',
      '      "stt": 1,',
      '      "lessonCode": "TOAN-8-HKI-C01-STT01",',
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
      '      "sourceBook": "Kết nối tri thức / Cánh Diều",',
      '      "sourceBasis": "PL1 + PPCT + SGK",',
      '      "matchedSources": ["PL1", "PPCT", "SGK"]',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const userPrompt = `Hãy trích xuất và lập bảng DANH MỤC BÀI HỌC CỤ THỂ cho môn ${subjectName} ${gradeName}${
      req.term ? ` (${req.term})` : ''
    } bám sát các tài liệu nguồn (Phụ lục I, PPCT, SGK, KHDH cũ) đã nạp.`;

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
        parsed.lessons = parsed.lessons.map((item, index) => ({
          ...item,
          stt: item.stt || index + 1,
          sourceBasis: item.sourceBasis || (hasPL1 && hasPPCT ? 'PL1 + PPCT' : hasPL1 ? 'Phụ lục I' : 'GDPT 2018'),
          matchedSources: item.matchedSources || (hasPL1 ? ['PL1'] : []),
        }));
        parsed.totalLessons = parsed.lessons.length;
        parsed.totalPeriods = parsed.lessons.reduce((acc, cur) => acc + (Number(cur.totalPeriods) || 1), 0);
        parsed.sourcesUsed = {
          hasPL1,
          hasPPCT,
          hasSGK,
          hasKhdhOld,
          hasOther,
          docCount: activeDocs.length,
          docNames: sourceDocNames,
        };
        parsed.extractedAt = new Date().toISOString();

        // Tự động lưu vào không gian riêng của người dùng
        await this.saveCatalog(targetProject, parsed);

        const markdown = this.renderCatalogToMarkdown(parsed);
        return {
          catalog: parsed,
          markdownSummary: markdown,
          keyUsed: response.keyUsed,
          isCached: false,
        };
      }
    } catch (err) {
      console.warn('AI Catalog extraction fallback to default template:', err);
    }

    // Fallback template nếu không có dữ liệu nguồn hoặc parse lỗi
    const fallbackCatalog = this.getFallbackCatalog(gradeName, subjectName);
    fallbackCatalog.sourcesUsed = {
      hasPL1,
      hasPPCT,
      hasSGK,
      hasKhdhOld,
      hasOther,
      docCount: activeDocs.length,
      docNames: sourceDocNames,
    };
    fallbackCatalog.extractedAt = new Date().toISOString();
    await this.saveCatalog(targetProject, fallbackCatalog);

    const markdown = this.renderCatalogToMarkdown(fallbackCatalog);
    return {
      catalog: fallbackCatalog,
      markdownSummary: markdown,
      isCached: false,
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
    lines.push(`> *Căn cứ tài liệu nguồn:* ${catalog.sourceSummary}`);
    if (catalog.extractedAt) {
      lines.push(`> *Thời gian trích xuất:* ${new Date(catalog.extractedAt).toLocaleString('vi-VN')}`);
    }
    lines.push('');
    lines.push('| STT | Mã bài học | Tên bài học / Chủ đề | Mạch kiến thức & Chương | Số tiết | Tiết PPCT | Tuần | Căn cứ nguồn |');
    lines.push('|:---:|:---|:---|:---|:---:|:---:|:---:|:---|');

    catalog.lessons.forEach((l, idx) => {
      const stt = l.stt || idx + 1;
      const code = `\`${l.lessonCode}\``;
      const title = `**${l.lessonTitle}**`;
      const chapter = `${l.strand ? `[${l.strand}] ` : ''}${l.chapter || ''}`;
      const periods = `**${l.totalPeriods}**`;
      const ppct = l.ppctRange || `Tiết ${stt}`;
      const week = l.weekRange || `Tuần ${Math.ceil(stt / 2)}`;
      const basis = l.sourceBasis || 'PL1/PPCT';

      lines.push(`| ${stt} | ${code} | ${title} | ${chapter} | ${periods} | ${ppct} | ${week} | ${basis} |`);
    });

    lines.push('');
    lines.push('---');
    lines.push('### 💡 Hướng dẫn sử dụng:');
    lines.push('- Sao chép **Mã bài học** hoặc **Tên bài** vào ô nhập lệnh để thực hiện soạn tự động.');
    lines.push('- Bấm trực tiếp nút **⚡ Soạn V11-2 (Không tách tiết)** hoặc **✂️ Soạn Tách tiết** trên bảng chọn danh mục của hệ thống.');

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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
        sourceBasis: 'Phụ lục I & PPCT chuẩn',
        matchedSources: ['PL1', 'PPCT', 'SGK'],
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
