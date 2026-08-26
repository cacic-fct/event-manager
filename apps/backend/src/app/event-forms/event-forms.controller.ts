import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { defer, Observable, switchMap } from 'rxjs';
import { EventFormTargetType } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EventFormsService } from './event-forms.service';
import { SseReplayService } from '../realtime/sse-replay.service';
import { EventFormImagesService } from './event-form-images.service';
import {
  EVENT_FORM_IMAGE_FORMAT_ERROR,
  MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES,
  UploadedEventFormImageFile,
  isAllowedEventFormImageMimeType,
} from './event-form-image.utils';

type RequestWithUser = Request & { user?: AuthenticatedUser };

class EventFormImageUploadBodyDto {
  @ApiProperty({ description: 'Imagem da descrição do formulário ou de um item.', type: 'string', format: 'binary' })
  file!: unknown;

  @ApiPropertyOptional({ description: 'Evento proprietário ao criar um formulário.' })
  ownerEventId?: string;

  @ApiPropertyOptional({ description: 'Grande evento proprietário ao criar um formulário.' })
  ownerMajorEventId?: string;
}

const EVENT_FORM_IMAGE_UPLOAD_OPTIONS = {
  limits: { fileSize: MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (
    _request: unknown,
    file: UploadedEventFormImageFile,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!isAllowedEventFormImageMimeType(file.mimetype)) {
      callback(new BadRequestException(EVENT_FORM_IMAGE_FORMAT_ERROR), false);
      return;
    }
    callback(null, true);
  },
};

const EVENT_FORM_IMAGE_EXAMPLE = {
  id: '01991f8d-0d4f-7b57-a1ba-bba7505a61d5',
  url: '/api/event-forms/images/01991f8d-0d4f-7b57-a1ba-bba7505a61d5',
  width: 1600,
  height: 900,
};

@ApiTags('event-forms')
@Controller('event-forms')
export class EventFormsController {
  constructor(
    private readonly forms: EventFormsService,
    private readonly replay: SseReplayService,
    private readonly images: EventFormImagesService,
  ) {}

  @Post('images')
  @UseInterceptors(FileInterceptor('file', EVENT_FORM_IMAGE_UPLOAD_OPTIONS))
  @ApiOperation({
    summary: 'Enviar uma imagem temporária durante a criação de um formulário',
    description: 'Valida, converte para AVIF e armazena temporariamente uma imagem antes da criação do formulário.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: EventFormImageUploadBodyDto })
  @ApiCreatedResponse({
    description: 'Metadados da imagem AVIF temporária armazenada no S3.',
    schema: { example: EVENT_FORM_IMAGE_EXAMPLE },
  })
  uploadPendingImage(
    @UploadedFile() file: UploadedEventFormImageFile | undefined,
    @Body() body: EventFormImageUploadBodyDto,
    @Req() request: RequestWithUser,
  ) {
    return this.images.uploadPending(file, request.user, body);
  }

  @Get('images/:imageId')
  @Header('Cache-Control', 'private, max-age=86400')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Ler uma imagem de formulário pelo identificador permanente',
    description: 'Retorna o conteúdo AVIF de uma imagem acessível ao usuário atual.',
  })
  @ApiParam({ name: 'imageId', description: 'Identificador da imagem.', example: EVENT_FORM_IMAGE_EXAMPLE.id })
  @ApiProduces('image/avif')
  async getImageById(
    @Param('imageId') imageId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.images.downloadById(imageId, request.user);
    response.setHeader('Content-Type', image.contentType);
    if (image.contentLength !== undefined) response.setHeader('Content-Length', String(image.contentLength));
    await pipeline(image.stream, response);
  }

  @Post(':formId/images')
  @RequirePermissions(Permission.EventForm.Update)
  @UseInterceptors(FileInterceptor('file', EVENT_FORM_IMAGE_UPLOAD_OPTIONS))
  @ApiOperation({
    summary: 'Enviar uma imagem permanente para um formulário',
    description: 'Valida, converte para AVIF e associa uma imagem ao formulário informado.',
  })
  @ApiParam({
    name: 'formId',
    description: 'Identificador do formulário.',
    example: '01991f8d-0d4f-7b57-a1ba-bba7505a61d5',
  })
  @ApiBearerAuth()
  @ApiForbiddenResponse({
    description: `Returned when the authenticated user does not have the required scope: ${Permission.EventForm.Update}.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: EventFormImageUploadBodyDto })
  @ApiCreatedResponse({
    description: 'Metadados da imagem AVIF armazenada no S3.',
    schema: { example: EVENT_FORM_IMAGE_EXAMPLE },
  })
  uploadImage(
    @Param('formId') formId: string,
    @UploadedFile() file: UploadedEventFormImageFile | undefined,
    @Req() request: RequestWithUser,
  ) {
    return this.images.upload(formId, file, request.user);
  }

  @Delete(':formId/images/:imageId')
  @RequirePermissions(Permission.EventForm.Update)
  @ApiOperation({
    summary: 'Excluir uma imagem de formulário',
    description: 'Exclui uma imagem sem referências ativas no formulário ou em rascunhos.',
  })
  @ApiParam({
    name: 'formId',
    description: 'Identificador do formulário.',
    example: '01991f8d-0d4f-7b57-a1ba-bba7505a61d5',
  })
  @ApiParam({ name: 'imageId', description: 'Identificador da imagem.', example: EVENT_FORM_IMAGE_EXAMPLE.id })
  @ApiBearerAuth()
  @ApiForbiddenResponse({
    description: `Returned when the authenticated user does not have the required scope: ${Permission.EventForm.Update}.`,
  })
  deleteImage(
    @Param('formId') formId: string,
    @Param('imageId') imageId: string,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    return this.images.delete(formId, imageId, request.user);
  }

  @Get(':formId/images/:imageId')
  @Header('Cache-Control', 'private, max-age=86400')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Ler uma imagem permanente de formulário',
    description: 'Retorna o conteúdo AVIF de uma imagem vinculada ao formulário, respeitando seu acesso.',
  })
  @ApiParam({
    name: 'formId',
    description: 'Identificador do formulário.',
    example: '01991f8d-0d4f-7b57-a1ba-bba7505a61d5',
  })
  @ApiParam({ name: 'imageId', description: 'Identificador da imagem.', example: EVENT_FORM_IMAGE_EXAMPLE.id })
  @ApiProduces('image/avif')
  async getImage(
    @Param('formId') formId: string,
    @Param('imageId') imageId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.images.download(formId, imageId, request.user);
    response.setHeader('Content-Type', image.contentType);
    if (image.contentLength !== undefined) response.setHeader('Content-Length', String(image.contentLength));
    await pipeline(image.stream, response);
  }

  @Sse(':formId/results/events')
  @RequirePermissions(Permission.EventForm.Results)
  @ApiOperation({
    summary: 'Stream form result updates',
    description: 'Server-Sent Events stream used by admin result charts to refresh after new form submissions.',
  })
  @ApiParam({
    name: 'formId',
    description: 'Form identifier.',
    example: 'form-01j1f4k8q2y7w3x9z0m5n6p7r8',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'SSE stream emitting form result delta events.',
    schema: {
      example: {
        data: {
          formId: 'form-01j1f4k8q2y7w3x9z0m5n6p7r8',
          updatedAt: '2026-06-28T23:00:00.000Z',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: `Returned when the authenticated user does not have the required scope: ${Permission.EventForm.Results}.`,
  })
  streamResults(
    @Param('formId') formId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return this.replay.replay(
      this.replay.scope('event-form-results', formId),
      lastEventId,
      this.forms.watchResults(formId),
    );
  }

  @Sse(':formId/current-user-results/events')
  @ApiOperation({
    summary: 'Stream current-user form result updates',
    description:
      'Server-Sent Events stream used by public form result views when live updates are enabled for the form.',
  })
  @ApiParam({
    name: 'formId',
    description: 'Form identifier.',
    example: 'form-01j1f4k8q2y7w3x9z0m5n6p7r8',
  })
  @ApiQuery({
    name: 'targetType',
    enum: EventFormTargetType,
    description: 'Target type used to scope the public result visibility check.',
  })
  @ApiQuery({
    name: 'eventId',
    required: false,
    description: 'Event identifier when targetType is EVENT.',
  })
  @ApiQuery({
    name: 'majorEventId',
    required: false,
    description: 'Major event identifier when targetType is MAJOR_EVENT.',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'SSE stream emitting form result update notices for the current user.',
    schema: {
      example: {
        data: {
          formId: 'form-01j1f4k8q2y7w3x9z0m5n6p7r8',
          updatedAt: '2026-06-28T23:00:00.000Z',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Returned when the current person cannot view live results for the selected form target.',
  })
  @ApiBearerAuth()
  streamCurrentUserResults(
    @Param('formId') formId: string,
    @Query('targetType') targetType: EventFormTargetType,
    @Query('eventId') eventId: string | undefined,
    @Query('majorEventId') majorEventId: string | undefined,
    @Req() request: RequestWithUser,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    const context = { req: request };
    const input = {
      formId,
      targetType,
      eventId,
      majorEventId,
    };

    return defer(() => this.forms.assertCurrentUserLiveResultsAccess(context, input)).pipe(
      switchMap(() =>
        this.replay.replay(
          this.replay.scope('event-form-results', formId),
          lastEventId,
          this.forms.watchCurrentUserResults(context, input),
        ),
      ),
    );
  }

  @Get(':formId/results.csv')
  @RequirePermissions(Permission.EventForm.Export)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Export form results as CSV',
    description: 'Exports individual form answers respecting the administrative export permission.',
  })
  @ApiParam({
    name: 'formId',
    description: 'Form identifier.',
    example: 'form-01j1f4k8q2y7w3x9z0m5n6p7r8',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'CSV file with form answers.',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          example:
            'Resposta,Pessoa,E-mail,Enviado em,Tamanho da camiseta\nform-response-1,Ada Lovelace,ada@example.edu,2026-06-28T23:00:00.000Z,M',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: `Returned when the authenticated user does not have the required scope: ${Permission.EventForm.Export}.`,
  })
  async exportResultsCsv(
    @Param('formId') formId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.forms.streamAdminResultsCsv(request.user, formId);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="form-results-${formId}.csv"`);
    await pipeline(csv, response);
  }
}
