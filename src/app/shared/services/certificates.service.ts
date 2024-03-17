import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { EventItem } from 'src/app/shared/services/event';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { DocumentReference } from '@angular/fire/firestore';
import { Timestamp } from '@firebase/firestore-types';
import { Observable, take, switchMap, combineLatest, map, mergeMap, forkJoin } from 'rxjs';
import { Injectable, isDevMode } from '@angular/core';
import { format as formatDate } from 'date-fns';

import { generate as PDFGenerate } from '@pdfme/generator';
import { Template } from '@pdfme/common';
import { text, barcodes } from '@pdfme/schemas';

import { HttpClient } from '@angular/common/http';
import { ptBR } from 'date-fns/locale';

import { Buffer } from 'buffer';

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
    if (!certificateUserData || !certificateStoreData) {
      throw new Error('Request is malformed');
    } else if (!certificateUserData.id || !certificateStoreData.id) {
      throw new Error('Request is malformed: id is missing');
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
      .doc<CertificateDocPublic>(
        `/certificates/${eventID}/${certificateStoreData.id}/${certificateUserData.certificateDoc}`
      )
      .get();

    certificateData$
      .pipe(
        mergeMap(() => {
          const pdfJson$ = pdfJson.pipe(take(1));
          const majorEvent$ = this.afs.doc<MajorEventItem>(`majorEvents/${eventID}`).get().pipe(take(1));
          const content$ = this.getCertificateContent(
            eventID,
            certificateStoreData.id!,
            certificateUserData.certificateDoc!
          );
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
          case 'cacic_unesp':
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

        const encodedString: string = this.encodeCertificateCode(
          eventID,
          certificateStoreData.id!,
          certificateUserData.certificateDoc
        );

        const verificationURLQR = `https://fct-pp.web.app/certificado/verificar/${encodedString}`;
        const verificationURLString = `https://fct-pp.web.app/certificado/verificar/\n${encodedString}`;

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
          front_text_field: certificateStoreData.extraText || '',
          document: `Documento: ${certificateDataSnapshot.document}`,
          event_type: certificateStoreData.eventType.custom || eventTypes[certificateStoreData.eventType.type],
          participation_type:
            certificateStoreData.participationType.custom ||
            participationTypes[certificateStoreData.participationType.type],
          url: verificationURLString,
          qrcode: verificationURLQR,
          qrcode2: verificationURLQR,
          content: content,
        };

        const inputs = [input];

        PDFGenerate({
          template,
          inputs,
          options: { font },
          plugins: {
            text,
            qrcode: barcodes.qrcode,
          },
        }).then((pdf) => {
          const blob = new Blob([pdf.buffer], { type: 'application/pdf' });
          const pdfUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = pdfUrl;
          a.target = '_blank';
          a.download = `${majorEventData.name} - ${certificateStoreData.certificateName} - ${certificateDataSnapshot.fullName}.pdf`;
          a.click();
        });
      });
  }

  getCertificateContent(eventID: string, certificateID: string, certificateDoc: string): Observable<string> {
    // Get events user attended from /certificates/{eventID}/{certificateID}
    const certificate$ = this.afs
      .doc<CertificateDocPublic>(`certificates/${eventID}/${certificateID}/${certificateDoc}`)
      .get();

    return certificate$.pipe(
      take(1),
      switchMap((certificate) => {
        if (certificate.exists) {
          // For every element in attendedEvents, get event info from /events/{eventID}
          const eventInfoCache: Observable<EventItemLocal | undefined>[] = [];
          const eventsUserAttended = certificate.data()?.attendedEvents;

          if (eventsUserAttended === undefined) {
            return '';
          }

          // Get event info from cache
          for (const eventID of eventsUserAttended) {
            eventInfoCache.push(this.afs.doc<EventItemLocal>(`events/${eventID}`).valueChanges({ idField: 'id' }));
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

  encodeCertificateCode(eventID: string, certificateID: string, certificateDoc: string): string {
    const base64 = Buffer.from(`${eventID}#${certificateID}#${certificateDoc}`).toString('base64');
    return base64.replace(/=/g, '');
  }
}
function generateContent(
  eventInfoCache: Observable<EventItemLocal | undefined>[],
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

          // Append all events of group to skip array
          for (const e of groupEvents) {
            if (e === undefined) {
              continue;
            }
            skip.push(e.id!);
          }

          // If user didn't attend every event of group, don't display anything
          if (event.eventGroup.groupEventIDs.length !== groupEventsAttended.length) {
            continue;
          }

          let creditHours: number = 0;
          // let creditHoursTotal: number = 0;
          let eventDays: Timestamp[] = [];

          // Sum credit hours of all events in group
          for (const e of groupEventsAttended) {
            if (e === undefined) {
              continue;
            }

            if (e.creditHours) {
              creditHours += e.creditHours;
            }

            eventDays.push(e.eventStartDate);
          }

          // if (event.eventGroup.groupEventIDs.length !== groupEventsAttended.length) {
          //   creditHoursTotal = groupEvents.reduce((acc, cur) => {
          //     if (cur === undefined || cur.creditHours === undefined) {
          //       return acc;
          //     }

          //     if (typeof cur.creditHours === 'string') {
          //       return acc + parseInt(cur.creditHours);
          //     }

          //     return acc + cur.creditHours;
          //   }, 0);
          // }

          event = {
            ...event,
            name: event.eventGroup.groupDisplayName,
            creditHours: creditHours,
            // totalCreditHours: creditHoursTotal,
            eventDays: eventDays,
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

      // const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // const userTimezoneOffset = new Date().getTimezoneOffset() / 60;
      // const userTimezoneOffsetString = `${userTimezoneOffset > 0 ? '-' : '+'}${Math.abs(userTimezoneOffset)}`;

      content += `\nObservações:\nDatas em formato "dia/mês/ano".`;

      return content;
    })
  );
}

function makeText(typeSingular: string, typePlural: string, array: EventItemLocal[]): string {
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
    if (event.eventDays) {
      // If event has multiple days, display date as follows:
      // • 01/01/21, 02/01/21, 03/01/21
      content += `• ${event.eventDays
        .map((day) => {
          return formatTimestamp(day);
        })
        .join(', ')} - ${event.name}`;
    } else {
      content += `• ${formatTimestamp(event.eventStartDate)} - ${event.name}`;
    }

    if (event.creditHours) {
      // if (event.totalCreditHours) {
      //   content += ` - Carga horária: ${event.creditHours.toLocaleString(
      //     'pt-BR'
      //   )} horas (de um total de ${event.totalCreditHours.toLocaleString('pt-BR')} horas possíveis)`;
      // } else {
      content += ` - Carga horária: ${event.creditHours.toLocaleString('pt-BR')} horas`;
      // }

      totalCreditHours += event.creditHours;
    }
    content += ';\n';
  }

  content = content.slice(0, -2) + '.\n';

  if (totalCreditHours > 0) {
    content += `Carga horária total: ${totalCreditHours.toLocaleString('pt-BR')} horas.\n`;
  }

  content += '\n';

  return content;
}

function convertTimezone(date: Date, timezone: string): Date {
  const convertedDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return convertedDate;
}

function formatTimestamp(date: Timestamp): string {
  let dateFormatted = date.toDate();
  dateFormatted = convertTimezone(dateFormatted, 'America/Sao_Paulo');

  return formatDate(dateFormatted, 'dd/MM/yy');
}

interface CertificateOptionsTypes {
  custom: string;
  [key: string]: string;
}

export function decodeCertificateCode(base64: string) {
  const decoded = Buffer.from(base64, 'base64').toString('ascii');
  const [eventID, certificateID, certificateDoc] = decoded.split('#');

  return {
    eventID,
    certificateID,
    certificateDoc,
  };
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
  cacic_unesp: {
    displayName: 'CACiC com logo da Unesp',
    templateFilename: 'cacic_unesp',
  },
};

interface EventItemLocal extends EventItem {
  totalCreditHours?: number;
  eventDays?: Timestamp[];
}

export interface CertificateDocPublic {
  certificateID: string;
  document: string;
  fullName: string;
  issueDate: Timestamp;
  attendedEvents: string[];
}

export interface UserCertificateDocument {
  certificateReference: DocumentReference;
  certificateDoc: string;
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
  extraText: string | null;
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
