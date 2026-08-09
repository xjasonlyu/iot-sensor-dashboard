import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js'

const domain = import.meta.env.VITE_AUTH0_DOMAIN
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
const audience = import.meta.env.VITE_AUTH0_AUDIENCE

const authorizationParams = {
  audience,
  redirect_uri: window.location.origin,
  scope: 'openid profile email',
}

let auth0: Auth0Client | null = null

let loginInProgress = false

async function redirectToLogin(): Promise<void> {
  if (loginInProgress) return
  loginInProgress = true
  await auth0!.loginWithRedirect({
    appState: { returnTo: window.location.pathname },
  })
}

export async function initializeAuthentication(): Promise<void> {
  if (!domain || !clientId || !audience) {
    throw new Error('Auth0 domain, client ID, and API audience must be configured.')
  }

  auth0 = await createAuth0Client({
    domain,
    clientId,
    cacheLocation: 'memory',
    authorizationParams,
  })

  const query = new URLSearchParams(window.location.search)
  if (query.has('code') && query.has('state')) {
    const { appState } = await auth0.handleRedirectCallback()
    window.history.replaceState(
      {},
      document.title,
      appState?.returnTo ?? window.location.pathname,
    )
  }

  if (!(await auth0.isAuthenticated())) {
    await redirectToLogin()
  }
}

export async function getValidAccessToken(): Promise<string | undefined> {
  if (!auth0 || !(await auth0.isAuthenticated())) {
    await redirectToLogin()
    return undefined
  }

  try {
    return await auth0.getTokenSilently({ authorizationParams })
  } catch {
    await redirectToLogin()
    return undefined
  }
}

export async function logout(): Promise<void> {
  await auth0?.logout({
    logoutParams: { returnTo: window.location.origin },
  })
}
