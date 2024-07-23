# Build
FROM node:alpine AS build

ARG COMMIT_HASH

WORKDIR /app

COPY package.json bun.lockb .

# https://github.com/oven-sh/bun/issues/5545
RUN apk --no-cache add ca-certificates wget

RUN if [[ $(uname -m) == "aarch64" ]] ; \
    then \
    # aarch64
    wget https://raw.githubusercontent.com/squishyu/alpine-pkg-glibc-aarch64-bin/master/glibc-2.26-r1.apk ; \
    apk add --no-cache --allow-untrusted --force-overwrite glibc-2.26-r1.apk ; \
    rm glibc-2.26-r1.apk ; \
    else \
    # x86_64
    wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.28-r0/glibc-2.28-r0.apk ; \
    wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub ; \
    apk add --no-cache --force-overwrite glibc-2.28-r0.apk ; \
    rm glibc-2.28-r0.apk ; \
    fi
###########

RUN yarn global add bun

RUN bun install --frozen-lockfile

COPY . .

ENV COMMIT_HASH=${COMMIT_HASH}

RUN sed -i "s/commitHash-placeholder/${COMMIT_HASH}/g" src/environments/environment.prod.ts

RUN bun run build --configuration=production

# Serve
FROM nginx:stable as serve

COPY --from=build /app/dist/browser /usr/share/nginx/html
COPY --from=build /app/dist/3rdpartylicenses.txt /usr/share/nginx/html

EXPOSE 80
