import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';

describe('GraphqlHttpService', () => {
  let service: GraphqlHttpService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(GraphqlHttpService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('posts GraphQL requests with undefined variables removed recursively', async () => {
    const responsePromise = firstValueFrom(
      service.request<{ event: { id: string } }>('query Event($input: EventInput!) { event { id } }', {
        input: {
          id: 'event-1',
          ignored: undefined,
          nested: {
            kept: true,
            removed: undefined,
          },
          list: [{ value: 'a', removed: undefined }],
        },
      }),
    );

    const request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({
      input: {
        id: 'event-1',
        nested: { kept: true },
        list: [{ value: 'a' }],
      },
    });

    request.flush({ data: { event: { id: 'event-1' } } });

    await expect(responsePromise).resolves.toEqual({ event: { id: 'event-1' } });
  });

  it('throws the first GraphQL error message', async () => {
    const responsePromise = firstValueFrom(service.request('query Broken { broken }'));

    httpTesting.expectOne('/api/graphql').flush({
      errors: [{ message: 'Nope' }, { message: 'Still nope' }],
    });

    await expect(responsePromise).rejects.toThrow('Nope');
  });

  it('throws when the response has no data', async () => {
    const responsePromise = firstValueFrom(service.request('query Empty { empty }'));

    httpTesting.expectOne('/api/graphql').flush({});

    await expect(responsePromise).rejects.toThrow('GraphQL response did not contain data.');
  });
});
