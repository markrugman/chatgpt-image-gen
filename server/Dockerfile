FROM node:24-bookworm-slim AS codex
RUN npm install --prefix /codex --no-audit --no-fund --ignore-scripts @openai/codex@0.162.0-alpha.17.2 && mkdir /codex-runtime && find /codex -type f -name codex -executable -exec sh -c 'cp "$(dirname "$1")"/* /codex-runtime/' sh {} \;
FROM node:24-bookworm-slim AS web
WORKDIR /ui
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
RUN npm run build

FROM rust:1-bookworm AS build
WORKDIR /src
COPY server/Cargo.toml server/Cargo.lock ./server/
COPY server/src ./server/src
COPY src-tauri/src ./src-tauri/src
COPY src-tauri/profiles ./src-tauri/profiles
RUN --mount=type=cache,id=imagegen-registry,target=/usr/local/cargo/registry --mount=type=cache,id=imagegen-target,target=/src/server/target cargo build --release --locked --manifest-path server/Cargo.toml && cp server/target/release/image-gen-server /image-gen-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && groupadd --gid 10001 imagegen && useradd --uid 10001 --gid imagegen --create-home imagegen && mkdir /data /worker /app && chown imagegen:imagegen /data /worker /app
COPY --from=build /image-gen-server /usr/local/bin/image-gen-server
COPY --from=codex /codex-runtime/ /usr/local/bin/
COPY --from=web /ui/dist /app/web
COPY src-tauri/THIRD-PARTY-NOTICES.txt src-tauri/CODEX-LICENSE.txt src-tauri/CODEX-NOTICE.txt /app/
USER imagegen
WORKDIR /app
ENV IMAGEGEN_SERVER_DATA=/data IMAGEGEN_SERVER_LISTEN=0.0.0.0:8787 IMAGEGEN_WORKER_DATA=/worker/app CODEX_HOME=/worker/codex IMAGEGEN_WEB_DIR=/app/web
VOLUME /data /worker
EXPOSE 8787
ENTRYPOINT ["/usr/local/bin/image-gen-server"]
