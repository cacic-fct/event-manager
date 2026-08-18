import { HTTP_CODE_METADATA, PATH_METADATA, REDIRECT_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from './auth/auth.constants';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('keeps the API root public and redirects it to the published documentation', () => {
    const handler = AppController.prototype.getApiRoot;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(REDIRECT_METADATA, handler)).toEqual({
      statusCode: 303,
      url: 'https://docs.eventos.cacic.com.br/Backend/API',
    });
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBeUndefined();
    expect(new AppController().getApiRoot()).toBeUndefined();
  });
});
