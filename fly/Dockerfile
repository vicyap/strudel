FROM node:22-slim AS build

WORKDIR /app

RUN corepack enable pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY examples/ ./examples/
RUN mkdir -p website/public
COPY website/package.json ./website/

RUN pnpm install --frozen-lockfile

COPY . .

ARG SITE_URL=https://strudelai.fly.dev
ENV SITE_URL=$SITE_URL

RUN pnpm build

FROM nginx:alpine

COPY fly/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/website/dist /usr/share/nginx/html

