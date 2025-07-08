# 使用 Playwright 官方镜像，已包含浏览器和依赖
FROM mcr.microsoft.com/playwright:v1.53.2-jammy

# 安装 Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

# 创建 dist 目录
RUN mkdir -p dist

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["bun", "run", "start"]
