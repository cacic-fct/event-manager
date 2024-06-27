# Build
FROM oven/bun:alpine AS build

ARG COMMIT_HASH

WORKDIR /app

COPY package.json bun.lockb .

RUN bun add -g @angular/cli

RUN bun install --frozen-lockfile

COPY . .

ENV COMMIT_HASH=${COMMIT_HASH}

RUN sed -i "$ s/\ncommitHash: 'placeholder'};/commitHash: ${COMMIT_HASH}\n};/" src/environments/environment.prod.ts

RUN bun run build --prod

# Serve
FROM nginx:stable as serve

COPY --from=build /app/dist/browser /usr/share/nginx/html
COPY --from=build /app/dist/3rdpartylicenses.txt /usr/share/nginx/html

EXPOSE 80
