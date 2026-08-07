# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /workspace

COPY packages/api-contract/package.json ./packages/api-contract/package.json
COPY packages/api-contract/src ./packages/api-contract/src
COPY backend/package.json backend/package-lock.json ./backend/

WORKDIR /workspace/backend
RUN npm ci

COPY backend/prisma.config.ts ./prisma.config.ts
COPY backend/prisma ./prisma
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /workspace/backend

COPY --from=build /workspace/packages /workspace/packages
COPY --from=build /workspace/backend/package.json ./package.json
COPY --from=build /workspace/backend/package-lock.json ./package-lock.json
COPY --from=build /workspace/backend/node_modules ./node_modules
COPY --from=build /workspace/backend/prisma.config.ts ./prisma.config.ts
COPY --from=build /workspace/backend/prisma ./prisma
COPY --from=build /workspace/backend/dist ./dist
COPY data /workspace/data

EXPOSE 9000
CMD ["npm", "start"]
