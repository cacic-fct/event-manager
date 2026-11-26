import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { McpAdminSessionGuard } from '../mcp-admin-session.guard';
import { mcpUserId, type McpAuthenticatedRequest } from '../mcp-admin-principal';
import { McpAdminFileArtifactService } from './artifact-files';

@Public()
@UseGuards(McpAdminSessionGuard)
@ApiTags('MCP administrativo')
@ApiCookieAuth()
@Controller('admin/mcp/operations/proposals')
export class McpAdminArtifactController {
  constructor(private readonly artifacts: McpAdminFileArtifactService) {}

  @Get(':proposalId/files/:artifactId')
  @ApiOperation({ summary: 'Inspecionar um arquivo privado vinculado à própria proposta pendente.' })
  async file(
    @Req() req: McpAuthenticatedRequest,
    @Param('proposalId') proposalId: string,
    @Param('artifactId') artifactId: string,
    @Res() response: Response,
  ) {
    const file = await this.artifacts.reviewFile(mcpUserId(req.user), artifactId, proposalId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    response.send(file.bytes);
  }
}
