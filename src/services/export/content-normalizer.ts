export class ContentNormalizer {
  /**
   * Danh sách các mẫu câu mở đầu / kết thúc mang tính chất chatbot cần loại bỏ
   */
  private static readonly BOILERPLATE_PATTERNS: RegExp[] = [
    /^dưới đây là (bản|nội dung|kế hoạch|giáo án)[^\n]*\n+/im,
    /^sau đây là (bản|nội dung|kế hoạch|giáo án)[^\n]*\n+/im,
    /^tôi xin (trình bày|gửi bạn|chia sẻ)[^\n]*\n+/im,
    /^chào bạn[^\n]*\n+/im,
    /\n+hy vọng (bản|kế hoạch|giáo án)[^\n]*$/im,
    /\n+nếu bạn cần (thêm|chỉnh sửa|bổ sung)[^\n]*$/im,
    /\n+chúc bạn dạy học tốt[^\n]*$/im,
  ];

  /**
   * Chuẩn hóa văn bản trước khi đưa vào Word Document Builder
   */
  public static normalize(markdown: string): string {
    if (!markdown) return '';

    let text = markdown;

    // 1. Loại bỏ các câu hội thoại chatbot thừa
    for (const pattern of this.BOILERPLATE_PATTERNS) {
      text = text.replace(pattern, '');
    }

    // 2. Chuẩn hóa khoảng trắng và dấu câu
    // Giữ nguyên dòng mới, nhưng bỏ nhiều dòng trắng thừa liên tiếp (> 2 dòng trống)
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    // 3. Chuẩn hóa khoảng trắng trước dấu câu (ngoài khối code/math)
    // Ví dụ: 'abc .' -> 'abc.', 'abc ,' -> 'abc,'
    text = text.replace(/\s+([.,;:?!])(?=\s|$)/g, '$1');

    // 4. Loại bỏ các ký tự điều khiển không in được (trừ newline & tab)
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return text.trim();
  }
}
