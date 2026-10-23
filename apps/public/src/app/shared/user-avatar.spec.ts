import { userAvatarUrl } from './user-avatar';

describe('userAvatarUrl', () => {
  it.each([
    ['https://lh3.googleusercontent.com/a/person=s96-c', 'https://lh3.googleusercontent.com/a/person=s512-c'],
    [
      'https://lh3.googleusercontent.com/a-/person/s128/photo.jpg',
      'https://lh3.googleusercontent.com/a-/person/s512/photo.jpg',
    ],
    ['https://lh3.googleusercontent.com/a/person=s512-c', 'https://lh3.googleusercontent.com/a/person=s512-c'],
  ])('uses the shared high-quality rendition for %s', (picture, expected) => {
    expect(userAvatarUrl(picture)).toBe(expected);
  });

  it.each([null, undefined, ''])('uses the local placeholder for %s', (picture) => {
    expect(userAvatarUrl(picture)).toBe('/assets/icons/avatar-placeholder.avif');
  });

  it.each([
    'https://lh3.googleusercontent.com.evil.example/a/person=s96-c',
    'https://example.com/lh3.googleusercontent.com/a/person=s96-c',
    'http://lh3.googleusercontent.com/a/person=s96-c',
    '/assets/avatar.png',
  ])('preserves other picture URLs: %s', (picture) => {
    expect(userAvatarUrl(picture)).toBe(picture);
  });
});
