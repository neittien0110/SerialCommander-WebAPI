#!/bin/bash

# Script để test Activity API endpoints
# Cần có token từ đăng nhập trước

API_URL="http://localhost:2999"
TOKEN="${1:-}"

if [ -z "$TOKEN" ]; then
    echo "⚠️  Chưa có token. Vui lòng đăng nhập và lấy token từ localStorage hoặc:"
    echo "   Usage: ./test_activity_endpoints.sh YOUR_JWT_TOKEN"
    echo ""
    echo "Hoặc test thủ công:"
    echo "1. Đăng nhập tại http://localhost:5173/login"
    echo "2. Mở DevTools > Application > Local Storage > lấy 'token'"
    echo "3. Chạy lại script với token"
    exit 1
fi

echo "🧪 Testing Activity API Endpoints..."
echo "=====================================\n"

# Test 1: GET /api/user/activities
echo "1. GET /api/user/activities"
echo "   Response:"
curl -s -X GET "${API_URL}/api/user/activities?limit=5" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.' || echo "   (Cần cài jq để format JSON)"
echo "\n"

# Test 2: GET /api/user/activities/stats
echo "2. GET /api/user/activities/stats"
echo "   Response:"
curl -s -X GET "${API_URL}/api/user/activities/stats" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.' || echo "   (Cần cài jq để format JSON)"
echo "\n"

# Test 3: POST /api/user/activities
echo "3. POST /api/user/activities"
echo "   Creating test activity..."
curl -s -X POST "${API_URL}/api/user/activities" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "activityType": "scenario_created",
    "description": "Test activity từ script",
    "metadata": {"test": true, "scenarioId": "test-123"}
  }' | jq '.' || echo "   (Cần cài jq để format JSON)"
echo "\n"

echo "✅ Tests completed!"




