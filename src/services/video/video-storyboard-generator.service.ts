import { GeminiService } from '@/services/ai/gemini.service';
import {
  GenerateStoryboardRequest,
  StoryboardScene,
  VideoStoryboardData,
} from '@/types/video-storyboard.types';

export class VideoStoryboardGeneratorService {
  /**
   * Phân tích KHDH và tạo Bảng Storyboard Phân cảnh & Bộ Prompt AI Video chuyên nghiệp
   */
  public static async generateFromKhdh(req: GenerateStoryboardRequest): Promise<{
    storyboard: VideoStoryboardData;
    keyUsed?: string;
  }> {
    const keyPool = GeminiService.resolveKeyPool(undefined, req.apiKeys);
    const videoStyle =
      req.videoStyle ||
      '3D Educational Animation (Pixar/Disney 3D Style, 8K Octane Render, Bright Studio Lighting)';
    const targetDuration = req.targetDuration || '90 giây (Micro-learning 5 phân cảnh)';

    const systemPrompt = [
      'Bạn là Đạo diễn Video Giáo dục kiêm Chuyên gia Prompt AI Video hàng đầu thế giới (Runway Gen-3 Alpha, Kling AI 1.5, OpenAI Sora, Luma Dream Machine).',
      'Nhiệm vụ: Phân tích Kế hoạch bài dạy (KHDH) và tạo kịch bản Video Micro-learning 5 phân cảnh chuẩn sư phạm hiện đại.',
      '',
      '## CẤU TRÚC 5 PHÂN CẢNH BẮT BUỘC:',
      '1. Phân cảnh 1 (00:00 - 00:15): Hook mở đầu - Tình huống thực tế gây tò mò, bất ngờ.',
      '2. Phân cảnh 2 (00:15 - 00:40): Trực quan hóa khái niệm - Đồ họa 3D biến đổi biểu thức toán học sống động.',
      '3. Phân cảnh 3 (00:40 - 01:05): Phân tích & Hướng dẫn từng bước - Minh họa phương pháp giải cụ thể.',
      '4. Phân cảnh 4 (01:05 - 01:20): Thử thách tương tác - Câu đố tư duy nhanh dừng hình 5 giây cho học sinh.',
      '5. Phân cảnh 5 (01:20 - 01:30): Tổng kết & Truyền cảm hứng - Đúc kết công thức vàng và liên hệ thực tiễn.',
      '',
      '## YÊU CẦU ĐẶC BIỆT CHO AI VIDEO PROMPT (aiVideoPrompt):',
      '- Prompt PHẢI viết bằng TIẾNG ANH CHUYÊN NGHIỆP cho Runway Gen-3 / Kling / Sora.',
      '- Cấu trúc prompt gồm 5 thành phần: [Subject & Action], [3D Math Graphic / Environment], [Camera Motion & Lens], [Lighting & Color Grade], [Render Quality & Style].',
      '- Ví dụ: "A cinematic 3D Pixar-style animated math scene. A glowing golden algebraic equation transforms smoothly in mid-air inside a modern high-tech laboratory. Slow push-in dolly camera shot, 50mm lens, f/1.8 shallow depth of field. Soft studio volumetric lighting, vibrant purple and cyan colors, 8k octane render, hyper-detailed, educational motion graphics --no low quality, blurry text, distorted anatomy."',
      '',
      '## YÊU CẦU ĐẦU RA JSON BẮT BUỘC:',
      'Bạn PHẢI trả về ĐÚNG MỘT JSON OBJECT theo cấu trúc dưới đây (KHÔNG có markdown bao ngoài, KHÔNG có text chào hỏi):',
      '{',
      '  "lessonTitle": "Tên bài học",',
      '  "lessonCode": "' + (req.lessonCode || 'TOAN-8') + '",',
      '  "totalDuration": "90 giây",',
      '  "videoStyle": "' + videoStyle + '",',
      '  "targetAudience": "Học sinh THCS",',
      '  "masterPromptSummary": "Prompt tóm tắt toàn bộ video",',
      '  "scenes": [',
      '    {',
      '      "sceneNumber": 1,',
      '      "title": "Phân cảnh 1: Hook thực tế",',
      '      "duration": "15s",',
      '      "visualDescription": "Mô tả hình ảnh trực quan chi tiết bằng tiếng Việt",',
      '      "voiceoverScript": "Lời bình / Lời dẫn sư phạm truyền cảm bằng tiếng Việt",',
      '      "onScreenText": "Chữ hoặc công thức LaTeX hiển thị trên màn hình",',
      '      "aiVideoPrompt": "English video generation prompt for Runway/Kling/Sora",',
      '      "audioPrompt": "Gợi ý nhạc nền sống động + tiếng động SFX"',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const userMessage = [
      'MÃ BÀI HỌC: ' + (req.lessonCode || 'TOÁN THCS'),
      'PHONG CÁCH VIDEO: ' + videoStyle,
      'THỜI LƯỢNG MỤC TIÊU: ' + targetDuration,
      'DƯỚI ĐÂY LÀ BẢN THẢO KHDH ĐỂ TẠO KỊCH BẢN VIDEO:',
      '----------------------------------------',
      req.khdhDraft,
      '----------------------------------------',
      'Hãy tạo JSON Storyboard hoàn chỉnh và bộ AI Prompts đỉnh cao bám sát KHDH trên.',
    ].join('\n');

    let storyboard: VideoStoryboardData;
    let keyUsed: string | undefined;

    try {
      const result = await GeminiService.generateContent({
        apiKeys: keyPool,
        systemPrompt,
        userMessage,
        model: 'flash',
      });
      keyUsed = result.keyUsed;

      let cleanText = result.text.trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
      storyboard = JSON.parse(cleanText);
    } catch {
      // Fallback storyboard chất lượng cao
      storyboard = VideoStoryboardGeneratorService.buildFallbackStoryboard(
        req.lessonCode || 'TOÁN HỌC',
        videoStyle
      );
    }

    return {
      storyboard,
      keyUsed,
    };
  }

  /**
   * Tạo Storyboard dự phòng chuẩn mực
   */
  public static buildFallbackStoryboard(
    lessonCode: string,
    videoStyle: string
  ): VideoStoryboardData {
    return {
      lessonTitle: 'Đơn thức và Đa thức nhiều biến',
      lessonCode,
      totalDuration: '90 giây (Micro-learning 5 phân cảnh)',
      videoStyle,
      targetAudience: 'Học sinh THCS Lớp 8',
      masterPromptSummary:
        'A complete 90-second 3D educational video explaining algebra with Pixar style animation and glowing holographic formulas.',
      scenes: [
        {
          sceneNumber: 1,
          title: 'Phân cảnh 1: Hook thực tế - Khu vườn hình học bí ẩn',
          duration: '15s',
          visualDescription:
            'Góc máy mở rộng nhìn vào một khu vườn hình chữ nhật hiện đại. Một robot giáo viên vui nhộn đang đo đạc các cạnh có chiều dài x và y. Các khối lập phương phát sáng màu xanh ngọc bích.',
          voiceoverScript:
            'Chào các em! Đã bao giờ các em tự hỏi làm thế nào để tính nhanh diện tích của cả một khu đô thị thông minh chỉ bằng một biểu thức toán học duy nhất chưa? Hãy cùng khám phá ngay nhé!',
          onScreenText: 'Diện tích S = 2x^2 + 3xy (m^2)',
          aiVideoPrompt:
            'A vibrant 3D Pixar-style animation, establishing drone shot moving over a futuristic modular garden. A friendly robotic teacher measures digital glowing terrain with laser lines showing variables x and y. Bright cinematic sunlight, soft ambient occlusion, octane render 8k --ar 16:9',
          audioPrompt: 'Upbeat electronic intro music, futuristic laser scan sound FX.',
        },
        {
          sceneNumber: 2,
          title: 'Phân cảnh 2: Khám phá khái niệm Đơn thức & Bậc',
          duration: '25s',
          visualDescription:
            'Không gian phòng thí nghiệm tương lai. Một khối tinh thể toán học mang ký hiệu 3x^2y bay lơ lửng, sau đó tách thành Hệ số (số 3) và Phần biến (x^2y) với hiệu ứng ánh sáng neon.',
          voiceoverScript:
            'Trước hết, đơn thức là một biểu thức chỉ gồm một số, hoặc một biến, hoặc một tích giữa các số và các biến. Nhìn xem: 3 là hệ số, còn x mũ 2 nhân y là phần biến!',
          onScreenText: 'Đơn thức: 3x^2y | Hệ số: 3 | Bậc: 2 + 1 = 3',
          aiVideoPrompt:
            'Cinematic close-up shot inside a high-tech holographic classroom. Floating glowing 3D formula "3x^2y" smoothly splits into glowing number 3 and neon blue variables x and y. Smooth camera rotation, studio volumetric lighting, depth of field f/2.0, 8k render --ar 16:9',
          audioPrompt: 'Gentle inspiring synthesizer melody, crystal ping sound FX on formula split.',
        },
        {
          sceneNumber: 3,
          title: 'Phân cảnh 3: Thu gọn Đa thức bằng Phép màu Gom nhóm',
          duration: '25s',
          visualDescription:
            'Các khối hộp mang nhãn đơn thức đồng dạng (cùng màu cam) tự động hút lại gần nhau như nam châm và sáp nhập thành một khối lớn hơn, các số hạng khác loại giữ nguyên vị trí.',
          voiceoverScript:
            'Khi gặp nhiều đơn thức, ta chỉ cần tìm các đơn thức đồng dạng - tức là có cùng phần biến - rồi cộng các hệ số lại với nhau. Cực kỳ đơn giản phải không nào!',
          onScreenText: '2x^2y + 3x^2y = (2 + 3)x^2y = 5x^2y',
          aiVideoPrompt:
            'Dynamic 3D motion graphics showing glowing math blocks attracting each other like magnetic particles. The terms 2x^2y and 3x^2y merge into a shining 5x^2y block with particle burst effects. Smooth dolly-in camera motion, clean minimalist pastel background, 4k ultra-crisp --ar 16:9',
          audioPrompt: 'Magnetic snap sound, energetic chime burst upon successful merging.',
        },
        {
          sceneNumber: 4,
          title: 'Phân cảnh 4: Thử thách 5 giây Thám tử Toán học',
          duration: '15s',
          visualDescription:
            'Đồng hồ cát điện tử đếm ngược 5 giây. Một câu hỏi xuất hiện giữa màn hình với 3 phương án lựa chọn được viền đèn neon nhấp nháy.',
          voiceoverScript:
            'Bây giờ đến lượt các em! Hãy thử xem bậc của đa thức này là bao nhiêu trong 5 giây nhé: 3... 2... 1... Chính xác, bậc là 4!',
          onScreenText: 'Thử thách: Bậc của P = 4x^3y - 2xy^2 + 5 là bao nhiêu?',
          aiVideoPrompt:
            'Engaging game-show style 3D environment with a glowing digital countdown timer (5, 4, 3, 2, 1). Floating interactive multiple choice cards glowing with golden neon outlines. Dynamic fast zoom-in camera, high energy lighting, 8k resolution --ar 16:9',
          audioPrompt: 'Ticking clock sound effect, triumphant correct answer victory fanfare.',
        },
        {
          sceneNumber: 5,
          title: 'Phân cảnh 5: Đúc kết Bí quyết & Lời chào tạm biệt',
          duration: '10s',
          visualDescription:
            'Thầy giáo robot mỉm cười giơ ngón tay cái, đằng sau là sơ đồ tư duy Mindmap phát sáng tổng hợp toàn bộ bài học. Dòng chữ kêu gọi hành động hiện ra.',
          voiceoverScript:
            'Hãy luôn nhớ: Nắm chắc phần biến, thu gọn đồng dạng - mọi bài toán đại số đều trởno thật dễ dàng. Hẹn gặp lại các em ở bài học tiếp theo!',
          onScreenText: 'Bí quyết vàng: Nhận diện phần biến -> Gom nhóm đồng dạng!',
          aiVideoPrompt:
            'Heartwarming 3D character animation of a cute friendly math robot giving a thumbs up. In the background, a beautiful glowing holographic mindmap summarizing the algebra lesson fades in softly. Warm studio lighting, depth of field, cinematic render 8k --ar 16:9',
          audioPrompt: 'Warm, uplifting orchestral outro music fading out smoothly.',
        },
      ],
    };
  }
}
