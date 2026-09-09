export type MathExportMode = 'omml' | 'latex';

export interface WordExportOptions {
  markdown: string;
  title?: string;
  lessonCode?: string;
  schoolName?: string;
  department?: string;
  teacherName?: string;
  mathMode?: MathExportMode;
}

export interface WordExportResult {
  buffer: Buffer;
  filename: string;
  mathMode: MathExportMode;
  formulasConverted: number;
  ommlFallbackCount: number;
  tablesCount: number;
  durationMs: number;
}
