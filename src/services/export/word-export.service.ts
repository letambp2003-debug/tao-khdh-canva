import { Packer } from 'docx';
import { DocxBuilder } from './docx-builder';
import { WordExportOptions, WordExportResult } from './export.types';

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
    const builder = new DocxBuilder(mathMode);

    const doc = builder.build(options);
    const buffer = await Packer.toBuffer(doc);

    const dateStr = new Date().toISOString().slice(0, 10);
    const rawLesson = options.lessonCode || options.title || 'KHDH_V10';
    const safeCode = this.sanitizeFileName(rawLesson);
    const filename = `KHDH_${safeCode}_${mathMode.toUpperCase()}_${dateStr}.docx`;

    return {
      buffer,
      filename,
      mathMode,
      formulasConverted: builder.formulasConverted,
      ommlFallbackCount: builder.ommlFallbackCount,
      tablesCount: builder.tablesCount,
      durationMs: Date.now() - startTime,
    };
  }
}
