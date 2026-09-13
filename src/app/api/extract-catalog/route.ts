import { NextRequest, NextResponse } from 'next/server';
import { CatalogExtractorService } from '@/services/catalog/catalog-extractor.service';
import { ExtractCatalogRequest } from '@/types/curriculum-catalog.types';
import { resolveUserProjectIdFromRequest } from '@/lib/user-workspace';

export async function POST(req: NextRequest) {
  try {
    const body: ExtractCatalogRequest = await req.json().catch(() => ({}));

    const targetProject = await resolveUserProjectIdFromRequest(req, body.projectId);

    const { catalog, markdownSummary, keyUsed } = await CatalogExtractorService.extractCatalog({
      ...body,
      projectId: targetProject,
    });

    return NextResponse.json({
      success: true,
      catalog,
      markdownSummary,
      keyUsed,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi khi trích xuất danh mục bài học.';
    console.error('API Error in /api/extract-catalog:', error);
    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}
