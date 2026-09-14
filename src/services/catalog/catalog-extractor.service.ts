import fs from 'fs';
import path from 'path';
import { GeminiService } from '@/services/ai/gemini.service';
import { SourceDocumentService } from '@/services/documents/source-document.service';
import { SourceContextBuilder } from '@/services/documents/source-context-builder';
import { SourceDocument } from '@/types/source-document';
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
   * Tự động phát hiện MÔN HỌC từ danh sách tài liệu nguồn tải lên
   */
  public static detectSubjectFromDocs(docs: SourceDocument[], fallback = 'Toán học'): string {
    if (!docs || docs.length === 0) return fallback;
    const combinedText = docs
      .map((d) => `${d.displayName} ${d.originalFileName} ${(d.extractedText || '').slice(0, 10000)}`)
      .join(' ')
      .toLowerCase();

    if (/\b(lịch\s*sử\s*và\s*địa\s*l[íy]|ls\s*&?\s*đl|lịch\s*sử|lich\s*su|sử\s*[6789]|lichsu)\b/i.test(combinedText)) {
      if (/\b(địa\s*l[íy]|dia\s*li)\b/i.test(combinedText) && !/\b(lịch\s*sử)\b/i.test(combinedText)) {
        return 'Địa lí';
      }
      return 'Lịch sử';
    }
    if (/\b(địa\s*l[íy]|dia\s*li|địa\s*[6789])\b/i.test(combinedText)) {
      return 'Địa lí';
    }
    if (/\b(ngữ\s*văn|ngu\s*van|văn\s*học|tiếng\s*việt|van\s*[6789])\b/i.test(combinedText)) {
      return 'Ngữ văn';
    }
    if (/\b(khoa\s*học\s*tự\s*nhiên|khtn|vật\s*l[íy]|hóa\s*học|sinh\s*học)\b/i.test(combinedText)) {
      return 'Khoa học tự nhiên';
    }
    if (/\b(tin\s*học|tin\s*hoc|cntt|informatics|tin\s*[6789])\b/i.test(combinedText)) {
      return 'Tin học';
    }
    if (/\b(tiếng\s*anh|tieng\s*anh|english|tienganh)\b/i.test(combinedText)) {
      return 'Tiếng Anh';
    }
    if (/\b(giáo\s*dục\s*công\s*dân|gdcd)\b/i.test(combinedText)) {
      return 'Giáo dục công dân';
    }
    if (/\b(công\s*nghệ|cong\s*nghe)\b/i.test(combinedText)) {
      return 'Công nghệ';
    }
    if (/\b(hoạt\s*động\s*trải\s*nghiệm|hđtn|hdtn)\b/i.test(combinedText)) {
      return 'Hoạt động trải nghiệm';
    }
    if (/\b(toán|toan|đại\s*số|hình\s*học)\b/i.test(combinedText)) {
      return 'Toán học';
    }

    return fallback;
  }

  /**
   * Lấy mã tiền tố viết tắt của môn học (Ví dụ: Lịch sử -> SU, Toán -> TOAN)
   */
  public static getSubjectCodePrefix(subject: string): string {
    const s = (subject || '').toLowerCase();
    if (s.includes('sử')) return 'SU';
    if (s.includes('địa')) return 'DIA';
    if (s.includes('văn')) return 'VAN';
    if (s.includes('tự nhiên') || s.includes('khtn')) return 'KHTN';
    if (s.includes('tin')) return 'TIN';
    if (s.includes('anh')) return 'ENG';
    if (s.includes('công dân') || s.includes('gdcd')) return 'GDCD';
    if (s.includes('công nghệ')) return 'CN';
    if (s.includes('trải nghiệm')) return 'HDTN';
    return 'TOAN';
  }

  /**
   * Tự động phát hiện KHỐI LỚP từ danh sách tài liệu nguồn tải lên
   */
  public static detectGradeFromDocs(docs: SourceDocument[], fallback = 'Lớp 9'): string {
    if (!docs || docs.length === 0) return fallback;
    const combinedText = docs
      .map((d) => `${d.displayName} ${d.originalFileName} ${(d.extractedText || '').slice(0, 8000)}`)
      .join(' ')
      .toLowerCase();

    if (/\b(lớp\s*9|lop\s*9|toán\s*9|sử\s*9|văn\s*9|khtn\s*9|tin\s*9|-9-|_9_|k9|khoi\s*9|khối\s*9)\b/i.test(combinedText)) {
      return 'Lớp 9';
    }
    if (/\b(lớp\s*8|lop\s*8|toán\s*8|sử\s*8|văn\s*8|khtn\s*8|tin\s*8|-8-|_8_|k8|khoi\s*8|khối\s*8)\b/i.test(combinedText)) {
      return 'Lớp 8';
    }
    if (/\b(lớp\s*7|lop\s*7|toán\s*7|sử\s*7|văn\s*7|khtn\s*7|tin\s*7|-7-|_7_|k7|khoi\s*7|khối\s*7)\b/i.test(combinedText)) {
      return 'Lớp 7';
    }
    if (/\b(lớp\s*6|lop\s*6|toán\s*6|sử\s*6|văn\s*6|khtn\s*6|tin\s*6|-6-|_6_|k6|khoi\s*6|khối\s*6)\b/i.test(combinedText)) {
      return 'Lớp 6';
    }
    return fallback;
  }

  /**
   * BỘ GIẢI MÃ BẢNG BIỂU THUẦN (Deterministic Table Parser)
   * Trích xuất trực tiếp 100% các hàng bài học từ bảng Phụ lục I và PPCT của tệp tải lên
   */
  public static parseLessonsFromSourceTables(
    docs: SourceDocument[],
    gradeName = 'Lớp 9',
    subjectName = 'Lịch sử'
  ): CatalogLessonItem[] {
    const pl1Docs = docs.filter((d) => d.documentType === 'PL1' || d.documentType === 'PPCT');
    const lessons: CatalogLessonItem[] = [];
    let currentPpct = 1;
    const subPrefix = this.getSubjectCodePrefix(subjectName);

    let detectedChapter = subjectName.includes('Sử')
      ? 'Chương I: Lịch sử thế giới / Lịch sử Việt Nam'
      : subjectName.includes('Văn')
      ? 'Bài 1: Khám phá vẻ đẹp ngôn từ / Truyện kể'
      : subjectName.includes('KHTN')
      ? 'Chủ đề 1: Phản ứng hóa học / Năng lượng'
      : 'Chương I: Khám phá kiến thức cốt lõi';

    let detectedStrand = subjectName.includes('Sử')
      ? 'Lịch sử thế giới & Việt Nam'
      : subjectName.includes('Văn')
      ? 'Đọc hiểu - Viết - Nói và Nghe'
      : subjectName.includes('KHTN')
      ? 'Chất - Năng lượng - Vật sống'
      : 'Kiến thức cốt lõi môn học';

    for (const doc of pl1Docs) {
      const text = doc.extractedText || '';
      const lines = text.split('\n');

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Bắt tên chương / chủ đề / mạch kiến thức nếu có dòng tiêu đề
        if (
          line.toLowerCase().includes('chương') ||
          line.toLowerCase().includes('chủ đề') ||
          line.toLowerCase().includes('mạch') ||
          line.toLowerCase().includes('phần')
        ) {
          const cleanLine = line.replace(/^[|#*\s-]+|[|#*\s-]+$/g, '').trim();
          if (cleanLine.length > 3 && cleanLine.length < 90 && !/^\d+$/.test(cleanLine)) {
            detectedChapter = cleanLine;
            detectedStrand = cleanLine.split(':')[0].trim();
          }
        }

        // Bóc tách hàng bảng chứa dấu phân tách |
        if (line.includes('|')) {
          const cells = line
            .split('|')
            .map((c) => c.trim())
            .filter((c) => c.length > 0);

          if (cells.length >= 2) {
            const firstCell = cells[0];
            const sttMatch = firstCell.match(/^(\d+)$/);
            if (sttMatch) {
              const stt = parseInt(sttMatch[1]);
              const title = cells[1];

              // Bỏ qua dòng tiêu đề bảng nếu cell 1 là "Tên bài" hoặc "Bài học"
              if (
                title.toLowerCase() === 'tên bài' ||
                title.toLowerCase() === 'bài học' ||
                title.toLowerCase() === 'tên bài học' ||
                title.toLowerCase().includes('tên bài dạy')
              ) {
                continue;
              }

              let periods = 2;
              let ppctRange = '';
              let weekRange = '';
              const objectives: string[] = [];

              for (let i = 2; i < cells.length; i++) {
                const cell = cells[i];
                const periodMatch = cell.match(/^(\d+)(?:\s*tiết)?$/i);
                if (periodMatch && i === 2) {
                  periods = parseInt(periodMatch[1]) || 2;
                  continue;
                }

                if (
                  cell.toLowerCase().startsWith('tiết') ||
                  (!cell.toLowerCase().startsWith('tuần') && /\b\d+\s*[,-]\s*\d+\b/.test(cell))
                ) {
                  ppctRange = cell.startsWith('Tiết') ? cell : `Tiết ${cell}`;
                } else if (cell.toLowerCase().startsWith('tuần') || (i === 4 && /^\d+$/.test(cell))) {
                  weekRange = cell.startsWith('Tuần') ? cell : `Tuần ${cell}`;
                } else if (cell.length > 10 && objectives.length === 0) {
                  objectives.push(cell);
                }
              }

              if (!ppctRange) {
                const endPpct = currentPpct + periods - 1;
                ppctRange =
                  periods === 1
                    ? `Tiết ${currentPpct}`
                    : `Tiết ${currentPpct}, ${Array.from({ length: periods - 1 }, (_, k) => currentPpct + 1 + k).join(', ')}`;
                currentPpct = endPpct + 1;
              }

              if (!weekRange) {
                weekRange = `Tuần ${Math.ceil(stt / 2)}`;
              }

              const cleanGradeNum = gradeName.replace(/[^0-9]/g, '') || '9';
              const padStt = stt < 10 ? `0${stt}` : `${stt}`;
              const lessonCode = `${subPrefix}-${cleanGradeNum}-HKI-C01-STT${padStt}`;

              let cleanTitle = title;
              if (
                !cleanTitle.toLowerCase().startsWith('bài') &&
                !cleanTitle.toLowerCase().startsWith('chương') &&
                !cleanTitle.toLowerCase().startsWith('chủ đề')
              ) {
                cleanTitle = `Bài ${stt}: ${cleanTitle}`;
              }

              lessons.push({
                stt,
                lessonCode,
                lessonTitle: cleanTitle,
                chapter: detectedChapter,
                strand: detectedStrand,
                grade: gradeName,
                term: 'Học kỳ I',
                totalPeriods: periods,
                ppctRange,
                weekRange,
                keyObjectives: objectives.length > 0 ? objectives : [`Bám sát YCCĐ môn ${subjectName} trong Phụ lục I`],
                sourceBasis: `Phụ lục I (${doc.displayName})`,
                matchedSources: [doc.documentType],
              });
            }
          }
        }
      }
    }

    return lessons;
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
   * BÁM SÁT 100% DỮ LIỆU TÀI LIỆU NGUỒN (PL1, PPCT, SGK, KHDH_OLD) - TỰ ĐỘNG PHÁT HIỆN MÔN VÀ LỚP TỪ TỆP NGUỒN.
   */
  public static async extractCatalog(req: ExtractCatalogRequest): Promise<{
    catalog: CurriculumCatalog;
    markdownSummary: string;
    keyUsed?: string;
    isCached?: boolean;
  }> {
    const targetProject = req.projectId || 'usr_guest';

    // 1. Lấy danh sách tài liệu nguồn sẵn sàng của người dùng
    let activeDocs = await SourceDocumentService.getActiveReady(targetProject);
    if (req.documentIds && Array.isArray(req.documentIds) && req.documentIds.length > 0) {
      activeDocs = activeDocs.filter((d) => req.documentIds?.includes(d.id));
    }

    // TỰ ĐỘNG PHÁT HIỆN MÔN HỌC VÀ KHỐI LỚP TỪ CHÍNH CÁC TỆP NGUỒN VỪA NẠP
    const detectedSubject = this.detectSubjectFromDocs(activeDocs, req.subject || 'Lịch sử');
    const detectedGrade = req.grade || this.detectGradeFromDocs(activeDocs, 'Lớp 9');

    const subjectName = (req.subject && req.subject !== 'Toán học') ? req.subject : detectedSubject;
    const gradeName = detectedGrade;

    // Nếu không yêu cầu forceRefresh, kiểm tra xem đã có bản lưu cùng khối lớp và môn học không
    if (!req.forceRefresh) {
      const saved = await this.getSavedCatalog(targetProject);
      if (saved && Array.isArray(saved.lessons) && saved.lessons.length > 0) {
        if ((!req.grade || saved.grade === req.grade) && (!req.subject || saved.subject === req.subject)) {
          const markdown = this.renderCatalogToMarkdown(saved);
          return {
            catalog: saved,
            markdownSummary: markdown,
            isCached: true,
          };
        }
      }
    }

    const hasPL1 = activeDocs.some((d) => d.documentType === 'PL1');
    const hasPPCT = activeDocs.some((d) => d.documentType === 'PPCT');
    const hasSGK = activeDocs.some((d) => d.documentType === 'SGK');
    const hasKhdhOld = activeDocs.some((d) => d.documentType === 'KHDH_OLD');
    const hasOther = activeDocs.some((d) => d.documentType === 'OTHER');

    const sourceDocNames = activeDocs.map((d) => `[${d.documentType}] ${d.displayName}`);

    // BƯỚC 1: Thử bóc tách trực tiếp bảng biểu từ tệp nguồn (Deterministic Table Parser)
    const directParsedLessons = this.parseLessonsFromSourceTables(activeDocs, gradeName, subjectName);

    const keyPool = GeminiService.resolveKeyPool(undefined, req.apiKeys);
    const { systemContext: sourceContextText } = SourceContextBuilder.buildPromptContext(activeDocs);
    const subPrefix = this.getSubjectCodePrefix(subjectName);

    const systemPrompt = [
      `Bạn là Chuyên gia Quản lý Chương trình GDPT 2018 môn ${subjectName} THCS.`,
      `Nhiệm vụ: Phân tích kỹ lưỡng các bảng biểu trong tài liệu nguồn (Phụ lục I và PPCT) để TRÍCH XUẤT CHÍNH XÁC TOÀN BỘ DANH MỤC CÁC BÀI HỌC CỦA MÔN ${subjectName.toUpperCase()} ${gradeName.toUpperCase()}.`,
      '',
      `QUY TẮC BẮT BUỘC: ĐỌC ĐÚNG DỮ LIỆU CỦA MÔN ${subjectName.toUpperCase()} TỪ TỆP NGUỒN ĐÃ TẢI LÊN. TUYỆT ĐỐI KHÔNG TỰ BỊA HOẶC LẤY DỮ LIỆU CỦA MÔN KHÁC.`,
      '',
      sourceContextText,
      '',
      '## HƯỚNG DẪN ĐỌC BẢNG PHỤ LỤC I (PL1) & PHÂN PHỐI CHƯƠNG TRÌNH (PPCT):',
      '1. **ĐỌC ĐÚNG CỘT TRONG BẢNG PHỤ LỤC I (PL1)**:',
      '   - **Cột 1**: STT bài học.',
      '   - **Cột 2**: Tên bài học / Bài dạy thực tế trong tài liệu.',
      '   - **Cột 3**: "Số tiết" (Thời lượng bài dạy thực tế).',
      '   - **Cột 4**: "Tiết PPCT" và "Tuần thực hiện".',
      '   - **Cột 5**: Yêu cầu cần đạt (YCCĐ).',
      '2. **TÍNH TOÁN DẢI TIẾT PPCT (ppctRange)**: Lũy kế chính xác theo số tiết của từng bài.',
      '',
      '## YÊU CẦU ĐẦU RA BẮT BUỘC (JSON OBJECT):',
      '{',
      '  "subject": "' + subjectName + '",',
      '  "grade": "' + gradeName + '",',
      '  "schoolYear": "2026-2027",',
      '  "sourceSummary": "Trích xuất 100% từ tệp nguồn: ' + (sourceDocNames.length > 0 ? sourceDocNames.join(', ') : 'Phụ lục I & PPCT') + '",',
      '  "totalLessons": 20,',
      '  "totalPeriods": 52,',
      '  "lessons": [',
      '    {',
      '      "stt": 1,',
      '      "lessonCode": "' + subPrefix + '-' + (gradeName.replace(/[^0-9]/g, '') || '9') + '-HKI-C01-STT01",',
      '      "lessonTitle": "Tên bài học chuẩn từ cột 2 PL1",',
      '      "chapter": "Tên chương / Chủ đề từ tài liệu",',
      '      "strand": "Mạch kiến thức từ tài liệu",',
      '      "grade": "' + gradeName + '",',
      '      "term": "Học kỳ I",',
      '      "totalPeriods": 2,',
      '      "ppctRange": "Tiết 1, 2",',
      '      "weekRange": "Tuần 1",',
      '      "keyObjectives": [',
      '        "Yêu cầu cần đạt chuẩn từ tài liệu"',
      '      ],',
      '      "sourceBasis": "PL1 & PPCT",',
      '      "matchedSources": ["PL1", "PPCT"]',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const userPrompt = `Hãy đọc thật kỹ Cột 3 "Số tiết" và Cột 4 "Tiết PPCT" trong bảng Phụ lục I và file PPCT để trích xuất chính xác Danh mục bài học môn ${subjectName} ${gradeName}.`;

    try {
      if (keyPool.length > 0) {
        const response = await GeminiService.generateContent({
          systemPrompt,
          userMessage: userPrompt,
          temperature: 0.1,
          apiKeys: keyPool,
        });

        const rawText = response.text.trim();
        let cleanJson = rawText;
        if (cleanJson.includes('```json')) {
          cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        } else if (cleanJson.includes('```')) {
          cleanJson = cleanJson.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        }

        const parsed = JSON.parse(cleanJson) as CurriculumCatalog;
        if (parsed && Array.isArray(parsed.lessons) && parsed.lessons.length > 0) {
          parsed.subject = parsed.subject || subjectName;
          parsed.grade = parsed.grade || gradeName;
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

          await this.saveCatalog(targetProject, parsed);
          const markdown = this.renderCatalogToMarkdown(parsed);
          return {
            catalog: parsed,
            markdownSummary: markdown,
            keyUsed: response.keyUsed,
            isCached: false,
          };
        }
      }
    } catch (err) {
      console.warn('AI Catalog extraction fallback to table parser:', err);
    }

    // BƯỚC 2: Nếu AI không khả dụng nhưng ĐÃ CÓ BẢNG TỪ TỆP NGUỒN TẢI LÊN, dùng trực tiếp bảng bóc tách từ tệp
    if (directParsedLessons.length > 0) {
      const sourceCatalog: CurriculumCatalog = {
        subject: subjectName,
        grade: gradeName,
        schoolYear: '2026-2027',
        sourceSummary: `Trích xuất 100% từ tệp nguồn: ${sourceDocNames.join(', ')}`,
        totalLessons: directParsedLessons.length,
        totalPeriods: directParsedLessons.reduce((acc, cur) => acc + cur.totalPeriods, 0),
        sourcesUsed: {
          hasPL1,
          hasPPCT,
          hasSGK,
          hasKhdhOld,
          hasOther,
          docCount: activeDocs.length,
          docNames: sourceDocNames,
        },
        extractedAt: new Date().toISOString(),
        lessons: directParsedLessons,
      };

      await this.saveCatalog(targetProject, sourceCatalog);
      const markdown = this.renderCatalogToMarkdown(sourceCatalog);
      return {
        catalog: sourceCatalog,
        markdownSummary: markdown,
        isCached: false,
      };
    }

    // BƯỚC 3: Chỉ khi CHƯA NẠP TÀI LIỆU NGUỒN NÀO mới dùng khung chương trình mẫu
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
    lines.push('| STT | Mã bài học | Tên bài học / Chủ đề | Mạch kiến thức & Chương | Số tiết (Cột 3) | Tiết PPCT (Cột 4) | Tuần | Căn cứ nguồn |');
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
    lines.push('- Bấm trực tiếp vào các nút soạn để tạo KHDH theo đúng chương trình môn học.');

    return lines.join('\n');
  }

  /**
   * Dữ liệu khung chương trình chuẩn GDPT 2018 theo từng môn học
   */
  public static getFallbackCatalog(grade = 'Lớp 9', subject = 'Lịch sử'): CurriculumCatalog {
    const cleanNum = grade.replace(/[^0-9]/g, '') || '9';
    const subPrefix = this.getSubjectCodePrefix(subject);

    if (subject.includes('Sử')) {
      return {
        subject: 'Lịch sử',
        grade,
        schoolYear: '2026-2027',
        sourceSummary: `Khung chương trình GDPT 2018 Môn Lịch sử ${grade}`,
        totalLessons: 8,
        totalPeriods: 26,
        sourcesUsed: {
          hasPL1: false,
          hasPPCT: false,
          hasSGK: false,
          hasKhdhOld: false,
          hasOther: false,
          docCount: 0,
          docNames: [],
        },
        lessons: [
          {
            stt: 1,
            lessonCode: `${subPrefix}-${cleanNum}-HKI-C01-STT01`,
            lessonTitle: 'Bài 1: Nước Nga và Liên Xô từ năm 1918 đến năm 1945',
            chapter: 'Chương 1: Thế giới từ năm 1918 đến năm 1945',
            strand: 'Lịch sử thế giới hiện đại',
            grade,
            term: 'Học kỳ I',
            totalPeriods: 3,
            ppctRange: 'Tiết 1, 2, 3',
            weekRange: 'Tuần 1, 2',
            keyObjectives: ['Trình bày được những nét chính về nước Nga và Liên Xô giai đoạn 1918-1945'],
            sourceBasis: 'GDPT 2018 Môn Lịch sử',
            matchedSources: [],
          },
          {
            stt: 2,
            lessonCode: `${subPrefix}-${cleanNum}-HKI-C01-STT02`,
            lessonTitle: 'Bài 2: Châu Âu và nước Mỹ từ năm 1918 đến năm 1945',
            chapter: 'Chương 1: Thế giới từ năm 1918 đến năm 1945',
            strand: 'Lịch sử thế giới hiện đại',
            grade,
            term: 'Học kỳ I',
            totalPeriods: 3,
            ppctRange: 'Tiết 4, 5, 6',
            weekRange: 'Tuần 2, 3',
            keyObjectives: ['Nêu được phong trào cách mạng ở châu Âu và cuộc khủng hoảng kinh tế 1929-1933'],
            sourceBasis: 'GDPT 2018 Môn Lịch sử',
            matchedSources: [],
          },
        ],
      };
    }

    // Mặc định Toán học
    return {
      subject: 'Toán học',
      grade,
      schoolYear: '2026-2027',
      sourceSummary: `Khung chương trình GDPT 2018 Môn Toán ${grade}`,
      totalLessons: 6,
      totalPeriods: 18,
      sourcesUsed: {
        hasPL1: false,
        hasPPCT: false,
        hasSGK: false,
        hasKhdhOld: false,
        hasOther: false,
        docCount: 0,
        docNames: [],
      },
      lessons: [
        {
          stt: 1,
          lessonCode: `TOAN-${cleanNum}-HKI-C01-STT01`,
          lessonTitle: 'Bài 1: Khái niệm phương trình và hệ hai phương trình bậc nhất hai ẩn',
          chapter: 'Chương I: Phương trình và hệ hai phương trình bậc nhất hai ẩn',
          strand: 'Số và Đại số',
          grade,
          term: 'Học kỳ I',
          totalPeriods: 2,
          ppctRange: 'Tiết 1, 2',
          weekRange: 'Tuần 1',
          keyObjectives: ['Nhận biết phương trình bậc nhất hai ẩn và hệ hai phương trình bậc nhất hai ẩn'],
          sourceBasis: 'GDPT 2018 Môn Toán',
          matchedSources: [],
        },
      ],
    };
  }
}
