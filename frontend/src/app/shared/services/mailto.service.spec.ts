// import { MailtoService } from 'src/app/shared/services/mailto.service';

// describe('MailtoService', () => {
//   let service: MailtoService;

//   beforeEach(() => {
//     service = new MailtoService();
//   });

//   it('#compose should return a mailto link without any parameters', () => {
//     const result = service.compose({});
//     expect(result).toBe('mailto:');
//   });

//   it('#compose should return a mailto link with receiver', () => {
//     const result = service.compose({ receiver: 'test@example.com' });
//     expect(result).toBe('mailto:test@example.com');
//   });

//   it('#compose should return a mailto link with multiple receivers', () => {
//     const result = service.compose({ receiver: ['test1@example.com', 'test2@example.com'] });
//     expect(result).toBe('mailto:test1@example.com,test2@example.com');
//   });

//   it('#compose should return a mailto link with cc', () => {
//     const result = service.compose({ cc: 'cc@example.com' });
//     expect(result).toBe('mailto:?cc=cc@example.com');
//   });

//   it('#compose should return a mailto link with multiple cc', () => {
//     const result = service.compose({ cc: ['cc1@example.com', 'cc2@example.com'] });
//     expect(result).toBe('mailto:?cc=cc1@example.com,cc2@example.com');
//   });

//   it('#compose should return a mailto link with bcc', () => {
//     const result = service.compose({ bcc: 'bcc@example.com' });
//     expect(result).toBe('mailto:?bcc=bcc@example.com');
//   });

//   it('#compose should return a mailto link with multiple bcc', () => {
//     const result = service.compose({ bcc: ['bcc1@example.com', 'bcc2@example.com'] });
//     expect(result).toBe('mailto:?bcc=bcc1@example.com,bcc2@example.com');
//   });

//   it('#compose should return a mailto link with subject', () => {
//     const result = service.compose({ subject: 'Test Subject' });
//     expect(result).toBe('mailto:?subject=Test%20Subject');
//   });

//   it('#compose should return a mailto link with body', () => {
//     const result = service.compose({ body: 'Test Body' });
//     expect(result).toBe('mailto:?body=Test%20Body');
//   });

//   it('#compose should return a mailto link with multiple parameters', () => {
//     const result = service.compose({
//       receiver: 'test@example.com',
//       cc: 'cc@example.com',
//       bcc: 'bcc@example.com',
//       subject: 'Test Subject',
//       body: 'Test Body',
//     });
//     expect(result).toBe(
//       'mailto:test@example.com?cc=cc@example.com&bcc=bcc@example.com&subject=Test%20Subject&body=Test%20Body',
//     );
//   });
// });
