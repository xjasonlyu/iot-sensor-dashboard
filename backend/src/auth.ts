import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import type { components } from '@iot-dashboard/api-contract'

type ApiError = components['schemas']['ApiError']
type User = components['schemas']['User']

export const developmentUser: User = {
  id: 'development-user',
  email: 'developer@example.com',
  displayName: 'Development User',
  roles: ['viewer'],
}

/**
 * Development-only authentication stub.
 *
 * Replace this middleware with OIDC JWT verification (issuer, audience, expiry,
 * and signature) before deploying the application. The frontend sends this
 * development token through the same Authorization header that OIDC will use.
 */
export const authenticate: RequestHandler = (req, res, next) => {
  const authorization = req.header('authorization')
  const developmentToken = process.env.DEV_ACCESS_TOKEN ?? 'development-token'
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment && authorization === `Bearer ${developmentToken}`) {
    next()
    return
  }

  const error: ApiError = {
    code: 'UNAUTHORIZED',
    message: 'A valid OAuth access token is required.',
    requestId: randomUUID(),
  }

  res.status(401).json(error)
}
