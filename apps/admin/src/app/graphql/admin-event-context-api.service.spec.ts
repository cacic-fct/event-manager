import { TestBed } from '@angular/core/testing';
import { AdminEventContextPage } from '@cacic-fct/event-manager-admin-contracts';
import { firstValueFrom, of } from 'rxjs';
import { AdminEventContextApiService } from './admin-event-context-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('AdminEventContextApiService', () => {
  it('preserves ranked server order, ancestry and opaque pagination for contextual metadata search', async () => {
    const page: AdminEventContextPage = {
      nodes: [
        { kind:'EVENT',id:'location-match',name:'Oficina Z',emoji:'🧪',locationDescription:'Laboratório de redes',ancestors:[{kind:'MAJOR_EVENT',id:'major-1',name:'Semana',emoji:'🎓'}],hasChildren:false },
        { kind:'EVENT',id:'name-match',name:'Oficina A',emoji:'💡',ancestors:[],hasChildren:false },
      ], nextCursor:'opaque-next-page',
    };
    const request = vi.fn(() => of({adminEventContextPage:page}));
    TestBed.configureTestingModule({providers:[{provide:GraphqlHttpService,useValue:{request}}]});
    const options = {parentKind:'MAJOR_EVENT' as const,parentId:'major-1',childKind:'EVENT' as const,query:'laboratório',cursor:'opaque-current-page',take:20,
      startDateFrom: new Date().toISOString(), isInGroup: false, isInMajorEvent: true};
    const result = await firstValueFrom(TestBed.inject(AdminEventContextApiService).listPage(options));
    expect(result).toEqual(page);
    expect(request).toHaveBeenCalledWith(expect.stringContaining('query AdminEventContextPage'), options);
    expect(request).toHaveBeenCalledWith(expect.stringContaining('ancestors { kind id name emoji }'), options);
  });
});
