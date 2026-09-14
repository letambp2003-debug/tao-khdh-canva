import { Packer } from 'docx';
import { DocxBuilder } from './docx-builder';
import { ContentNormalizer } from './content-normalizer';
import { WordExportOptions, WordExportResult } from './export.types';
import { OOXmlValidator } from './ooxml-validator';

function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export class WordExportService {
  public static sanitizeFileName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_')
      .trim();
  }

  public static generateStandardFileName(options: WordExportOptions): string {
    const md = options.markdown || '';

    // 1. Extract PPCT numbers (e.g. Tiết 3, Tiết 4 -> 3_4)
    let ppctStr = '';
    const ppctMatch = md.match(/PPCT\s*:\s*(?:\[|\()?([^\n\)|\]]+)(?:\]|\))?/i)
      || md.match(/ppct_auto\s*:\s*\[([^\]]+)\]/i)
      || md.match(/(?:PPCT|Tiết)\s*:\s*Tiết\s*([0-9]+(?:\s*[,–\-]\s*(?:Tiết\s*)?[0-9]+)*)/i);

    if (ppctMatch) {
      const digits = ppctMatch[1].match(/\d+/g);
      if (digits && digits.length > 0) {
        ppctStr = digits.join('_');
      }
    }

    if (!ppctStr && options.lessonCode) {
      const codeDigits = options.lessonCode.match(/\d+/g);
      if (codeDigits && codeDigits.length > 0) {
        ppctStr = codeDigits.slice(0, 2).join('_');
      }
    }

    if (!ppctStr) {
      ppctStr = '1_2';
    }

    // 2. Extract Lesson Title (e.g. BÀI 2. ĐA THỨC -> BAI_2_DA_THUC)
    let rawTitle = '';
    const titleMatch = md.match(/^##?\s*\*\*?(BÀI\s+[0-9]+[^\*\n]+)\*\*?/im)
      || md.match(/^(BÀI\s+[0-9]+[\.:\s]+[^\n]+)/im)
      || md.match(/lesson_title\s*:\s*["']?([^"'\n]+)/i);

    if (titleMatch) {
      rawTitle = titleMatch[1].trim();
    } else if (options.title && options.title !== 'Kế hoạch bài dạy') {
      rawTitle = options.title;
    } else if (options.lessonCode) {
      const parenMatch = options.lessonCode.match(/\(([^)]+)\)/);
      if (parenMatch) {
        rawTitle = parenMatch[1].trim();
      } else {
        rawTitle = options.lessonCode;
      }
    } else {
      rawTitle = 'BAI_2_DA_THUC';
    }

    const cleanTitle = removeVietnameseTones(rawTitle)
      .toUpperCase()
      .replace(/[:.,;!?()\[\]{}"'\\\/–\-]/g, ' ')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_+|_+$/g, '');

    return `TIET_${ppctStr}_${cleanTitle}.docx`;
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

    const filename = this.generateStandardFileName({
      ...options,
      markdown: cleanMarkdown,
    });

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

