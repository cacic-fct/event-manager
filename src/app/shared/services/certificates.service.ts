import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { EventItem } from 'src/app/shared/services/event';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { DocumentReference } from '@angular/fire/firestore';
import { Timestamp } from '@firebase/firestore-types';
import { Observable, take, switchMap, combineLatest, map, mergeMap, forkJoin, of } from 'rxjs';
import { Injectable, isDevMode } from '@angular/core';
import { format as formatDate } from 'date-fns';

import { Template, generate as PDFGenerate } from '@pdfme/generator';
import { HttpClient } from '@angular/common/http';
import { ptBR } from 'date-fns/locale';

@Injectable({
  providedIn: 'root',
})
export class CertificateService {
  constructor(private afs: AngularFirestore, private http: HttpClient) {}

  generateCertificate(
    eventID: string,
    certificateStoreData: CertificateStoreData,
    certificateUserData: UserCertificateDocument
  ) {
    if (!certificateUserData.id || !certificateStoreData.id) {
      throw new Error('Request is malformed');
    }

    let pdfJson: Observable<Object>;
    const pdfPath = `assets/certificates/templates/${certificateStoreData.certificateTemplate}.json`;
    if (isDevMode()) {
      pdfJson = this.http.get(pdfPath, {
        responseType: 'json',
      });
    } else {
      pdfJson = this.http.get(`https://cdn.jsdelivr.net/gh/cacic-fct/fct-app@main/src/${pdfPath}`, {
        responseType: 'json',
      });
    }

    const certificateData$ = this.afs
      .doc<CertificateDocPublic>(`/certificates/${eventID}/${certificateUserData.id}/public`)
      .get();

    certificateData$
      .pipe(
        mergeMap(() => {
          const pdfJson$ = pdfJson.pipe(take(1));
          const majorEvent$ = this.afs.doc<MajorEventItem>(`majorEvents/${eventID}`).get().pipe(take(1));
          const content$ = this.getCertificateContent(eventID, certificateUserData.id!);
          const InterRegular$ = this.http
            .get('https://cdn.jsdelivr.net/gh/cacic-fct/fonts@main/Inter/latin-ext/inter-v12-latin-ext-regular.woff', {
              responseType: 'arraybuffer',
            })
            .pipe(take(1));
          const InterMedium$ = this.http
            .get('https://cdn.jsdelivr.net/gh/cacic-fct/fonts@main/Inter/latin-ext/inter-v12-latin-ext-500.woff', {
              responseType: 'arraybuffer',
            })
            .pipe(take(1));
          const InterLight$ = this.http
            .get('https://cdn.jsdelivr.net/gh/cacic-fct/fonts@main/Inter/latin-ext/inter-v12-latin-ext-300.woff', {
              responseType: 'arraybuffer',
            })
            .pipe(take(1));

          return forkJoin([
            certificateData$,
            pdfJson$,
            majorEvent$,
            content$,
            InterRegular$,
            InterMedium$,
            InterLight$,
          ]);
        })
      )
      .pipe(take(1))
      .subscribe(async ([certificateData, pdf, majorEvent, content, InterRegular, InterMedium, InterLight]) => {
        const certificateDataSnapshot = certificateData.data();
        if (!certificateDataSnapshot) {
          throw new Error('Certificate data is missing');
        }

        const template = pdf as Template;

        let font = {};

        switch (certificateStoreData.certificateTemplate) {
          case 'cacic':
            font = {
              Inter_Regular: {
                data: InterRegular,
                fallback: true,
              },
              Inter_Medium: {
                data: InterMedium,
              },
              Inter_Light: {
                data: InterLight,
              },
            };
            break;
        }

        const verificationURL = `https://fct-pp.web.app/certificado/verificar/${eventID}-${certificateUserData.id}`;

        const majorEventData = majorEvent.data();

        if (!majorEventData) {
          throw new Error('Major event is missing');
        }

        let input = {
          name: certificateDataSnapshot.fullName,
          name_small: certificateDataSnapshot.fullName,
          event_name: majorEventData.name,
          event_name_small: majorEventData.name,
          date: formatDate(certificateDataSnapshot.issueDate.toDate(), "dd 'de' MMMM 'de' yyyy", {
            locale: ptBR,
          }),
          document: `Documento: ${certificateDataSnapshot.document}`,
          event_type: certificateStoreData.eventType.custom || eventTypes[certificateStoreData.eventType.type],
          participation_type:
            certificateStoreData.participationType.custom ||
            participationTypes[certificateStoreData.participationType.type],
          url: verificationURL,
          qrcode: verificationURL,
          qrcode2: verificationURL,
          content: content,
        };

        const inputs = [input];

        PDFGenerate({ template, inputs, options: { font } }).then((pdf) => {
          const blob = new Blob([pdf.buffer], { type: 'application/pdf' });
          const pdfUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = pdfUrl;
          a.download = `${majorEventData.name} - ${certificateStoreData.certificateName} - ${certificateDataSnapshot.fullName}.pdf`;
          a.click();
        });
      });
  }

  getCertificateContent(eventID: string, certificateID: string): Observable<string> {
    // Get events user attended from /certificates/{eventID}/{certificateID}
    const certificate$ = this.afs.doc<CertificateDocPublic>(`certificates/${eventID}/${certificateID}/public`).get();

    return certificate$.pipe(
      take(1),
      switchMap((certificate) => {
        if (certificate.exists) {
          // For every element in attendedEvents, get event info from /events/{eventID}
          const eventInfoCache: Observable<EventItem | undefined>[] = [];
          const eventsUserAttended = certificate.data()?.attendedEvents;

          if (eventsUserAttended === undefined) {
            return '';
          }

          // Get event info from cache
          for (const eventID of eventsUserAttended) {
            eventInfoCache.push(this.afs.doc<EventItem>(`events/${eventID}`).valueChanges({ idField: 'id' }));
          }

          // Generate content
          const a = generateContent(eventInfoCache, eventsUserAttended);
          return a;
        } else {
          throw new Error('Unable to generate content, certificate does not exist');
        }
      })
    );
  }
}
function generateContent(
  eventInfoCache: Observable<EventItem | undefined>[],
  eventsUserAttended: string[]
): Observable<string> {
  const eventInfo$ = combineLatest(eventInfoCache);

  return eventInfo$.pipe(
    take(1),
    map((eventInfo) => {
      // Sort events by date
      eventInfo.sort((a, b) => {
        if (a === undefined || b === undefined) {
          return 0;
        }

        if (a.eventStartDate === undefined || b.eventStartDate === undefined) {
          return 0;
        }

        return a.eventStartDate.toDate().getTime() - b.eventStartDate.toDate().getTime();
      });

      const minicursos = [];
      const palestras = [];
      const uncategorized = [];

      const skip: string[] = [];

      for (let event of eventInfo) {
        if (event === undefined || skip.includes(event.id!)) {
          continue;
        }

        // If user attended every event of group, display 1 event with all credit hours using eventgroup.groupDisplayName as name
        // If user didn't attend every event of group, don't display anything
        if (event.eventGroup) {
          // Get all events that are part of the same group
          const groupEvents = eventInfo.filter((e) => {
            return e?.eventGroup?.mainEventID === event?.eventGroup?.mainEventID;
          });

          // Get the events the user attended from the group
          const groupEventsAttended = groupEvents.filter((e) => {
            return eventsUserAttended.includes(e?.id!);
          });

          // Add every event that is part of group from eventInfo to skip array
          for (const e of groupEvents) {
            if (e) {
              skip.push(e.id!);
            }
          }

          // If user didn't attend every event of group, don't display anything
          if (event.eventGroup.groupEventIDs.length !== groupEventsAttended.length) {
            continue;
          }

          // If user attended every event of group, display 1 event with all credit hours using eventgroup.groupDisplayName as name
          let creditHours = groupEventsAttended.reduce((acc, cur) => {
            if (cur === undefined || cur.creditHours === undefined) {
              return acc;
            }
            return acc + cur.creditHours;
          }, 0);

          event = {
            ...event,
            name: event.eventGroup.groupDisplayName,
            creditHours: creditHours,
          };
        }

        switch (event.eventType) {
          case 'minicurso':
            minicursos.push(event);
            break;
          case 'palestra':
            palestras.push(event);
            break;
          default:
            uncategorized.push(event);
            break;
        }
      }

      let content = '';
      if (minicursos.length > 0) {
        content += makeText('Minicurso', 'Minicursos', minicursos);
      }

      if (palestras.length > 0) {
        content += makeText('Palestra', 'Palestras', palestras);
      }

      if (uncategorized.length > 0) {
        content += makeText('Atividade', 'Atividades', uncategorized);
      }

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const userTimezoneOffset = new Date().getTimezoneOffset() / 60;
      const userTimezoneOffsetString = `${userTimezoneOffset > 0 ? '-' : '+'}${Math.abs(userTimezoneOffset)}`;

      content += `\nDatas de acordo com o fuso horário "${userTimezone}" (UTC${userTimezoneOffsetString}).`;

      return content;
    })
  );
}

function makeText(typeSingular: string, typePlural: string, array: EventItem[]): string {
  if (array.length === 0) {
    return '';
  }

  let content = '';

  if (array.length > 1) {
    content = typePlural;
  } else {
    content = typeSingular;
  }

  content += ':\n';

  let totalCreditHours = 0;
  for (const event of array) {
    content += `• ${formatTimestamp(event.eventStartDate)} - ${event.name}`;
    if (event.creditHours) {
      content += ` - Carga horária: ${event.creditHours} horas`;
      totalCreditHours += event.creditHours;
    }
    content += ';\n';
  }
  content = content.slice(0, -2) + '.\n';

  if (totalCreditHours > 0) {
    content += `Carga horária total: ${totalCreditHours} horas.\n\n`;
  }

  return content;
}

function convertTimezone(date: Date, timezone: string): Date {
  const convertedDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return convertedDate;
}

function formatTimestamp(date: Timestamp): string {
  let dateFormatted = date.toDate();
  dateFormatted = convertTimezone(dateFormatted, 'America/Sao_Paulo');

  return formatDate(dateFormatted, 'dd/MM/yyyy - HH:mm');
}

interface CertificateOptionsTypes {
  custom: string;
  [key: string]: string;
}

export const participationTypes: CertificateOptionsTypes = {
  custom: 'Personalizado',
  participacao: 'Certificamos a participação de',
  participacaoDigital: 'Certificamos a participação digital de',
  certificamosQue: 'Certificamos que',
};

export const eventTypes: CertificateOptionsTypes = {
  custom: 'Personalizado',
  evento: 'no evento',
  minicurso: 'no minicurso',
  palestra: 'na palestra',
  atividade: 'na atividade',
};

export const contentTypes: CertificateOptionsTypes = {
  custom: 'Personalizado',
  default: 'Atividades realizadas (padrão)',
};

export const certificateTemplates = {
  cacic: {
    displayName: 'CACiC',
    /**
     * Preferibly the same name as the key
     */
    templateFilename: 'cacic',
  },
};

interface CertificateDocPublic {
  certificateID: string;
  document: string;
  fullName: string;
  issueDate: Timestamp;
  attendedEvents: string[];
}

export interface UserCertificateDocument {
  publicReference: DocumentReference;
  certificateID: string;
  id?: string;
}

export interface CertificateStoreData {
  certificateContent: {
    custom?: string;
    type: string;
  };
  certificateName: string;
  certificateTemplate: string;
  eventType: {
    type: string;
    custom?: string;
  };
  participationType: {
    type: string;
    custom?: string;
  };
  id?: string;
}

export interface CertificateTemplateData {
  certificateName: string;
  certificateID: string;
  certificateTemplate: string;
  issueDate: Timestamp;
  actualissueDate?: Timestamp;
  participation: {
    type: string;
    custom: string;
  };
  event: {
    type: string;
    custom: string;
  };
  content: {
    type: string;
    custom: string;
  };
  issuedTo: {
    toPayer: string;
    toNonSubscriber: string;
    toNonPayer: string;
    toList: string[];
  };
}
