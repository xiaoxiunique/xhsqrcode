# Docker 部署指南

## 前置要求

1. 确保 Docker 已安装并运行
2. 拥有 Docker Hub 账号

## 构建和推送步骤

### 1. 启动 Docker 服务

确保 Docker Desktop 或 Docker 守护进程正在运行：

```bash
# 检查 Docker 是否运行
docker --version
docker ps
```

### 2. 修改构建脚本

编辑 `build-and-push.sh` 文件，将 `your-dockerhub-username` 替换为你的实际 Docker Hub 用户名：

```bash
DOCKER_USERNAME="your-actual-username"  # 替换这里
```

### 3. 构建镜像

```bash
# 方法1: 使用脚本（推荐）
./build-and-push.sh

# 方法2: 手动构建
docker build -t xhsqrcode:latest .
```

### 4. 标记镜像

```bash
# 替换 your-username 为你的 Docker Hub 用户名
docker tag xhsqrcode:latest your-username/xhsqrcode:latest
```

### 5. 登录 Docker Hub

```bash
docker login
# 输入你的 Docker Hub 用户名和密码
```

### 6. 推送镜像

```bash
# 替换 your-username 为你的 Docker Hub 用户名
docker push your-username/xhsqrcode:latest
```

## 运行容器

### 本地运行

```bash
# 从本地镜像运行
docker run -p 3000:3000 xhsqrcode:latest

# 从 Docker Hub 运行
docker run -p 3000:3000 your-username/xhsqrcode:latest
```

### 后台运行

```bash
docker run -d -p 3000:3000 --name xhsqrcode-app your-username/xhsqrcode:latest
```

### 查看日志

```bash
docker logs xhsqrcode-app
```

### 停止容器

```bash
docker stop xhsqrcode-app
docker rm xhsqrcode-app
```

## API 使用

容器运行后，可以通过以下端点访问：

- 获取二维码: `GET http://localhost:3000/qrcode`
- 查询登录状态: `GET http://localhost:3000/cookies/{nonce}`

## 环境变量（可选）

如需自定义配置，可以添加环境变量：

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  your-username/xhsqrcode:latest
```

## 故障排除

1. **Docker 守护进程未运行**
   - 启动 Docker Desktop
   - 或运行 `sudo systemctl start docker` (Linux)

2. **端口被占用**
   - 更改端口映射: `-p 3001:3000`

3. **权限问题**
   - 确保用户在 docker 组中
   - 或使用 `sudo` 运行命令

4. **镜像构建失败**
   - 检查网络连接
   - 清理 Docker 缓存: `docker system prune`
