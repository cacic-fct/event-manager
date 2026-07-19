import { Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/decorators/public.decorator';

const serverVersion = 'APP_VERSION_PLACEHOLDER';

@Public()
@Resolver()
export class ServerVersionResolver {
  @Query(() => String, {
    name: 'serverVersion',
    description: 'Returns the version embedded in this backend deployment image.',
  })
  getServerVersion(): string {
    return serverVersion;
  }
}
