import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GraphqlHttpService } from '../graphql/graphql-http.service';
import { PermissionManagementApiService } from './permission-management-api.service';

describe('PermissionManagementApiService', () => {
  const graphql = { request: vi.fn() };
  let service: PermissionManagementApiService;

  beforeEach(() => {
    graphql.request.mockReset();
    TestBed.configureTestingModule({ providers: [PermissionManagementApiService, { provide: GraphqlHttpService, useValue: graphql }] });
    service = TestBed.inject(PermissionManagementApiService);
  });

  it('maps every management operation from GraphQL responses', () => {
    graphql.request
      .mockReturnValueOnce(of({ permissionRoles: [] }))
      .mockReturnValueOnce(of({ permissionGroups: [] }))
      .mockReturnValueOnce(of({ permissionScopeTargets: [] }))
      .mockReturnValueOnce(of({ people: [] }))
      .mockReturnValueOnce(of({ person: { id: 'person-1' } }))
      .mockReturnValueOnce(of({ savePermissionRole: { id: 'role-1' } }))
      .mockReturnValueOnce(of({ savePermissionGroup: { id: 'group-1' } }))
      .mockReturnValueOnce(of({ archivePermissionRole: true }))
      .mockReturnValueOnce(of({ archivePermissionGroup: true }));

    service.listRoles().subscribe((value) => expect(value).toEqual([]));
    service.listGroups().subscribe((value) => expect(value).toEqual([]));
    service.listTargets('GLOBAL').subscribe((value) => expect(value).toEqual([]));
    service.searchPeople('ana').subscribe((value) => expect(value).toEqual([]));
    service.getPerson('person-1').subscribe((value) => expect(value).toEqual({ id: 'person-1' }));
    service.saveRole({} as never).subscribe((value) => expect(value).toEqual({ id: 'role-1' }));
    service.saveGroup({} as never).subscribe((value) => expect(value).toEqual({ id: 'group-1' }));
    service.archiveRole('role-1').subscribe((value) => expect(value).toBe(true));
    service.archiveGroup('group-1').subscribe((value) => expect(value).toBe(true));
  });
});
