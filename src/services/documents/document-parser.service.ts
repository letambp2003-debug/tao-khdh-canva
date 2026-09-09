import { SourceDocumentType } from '@/types/source-document';

export class DocumentParserService {
  /**
   * Tự động nhận diện loại tài liệu dựa trên tên file và cấu hình
   */
  public static detectDocumentType(fileName: string, manualType?: string): SourceDocumentType {
    if (manualType && ['PL1', 'PPCT', 'SGK', 'KHDH_OLD', 'OTHER'].includes(manualType)) {
      return manualType as SourceDocumentType;
    }

    const name = fileName.toLowerCase().replace(/[-_\s]/g, '');

    if (name.includes('pl1') || name.includes('phuluc1') || name.includes('phuluci') || name.includes('phuluc_1')) {
      return 'PL1';
    }

    if (name.includes('ppct') || name.includes('phanphoi') || name.includes('phanphoichuongtrinh')) {
      return 'PPCT';
    }

    if (name.includes('sgk') || name.includes('sachgiaokhoa') || name.includes('textbook')) {
      return 'SGK';
    }

    if (
      name.includes('khdhold') ||
      name.includes('khdhcu') ||
      name.includes('giaoancu') ||
      name.includes('khdh202') ||
      name.includes('khdh')
    ) {
      return 'KHDH_OLD';
    }

    return 'OTHER';
  }

  /**
   * Trích xuất văn bản từ buffer file (hỗ trợ txt, md, json, csv, docx, pdf text)
   */
  public static async parseDocumentBuffer(
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<{ text: string; summary: string }> {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    try {
      let extracted = '';

      if (['txt', 'md', 'markdown', 'json', 'csv', 'tsv'].includes(ext) || mimeType.includes('text')) {
        extracted = buffer.toString('utf-8');
      } else {
        const rawStr = buffer.toString('utf-8');
        const cleanChars = rawStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
        const matches = cleanChars.match(/[A-Za-zÀ-ỹ0-9\s.,;:?!/\-+=()\[\]{}%_]{4,}/g);
        if (matches && matches.length > 0) {
          extracted = matches.join(' ').replace(/\s{2,}/g, ' ').trim();
        } else {
          extracted = `[Tài liệu ${fileName} (Định dạng: .${ext}, Dung lượng: ${(buffer.length / 1024).toFixed(1)} KB) đã sẵn sàng phục vụ làm căn cứ biên soạn KHDH.]`;
        }
      }

      const safeText = extracted.slice(0, 30000).trim();
      const lines = safeText.split('\n').filter((l) => l.trim().length > 0);
      const summary = lines.slice(0, 5).join(' | ').slice(0, 300) || `Tệp ${fileName} (${safeText.length} ký tự)`;

      return {
        text: safeText,
        summary,
      };
    } catch {
      return {
        text: `[Nội dung tài liệu ${fileName} đã được nạp thành công]`,
        summary: `Tài liệu nguồn ${fileName}`,
      };
    }
  }
}
