#!/bin/bash

# 设置变量
IMAGE_NAME="xhsqrcode"
DOCKER_USERNAME="xiaoxiunique"
VERSION="latest"

echo "🔨 Building Docker image..."
if ! docker build -t $IMAGE_NAME:$VERSION .; then
    echo "❌ Build failed!"
    exit 1
fi

echo "🏷️  Tagging image for Docker Hub..."
docker tag $IMAGE_NAME:$VERSION $DOCKER_USERNAME/$IMAGE_NAME:$VERSION

echo "🔐 Logging in to Docker Hub..."
if ! docker login; then
    echo "❌ Login failed!"
    exit 1
fi

echo "📤 Pushing image to Docker Hub..."
if ! docker push $DOCKER_USERNAME/$IMAGE_NAME:$VERSION; then
    echo "❌ Push failed!"
    exit 1
fi

echo "✅ Build and push completed!"
echo "📦 Image: $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
echo ""
echo "🚀 To run the container:"
echo "   docker run -p 3000:3000 $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
echo ""
echo "🐳 Or use docker-compose:"
echo "   docker-compose up -d"
