import {
  type ApiError,
  Configuration,
  DashboardApi,
  IdentityApi,
  NetworksApi,
  RealtimeApi,
  ResponseError,
  SensorsApi,
  SystemApi,
} from '@iot-dashboard/api-contract'

export const apiBaseUrl = ''

let accessTokenProvider: () => Promise<string | undefined> = async () => undefined

export function configureAccessTokenProvider(
  provider: () => Promise<string | undefined>,
): void {
  accessTokenProvider = provider
}

export async function getAccessToken(): Promise<string | undefined> {
  return accessTokenProvider()
}

function isApiError(value: unknown): value is ApiError {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'message' in value &&
      typeof value.message === 'string',
  )
}

export async function apiErrorMessage(error: unknown): Promise<string> {
  if (error instanceof ResponseError) {
    try {
      const body: unknown = await error.response.clone().json()
      if (isApiError(body)) return body.message
    } catch {
      // Fall back to the HTTP status when the response is not an API error body.
    }
    return `The API returned HTTP ${error.response.status}.`
  }
  if (error instanceof Error) return error.message
  return 'The API returned an unexpected response.'
}

export const apiConfiguration = new Configuration({
  basePath: apiBaseUrl,
  accessToken: async () => (await getAccessToken()) ?? '',
})

export const dashboardApi = new DashboardApi(apiConfiguration)
export const identityApi = new IdentityApi(apiConfiguration)
export const networksApi = new NetworksApi(apiConfiguration)
export const realtimeApi = new RealtimeApi(apiConfiguration)
export const sensorsApi = new SensorsApi(apiConfiguration)
export const systemApi = new SystemApi(apiConfiguration)
