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
   * Loại bỏ các khối JSON / AgentMessage / YAML / Metadata râu ria ở đầu văn bản
   */
  public static cleanMetadata(markdown: string): string {
    if (!markdown) return '';
    let text = markdown.trim();

    // 1. Unwrap whole markdown wrapper ```markdown ... ```
    text = text.replace(/^```(?:markdown|md)\s*\n([\s\S]*?)\n```\s*$/i, '$1');

    // 2. Loại bỏ khối code JSON ở đầu (ví dụ ```json { "job_id": ... } ```)
    text = text.replace(/^```(?:json)?\s*\{[\s\S]*?\}\s*```\s*/im, '');

    // 3. Loại bỏ đối tượng JSON thô ở đầu văn bản (ví dụ { "job_id": ..., "status": ... })
    text = text.replace(/^\s*\{\s*"(?:job_id|status|lesson_id|command|sender|receiver|message|payload|warnings|errors)"[\s\S]*?\}\s*/im, '');

    // 4. Loại bỏ khối JSON generic ở đầu trước khi bắt đầu bằng tiêu đề #
    text = text.replace(/^\s*\{[\s\S]*?\}\s*(?=\n\s*#)/m, '');

    // 5. Loại bỏ khối YAML frontmatter ở đầu (ví dụ --- ... --- hoặc ```yaml ... ```)
    text = text.replace(/^---\s*\n[\s\S]*?\n---\s*/m, '');
    text = text.replace(/^```(?:yaml)?\s*[\s\S]*?```\s*/im, '');

    // 6. Loại bỏ các dòng lệnh metadata lặp lại (LỆNH THỰC THI: ..., MÃ BÀI HỌC: ...)
    text = text.replace(/^(?:LỆNH THỰC THI|MÃ BÀI HỌC|MÃ CÔNG VIỆC|JOB_ID|COMMAND):[^\n]*\n+/gim, '');

    return text.trim();
  }

  /**
   * Chuẩn hóa văn bản trước khi đưa vào Word Document Builder
   */
  public static normalize(markdown: string): string {
    if (!markdown) return '';

    // 1. Làm sạch JSON và metadata ở đầu
    let text = this.cleanMetadata(markdown);

    // 2. Loại bỏ các câu hội thoại chatbot thừa
    for (const pattern of this.BOILERPLATE_PATTERNS) {
      text = text.replace(pattern, '');
    }

    // 3. Chuẩn hóa khoảng trắng và dấu câu
    // Giữ nguyên dòng mới, nhưng bỏ nhiều dòng trắng thừa liên tiếp (> 2 dòng trống)
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    // 4. Chuẩn hóa khoảng trắng trước dấu câu (ngoài khối code/math)
    // Ví dụ: 'abc .' -> 'abc.', 'abc ,' -> 'abc,'
    text = text.replace(/\s+([.,;:?!])(?=\s|$)/g, '$1');

    // 5. Loại bỏ các ký tự điều khiển không in được (trừ newline & tab)
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return text.trim();
  }
}
