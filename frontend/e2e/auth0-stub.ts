const authenticatedClient = {
  getTokenSilently: async () => 'e2e-access-token',
  handleRedirectCallback: async () => ({ appState: undefined }),
  isAuthenticated: async () => true,
  loginWithRedirect: async () => undefined,
  logout: async () => undefined,
}

export async function createAuth0Client() {
  return authenticatedClient
}
