const AVATAR_PLACEHOLDER = '/assets/icons/avatar-placeholder.avif';

export function userAvatarUrl(picture: string | null | undefined): string {
  if (!picture) {
    return AVATAR_PLACEHOLDER;
  }

  try {
    const url = new URL(picture);
    if (url.protocol === 'https:' && url.hostname === 'lh3.googleusercontent.com') {
      return picture.replace(/([=/])s\d+(?=[-/=]|$)/, '$1s512');
    }
  } catch {
    return picture;
  }

  return picture;
}
