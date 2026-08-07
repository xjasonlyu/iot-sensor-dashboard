# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /workspace

COPY packages/api-contract/package.json ./packages/api-contract/package.json
COPY packages/api-contract/src ./packages/api-contract/src
COPY frontend/package.json frontend/package-lock.json ./frontend/

WORKDIR /workspace/frontend
RUN npm ci

COPY frontend/index.html ./index.html
COPY frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /workspace/frontend

COPY --from=build /workspace/packages /workspace/packages
COPY --from=build /workspace/frontend/package.json ./package.json
COPY --from=build /workspace/frontend/package-lock.json ./package-lock.json
COPY --from=build /workspace/frontend/node_modules ./node_modules
COPY --from=build /workspace/frontend/dist ./dist
COPY --from=build /workspace/frontend/vite.config.ts ./vite.config.ts

EXPOSE 3000
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
