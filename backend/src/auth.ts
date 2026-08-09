import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { auth } from 'express-oauth2-jwt-bearer'
import type { ApiError, User } from '@iot-dashboard/api-contract'

function requiredEnvironmentVariable(name: 'AUTH0_DOMAIN' | 'AUTH0_AUDIENCE'): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be configured.`)
  return value
}

const auth0Domain = requiredEnvironmentVariable('AUTH0_DOMAIN')
const auth0Audience = requiredEnvironmentVariable('AUTH0_AUDIENCE')
const verifyAccessToken = auth({
  audience: auth0Audience,
  issuerBaseURL: `https://${auth0Domain}/`,
  tokenSigningAlg: 'RS256',
})

function sendUnauthorized(res: Parameters<RequestHandler>[1]): void {
  res.setHeader('WWW-Authenticate', 'Bearer')
  const error: ApiError = {
    code: 'UNAUTHORIZED',
    message: 'A valid OAuth access token is required.',
    requestId: randomUUID(),
  }
  res.status(401).json(error)
}

export const authenticate: RequestHandler = (req, res, next) => {
  verifyAccessToken(req, res, (error?: unknown) => {
    if (error) {
      sendUnauthorized(res)
      return
    }

    const payload = req.auth?.payload
    if (!payload?.sub) {
      sendUnauthorized(res)
      return
    }

    res.locals.user = {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      displayName:
        typeof payload.name === 'string'
          ? payload.name
          : typeof payload.nickname === 'string'
            ? payload.nickname
            : null,
      roles: [],
    } satisfies User
    next()
  })
}
