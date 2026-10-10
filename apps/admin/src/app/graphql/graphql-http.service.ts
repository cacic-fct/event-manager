import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlStatusError, graphqlErrorStatus } from '@cacic-fct/shared-angular/errors';

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: GraphqlResponseError[];
}

interface GraphqlResponseError {
  message: string;
  extensions?: unknown;
}

@Service()
export class GraphqlHttpService {
  private readonly http = inject(HttpClient);

  request<TData>(query: string, variables?: Record<string, unknown>) {
    return this.http
      .post<GraphqlResponse<TData>>('/api/graphql', {
        query,
        variables: this.removeUndefinedValues(variables ?? {}),
      })
      .pipe(
        map((response) => {
          if (response.errors?.length) {
            const error = response.errors[0];
            const status = graphqlErrorStatus(error);
            throw status === null ? new Error(error.message) : new GraphqlStatusError(error.message, status);
          }
          if (!response.data) {
            throw new Error('GraphQL response did not contain data.');
          }
          return response.data;
        }),
      );
  }

  private removeUndefinedValues(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.removeUndefinedValues(entry));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, entryValue]) => entryValue !== undefined)
          .map(([key, entryValue]) => [key, this.removeUndefinedValues(entryValue)]),
      );
    }

    return value;
  }
}
