/**
 * Types for Curriculum Catalog Extraction & Management
 */

export interface CatalogLessonItem {
  stt?: number;
  lessonCode: string;           // e.g. TOAN-8-HKI-C01-B01
  lessonTitle: string;          // e.g. Bài 1: Đơn thức và đa thức nhiều biến
  chapter?: string;             // e.g. Chương I: Đa thức nhiều biến
  strand?: string;              // e.g. Số và Đại số / Hình học và Đo lường / Thống kê và Xác suất
  grade?: string;               // e.g. Lớp 8
  term?: string;                // e.g. Học kỳ I / Học kỳ II
  totalPeriods: number;         // e.g. 2
  ppctRange: string;            // e.g. Tiết 1 - 2 / Tiết 1, 2
  weekRange?: string;           // e.g. Tuần 1
  keyObjectives?: string[];     // e.g. ["Nhận biết đơn thức, đa thức", "Tính giá trị đa thức"]
  sourceBook?: string;          // e.g. Cánh Diều / Kết Nối Tri Thức / Chân Trời Sáng Tạo
}

export interface CurriculumCatalog {
  subject: string;
  grade: string;
  schoolYear?: string;
  sourceSummary: string;
  totalLessons: number;
  totalPeriods: number;
  lessons: CatalogLessonItem[];
}

export interface ExtractCatalogRequest {
  grade?: string;
  subject?: string;
  term?: string;
  apiKeys?: string[];
  documentIds?: string[];
  projectId?: string;
}

export interface ExtractCatalogResponse {
  success: boolean;
  catalog?: CurriculumCatalog;
  markdownSummary?: string;
  message?: string;
  keyUsed?: string;
}
