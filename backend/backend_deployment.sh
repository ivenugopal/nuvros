#!/bin/bash

# Backend Deployment Script for AWS ECS
# This script builds, tags, and deploys the backend container to AWS ECR and ECS

set -e  # Exit on any error

echo "⚙️  Configuring AWS credentials..."
aws configure set aws_access_key_id AKIASTSO7DEBOUDYFFBI
aws configure set aws_secret_access_key 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
aws configure set default.region ap-south-1
aws configure set default.output json

echo "🔐 Logging into AWS ECR..."
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 179480500482.dkr.ecr.ap-south-1.amazonaws.com

echo "🔨 Building Docker image for linux/amd64 platform..."
docker build --platform linux/amd64 -t nuvr-backend .

echo "🏷️  Tagging Docker image..."
docker tag nuvr-backend:latest 179480500482.dkr.ecr.ap-south-1.amazonaws.com/nuvr-backend:latest

echo "📤 Pushing Docker image to ECR..."
docker push 179480500482.dkr.ecr.ap-south-1.amazonaws.com/nuvr-backend:latest

echo "🚀 Updating ECS service with new deployment..."
aws ecs update-service \
  --cluster nuvr-cluster \
  --service nuvr-backend-service \
  --force-new-deployment \
  --health-check-grace-period-seconds 120

echo "✅ Backend deployment completed successfully!"

