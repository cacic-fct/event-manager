export function authenticatedUserFixture(): Record<string, unknown> {
  return {
    realm_access: { roles: [] },
    sub: 'user-1',
    preferredUsername: 'usuario.teste',
    email: 'usuario.teste@example.edu',
    roles: [],
    permissions: [],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Usuário Teste',
      picture: null,
    },
  };
}
