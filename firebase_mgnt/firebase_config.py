# firebase_config.py

# ID dự án của bạn (lấy ở tab General trong Project Settings)
PROJECT_ID = "pikalong-df5f7" 

# Đường dẫn đến file vừa tải về
PATH_TO_JSON = "serviceAccountKey.json"

# Tên Storage Bucket (thường là project_id.appspot.com)
STORAGE_BUCKET = f"{PROJECT_ID}.firebasestorage.app"

# Tên của thư mục lưu trong storage lưu trữ các file ngoài của kịch bản, như là ảnh, file partition.bin...
SCENARIO_FIREBASE_STORAGE_FOLDER = "attachments"
# Tên của collection trong firetore, lưu trữ các kịch bản cấu hình serial
SCENARIO_FIRESTORE_COLLECTION = "scenarios"