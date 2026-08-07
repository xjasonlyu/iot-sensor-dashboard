import createClient from 'openapi-fetch'
import type { paths } from '@iot-dashboard/api-contract'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const developmentToken = import.meta.env.DEV ? 'development-token' : undefined

let accessTokenProvider: () => Promise<string | undefined> = async () =>
  import.meta.env.VITE_API_ACCESS_TOKEN ?? developmentToken

export function configureAccessTokenProvider(
  provider: () => Promise<string | undefined>,
): void {
  accessTokenProvider = provider
}

export async function getAccessToken(): Promise<string | undefined> {
  return accessTokenProvider()
}

export const apiClient = createClient<paths>({
  baseUrl: apiBaseUrl,
})

apiClient.use({
  async onRequest({ request }) {
    const accessToken = await getAccessToken()
    if (accessToken) {
      request.headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return request
  },
})
