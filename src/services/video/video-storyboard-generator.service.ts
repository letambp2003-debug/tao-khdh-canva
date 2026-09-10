import { GeminiService } from '@/services/ai/gemini.service';
import {
  GenerateStoryboardRequest,
  StoryboardScene,
  VideoStoryboardData,
} from '@/types/video-storyboard.types';

export class VideoStoryboardGeneratorService {
  /**
   * Phân tích KHDH và tạo Bảng Storyboard Phân cảnh & Bộ Prompt AI Video chuyên nghiệp
   * Đảm bảo MỖI CẢNH đều có đủ: Prompt Ảnh (Midjourney/Flux), Prompt Video (Runway/Kling/Sora), Lời thoại tiếng Việt.
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
      'Bạn là Đạo diễn Video Giáo dục kiêm Chuyên gia Prompt AI Đỉnh Cao (Midjourney v6, Flux.1, Runway Gen-3 Alpha, Kling AI 1.5, OpenAI Sora).',
      'Nhiệm vụ: Phân tích Kế hoạch bài dạy (KHDH) và tạo kịch bản Video Micro-learning 5 phân cảnh chuẩn sư phạm.',
      '',
      '## YÊU CẦU BẮT BUỘC CHO MỖI PHÂN CẢNH (SCENE):',
      'Mỗi phân cảnh BẮT BUỘC phải có đầy đủ 4 thành phần riêng biệt:',
      '1. imagePrompt (Prompt Ảnh cho Midjourney / Flux / DALL-E 3): Prompt tiếng Anh chuyên nghiệp tạo ảnh tĩnh Keyframe / Thumbnail mở đầu phân cảnh (chi tiết góc chụp, ánh sáng, phong cách 3D Pixar, --ar 16:9).',
      '2. videoPrompt (Prompt Video cho Runway Gen-3 Alpha / Kling 1.5 / Sora): Prompt tiếng Anh chuyển động video (chuyển động camera, dynamic action, hạt ánh sáng, hạt công thức toán bay lơ lửng, chất lượng 4k 60fps).',
      '3. voiceoverScript (Lời thoại Tiếng Việt): Lời thoại thuyết minh sư phạm của giáo viên bằng tiếng Việt chuẩn, hấp dẫn, dễ hiểu, có cảm xúc.',
      '4. visualDescription (Mô tả thị giác) & onScreenText (Chữ/Công thức Toán LaTeX trên màn hình).',
      '',
      '## CẤU TRÚC 5 PHÂN CẢNH:',
      '- Cảnh 1 (00:00 - 00:15): Hook mở đầu - Tình huống thực tế gây tò mò, bất ngờ.',
      '- Cảnh 2 (00:15 - 00:40): Trực quan hóa khái niệm - Đồ họa 3D biến đổi biểu thức toán học sống động.',
      '- Cảnh 3 (00:40 - 01:05): Phân tích & Hướng dẫn từng bước - Minh họa phương pháp giải cụ thể.',
      '- Cảnh 4 (01:05 - 01:20): Thử thách tương tác - Câu đố tư duy nhanh dừng hình 5 giây cho học sinh.',
      '- Cảnh 5 (01:20 - 01:30): Tổng kết & Truyền cảm hứng - Đúc kết công thức vàng và liên hệ thực tiễn.',
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
      '      "onScreenText": "Chữ hoặc công thức LaTeX hiển thị trên màn hình",',
      '      "imagePrompt": "English keyframe image prompt for Midjourney/Flux (--ar 16:9)",',
      '      "videoPrompt": "English video motion prompt for Runway Gen-3 / Kling 1.5 / Sora",',
      '      "voiceoverScript": "Lời thoại / Thuyết minh tiếng Việt chuẩn sư phạm",',
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
      'Hãy tạo JSON Storyboard hoàn chỉnh có đầy đủ Prompt Ảnh, Prompt Video, Lời thoại tiếng Việt cho từng phân cảnh.',
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

      // Đảm bảo tương thích các trường prompt
      if (storyboard?.scenes && Array.isArray(storyboard.scenes)) {
        storyboard.scenes = storyboard.scenes.map((s, idx) => ({
          ...s,
          sceneNumber: s.sceneNumber || idx + 1,
          videoPrompt: s.videoPrompt || s.aiVideoPrompt || '',
          aiVideoPrompt: s.videoPrompt || s.aiVideoPrompt || '',
          imagePrompt: s.imagePrompt || (s.videoPrompt ? `${s.videoPrompt} --ar 16:9` : ''),
        }));
      }
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
   * Tạo Storyboard dự phòng chuẩn mực với đầy đủ Prompt Ảnh, Video, Lời thoại
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
        'A complete 90-second 3D educational video explaining algebra with Pixar style animation, glowing holographic formulas, and engaging Vietnamese voiceover.',
      scenes: [
        {
          sceneNumber: 1,
          title: 'Phân cảnh 1: Hook thực tế - Khu vườn hình học bí ẩn',
          duration: '15s',
          visualDescription:
            'Góc máy mở rộng nhìn vào một khu vườn hình chữ nhật hiện đại. Một robot giáo viên vui nhộn đang đo đạc các cạnh có chiều dài x và y. Các khối lập phương phát sáng màu xanh ngọc bích.',
          onScreenText: 'Diện tích S = 2x^2 + 3xy (m^2)',
          imagePrompt:
            'A high-end 3D Pixar-style digital illustration of a futuristic modular garden with a cute friendly robot teacher holding a glowing measuring laser tape. Holographic mathematical labels \"x\" and \"y\" floating above geometric grass plots. Warm cinematic morning sunlight, vibrant colors, shallow depth of field, octane render 8k --ar 16:9 --stylize 250',
          videoPrompt:
            'Cinematic drone camera smoothly descending and pushing in toward a cute 3D robot teacher measuring a high-tech modular garden. Neon laser lines sketch the boundaries displaying glowing variables x and y. Soft ambient lighting, volumetric sunlight rays, ultra-smooth motion graphics, 4k 60fps --ar 16:9',
          aiVideoPrompt:
            'Cinematic drone camera smoothly descending and pushing in toward a cute 3D robot teacher measuring a high-tech modular garden. Neon laser lines sketch the boundaries displaying glowing variables x and y. Soft ambient lighting, volumetric sunlight rays, ultra-smooth motion graphics, 4k 60fps --ar 16:9',
          voiceoverScript:
            'Chào các em! Đã bao giờ các em tự hỏi làm thế nào để tính nhanh diện tích của cả một khu đô thị thông minh chỉ bằng một biểu thức toán học duy nhất chưa? Hãy cùng khám phá ngay nhé!',
          audioPrompt: 'Upbeat electronic intro music, futuristic laser scan sound FX.',
        },
        {
          sceneNumber: 2,
          title: 'Phân cảnh 2: Khám phá khái niệm Đơn thức & Bậc',
          duration: '25s',
          visualDescription:
            'Không gian phòng thí nghiệm tương lai. Một khối tinh thể toán học mang ký hiệu 3x^2y bay lơ lửng, sau đó tách thành Hệ số (số 3) và Phần biến (x^2y) với hiệu ứng ánh sáng neon.',
          onScreenText: 'Đơn thức: 3x^2y | Hệ số: 3 | Bậc: 2 + 1 = 3',
          imagePrompt:
            'Macro 3D render of a luminous crystal mathematical emblem \"3x^2y\" hovering inside a futuristic glass science laboratory. The number 3 glows in warm golden amber, while variables x^2y glow in electric cyan. Soft studio backlight, Pixar style, pristine glass reflections, 8k resolution --ar 16:9',
          videoPrompt:
            'Slow orbital 360-degree camera shot around a floating glowing mathematical formula \"3x^2y\". The formula smoothly separates into the amber coefficient number 3 and neon blue variable cluster x^2y with gentle sparkling particle effects. Volumetric studio lighting, depth of field f/1.8, 4k --ar 16:9',
          aiVideoPrompt:
            'Slow orbital 360-degree camera shot around a floating glowing mathematical formula \"3x^2y\". The formula smoothly separates into the amber coefficient number 3 and neon blue variable cluster x^2y with gentle sparkling particle effects. Volumetric studio lighting, depth of field f/1.8, 4k --ar 16:9',
          voiceoverScript:
            'Trước hết, đơn thức là một biểu thức chỉ gồm một số, hoặc một biến, hoặc một tích giữa các số và các biến. Nhìn xem: 3 là hệ số, còn x mũ 2 nhân y là phần biến!',
          audioPrompt: 'Gentle inspiring synthesizer melody, crystal ping sound FX on formula split.',
        },
        {
          sceneNumber: 3,
          title: 'Phân cảnh 3: Thu gọn Đa thức bằng Phép màu Gom nhóm',
          duration: '25s',
          visualDescription:
            'Các khối hộp mang nhãn đơn thức đồng dạng (cùng màu cam) tự động hút lại gần nhau như nam châm và sáp nhập thành một khối lớn hơn, các số hạng khác loại giữ nguyên vị trí.',
          onScreenText: '2x^2y + 3x^2y = (2 + 3)x^2y = 5x^2y',
          imagePrompt:
            'Stylized 3D educational graphics showing vibrant isometric magnetic math blocks on a clean wooden tabletop. Blocks labeled 2x^2y and 3x^2y snapping together with magical golden magnetic field lines. Clean minimalist design, soft pastel aesthetic, Pixar 3D quality --ar 16:9',
          videoPrompt:
            'Dynamic slow-motion push-in shot. Two orange magnetic math cubes labeled 2x^2y and 3x^2y attract each other rapidly and merge into a single shining 5x^2y cube with a radiant shockwave of golden sparkles. Smooth physics, crisp motion blur, high-tech educational animation --ar 16:9',
          aiVideoPrompt:
            'Dynamic slow-motion push-in shot. Two orange magnetic math cubes labeled 2x^2y and 3x^2y attract each other rapidly and merge into a single shining 5x^2y cube with a radiant shockwave of golden sparkles. Smooth physics, crisp motion blur, high-tech educational animation --ar 16:9',
          voiceoverScript:
            'Khi gặp nhiều đơn thức, ta chỉ cần tìm các đơn thức đồng dạng - tức là có cùng phần biến - rồi cộng các hệ số lại với nhau. Cực kỳ đơn giản phải không nào!',
          audioPrompt: 'Magnetic snap sound, energetic chime burst upon successful merging.',
        },
        {
          sceneNumber: 4,
          title: 'Phân cảnh 4: Thử thách 5 giây Thám tử Toán học',
          duration: '15s',
          visualDescription:
            'Đồng hồ cát điện tử đếm ngược 5 giây. Một câu hỏi xuất hiện giữa màn hình với 3 phương án lựa chọn được viền đèn neon nhấp nháy.',
          onScreenText: 'Thử thách: Bậc của P = 4x^3y - 2xy^2 + 5 là bao nhiêu?',
          imagePrompt:
            'High-energy 3D educational game show studio with a glowing holographic digital countdown timer showing \"05\". Floating neon quiz cards displaying algebraic options A, B, and C with glowing golden borders. Dramatic purple and gold rim lighting, 8k render --ar 16:9',
          videoPrompt:
            'Fast dynamic zoom-in camera transitioning into an interactive quiz scene. Digital timer numbers count down 5, 4, 3, 2, 1 with pulsing neon rings. The correct answer card lights up with emerald green firework sparks. Game show excitement, 60fps smooth motion --ar 16:9',
          aiVideoPrompt:
            'Fast dynamic zoom-in camera transitioning into an interactive quiz scene. Digital timer numbers count down 5, 4, 3, 2, 1 with pulsing neon rings. The correct answer card lights up with emerald green firework sparks. Game show excitement, 60fps smooth motion --ar 16:9',
          voiceoverScript:
            'Bây giờ đến lượt các em! Hãy thử xem bậc của đa thức này là bao nhiêu trong 5 giây nhé: 3... 2... 1... Chính xác, bậc là 4!',
          audioPrompt: 'Ticking clock sound effect, triumphant correct answer victory fanfare.',
        },
        {
          sceneNumber: 5,
          title: 'Phân cảnh 5: Đúc kết Bí quyết & Lời chào tạm biệt',
          duration: '10s',
          visualDescription:
            'Thầy giáo robot mỉm cười giơ ngón tay cái, đằng sau là sơ đồ tư duy Mindmap phát sáng tổng hợp toàn bộ bài học. Dòng chữ kêu gọi hành động hiện ra.',
          onScreenText: 'Bí quyết vàng: Nhận diện phần biến -> Gom nhóm đồng dạng!',
          imagePrompt:
            'Warm and heartwarming 3D Pixar-style scene of a cute friendly robot teacher giving a cheerful thumbs up to the camera. Behind him, a glowing holographic mindmap diagram connects all mathematical algebra concepts with golden lines. Soft cozy studio lighting, 8k render --ar 16:9',
          videoPrompt:
            'Gentle pull-out camera shot as the friendly 3D robot teacher smiles, waves, and gives a confident thumbs up. The background holographic concept map gently pulses with warm golden light before fading into the lesson takeaway banner. Emotional and inspiring finish, 4k render --ar 16:9',
          aiVideoPrompt:
            'Gentle pull-out camera shot as the friendly 3D robot teacher smiles, waves, and gives a confident thumbs up. The background holographic concept map gently pulses with warm golden light before fading into the lesson takeaway banner. Emotional and inspiring finish, 4k render --ar 16:9',
          voiceoverScript:
            'Hãy luôn nhớ: Nắm chắc phần biến, thu gọn đồng dạng - mọi bài toán đại số đều trở nên thật dễ dàng. Hẹn gặp lại các em ở bài học tiếp theo!',
          audioPrompt: 'Warm, uplifting orchestral outro music fading out smoothly.',
        },
      ],
    };
  }
}

