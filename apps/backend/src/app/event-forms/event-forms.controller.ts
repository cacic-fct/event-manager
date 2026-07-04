import { Controller, Get, Header, MessageEvent, Param, Query, Req, Res, Sse } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { EventFormTargetType } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EventFormsService } from './event-forms.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@ApiTags('event-forms')
@Controller('event-forms')
export class EventFormsController {
  constructor(private readonly forms: EventFormsService) {}

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
  streamResults(@Param('formId') formId: string): Observable<MessageEvent> {
    return this.forms.watchResults(formId);
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
  ): Observable<MessageEvent> {
    return this.forms.watchCurrentUserResults(
      { req: request },
      {
        formId,
        targetType,
        eventId,
        majorEventId,
      },
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
          example: 'Resposta,Pessoa,E-mail,Enviado em,Tamanho da camiseta\nform-response-1,Ada Lovelace,ada@example.edu,2026-06-28T23:00:00.000Z,M',
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
    const csv = await this.forms.exportAdminResultsCsv(request.user, formId);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="form-results-${formId}.csv"`);
    response.send(csv);
  }
}
