import { Controller, Get, Header, Headers, NotFoundException, Param, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { CertificatePreviewService } from './certificate-preview.service';

@ApiTags('Certificates')
@Controller('certificates/validate')
export class CertificatePreviewController {
  constructor(private readonly previews: CertificatePreviewService) {}

  @Get(':certificateId/preview')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicCertificatePreview)
  @Header('Cache-Control', 'private, no-store')
  @Header('Cross-Origin-Resource-Policy', 'same-origin')
  @ApiOperation({ summary: 'Read an existing AVIF preview using the token returned by public verification.' })
  @ApiProduces('image/avif')
  @ApiOkResponse({ description: 'Certificate first-page preview', schema: { type: 'string', format: 'binary' } })
  async getPreview(
    @Param('certificateId') certificateId: string,
    @Headers('x-certificate-preview-token') token?: string,
  ): Promise<StreamableFile> {
    const image = token ? await this.previews.read(certificateId, token) : null;
    if (!image) {
      throw new NotFoundException();
    }
    return new StreamableFile(image, { type: 'image/avif', length: image.length });
  }
}
