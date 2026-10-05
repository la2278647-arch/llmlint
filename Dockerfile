FROM node:22-alpine

LABEL org.opencontainers.image.source=https://github.com/la2278647-arch/llmlint
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /app

COPY package.json README.md LICENSE ./
COPY src ./src
COPY examples ./examples

# 零依赖：直接建软链，无需 npm install
RUN ln -s /app/src/cli.js /usr/local/bin/llmlint && chmod +x /app/src/cli.js

# 默认检查 stdin，便于管道使用
ENTRYPOINT ["llmlint", "check", "-"]
CMD []

# 手动运行：
#   docker run --rm -v "$PWD:/w" -w /w llmlint check README.md
#   docker run --rm llmlint rules
