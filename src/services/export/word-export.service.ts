import { Packer } from 'docx';
import { DocxBuilder } from './docx-builder';
import { ContentNormalizer } from './content-normalizer';
import { WordExportOptions, WordExportResult } from './export.types';
import { OOXmlValidator } from './ooxml-validator';

export class WordExportService {
  public static sanitizeFileName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_')
      .trim();
  }

  public static async exportToDocx(options: WordExportOptions): Promise<WordExportResult> {
    const startTime = Date.now();
    const mathMode = options.mathMode || 'omml';
    const printProfile = options.printProfile || 'COMPACT_PRINT';

    // 1. Chuẩn hóa nội dung văn bản (loại bỏ câu thừa chatbot, chuẩn hóa khoảng trắng)
    const cleanMarkdown = ContentNormalizer.normalize(options.markdown);

    // 2. Khởi tạo Builder với Profile & MathMode
    const builder = new DocxBuilder(mathMode, printProfile);
    const doc = builder.build({
      ...options,
      markdown: cleanMarkdown,
    });

    // 3. Đóng gói DOCX buffer
    const buffer = await Packer.toBuffer(doc);

    // 4. Kiểm tra toàn vẹn gói ZIP & cấu trúc OOXML (Phase 29 Acceptance Gate)
    const validation = await OOXmlValidator.validate(buffer);
    if (!validation.valid) {
      console.error('[WORD_EXPORT_VALIDATION_FAILED]', validation.errors);
      throw new Error(`WORD_EXPORT_VALIDATION_FAILED: ${validation.errors.join('; ')}`);
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const rawLesson = options.lessonCode || options.title || 'KHDH_V10';
    const safeCode = this.sanitizeFileName(rawLesson);
    const profileSuffix = printProfile === 'COMPACT_PRINT' ? 'COMPACT' : 'STD';
    const filename = `KHDH_${safeCode}_${mathMode.toUpperCase()}_${profileSuffix}_${dateStr}.docx`;

    return {
      buffer,
      filename,
      mathMode,
      printProfile,
      formulasConverted: builder.formulasConverted,
      ommlFallbackCount: builder.ommlFallbackCount,
      tablesCount: builder.tablesCount,
      durationMs: Date.now() - startTime,
    };
  }
}

