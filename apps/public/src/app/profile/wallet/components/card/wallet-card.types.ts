export interface WalletCardUser {
  userId: string;
  name: string | null;
  picture: string | null;
  unespRole: string | readonly string[] | null;
  identityDocument: string | null;
  enrollmentNumber?: string | number | null;
}

export type WalletCardKind = 'eventos' | 'offline-code' | 'academic-record' | 'restaurant';

export interface WalletCardBrand {
  readonly name: string;
  readonly materialIcon?: string;
  readonly imageSource?: string;
  readonly imageClass?: string;
}

export const WALLET_CARD_BRANDS: Readonly<Record<WalletCardKind, WalletCardBrand>> = {
  eventos: {
    name: 'CACiC Eventos',
    imageSource: '/icons/favicon.svg',
    imageClass: 'cacic-logo',
  },
  'offline-code': {
    name: 'Código off-line',
    materialIcon: 'password',
  },
  'academic-record': {
    name: 'Registro Acadêmico',
    imageSource: '/assets/unesp/unesp-symbol-white.svg',
    imageClass: 'unesp-symbol',
  },
  restaurant: {
    name: 'Cartão do R.U.',
    imageSource: '/assets/unesp/unesp-symbol-white.svg',
    imageClass: 'unesp-symbol',
  },
};
