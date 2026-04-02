# Nhiệm vụ 3 — Firebase (NoSQL) + MySQL

## Mục tiêu đề bài

- **MySQL:** database quan hệ cho metadata kịch bản (tên, user, chia sẻ, thông số serial, …).
- **Firebase (NoSQL):**
  - **Firestore:** lưu nội dung kịch bản dạng JSON (mảng lệnh/block).
  - **Cloud Storage (Firebase Storage):** lưu dữ liệu dạng file (ảnh, firmware, đính kèm) và bản snapshot JSON kịch bản (`scenario-json/{uuid}.json`).

## Cấu hình backend (`.env`)

```
FIREBASE_SERVICE_ACCOUNT_PATH=firebase_mgnt/serviceAccountKey.json
# Tuỳ chọn:
# FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
# FIREBASE_SCENARIOS_COLLECTION=scenarios
# FIREBASE_STORAGE_ATTACHMENTS_PREFIX=attachments
# FIREBASE_STORAGE_SCENARIO_JSON_PREFIX=scenario-json
# FIREBASE_STORAGE_MAX_MB=5
```

Không commit `serviceAccountKey.json`.

## API Node (đã tích hợp)

| Thành phần | Vai trò |
|------------|---------|
| `kernels/firebaseAdmin.js` | Khởi tạo `firebase-admin` (Firestore + bucket Storage). |
| `scenarioFirestoreService.js` | CRUD nội dung collection `scenarios` (document id = `Scenario.Id`). |
| `firebaseStorageService.js` | Upload/list/xóa file user; snapshot JSON; signed URL. |
| `scenarioService.js` | MySQL + Firestore (+ snapshot Storage khi lưu). |

### REST Storage (JWT)

- `GET /api/firebase/storage/status`
- `POST /api/firebase/storage/upload` — `multipart/form-data`, field `file`
- `GET /api/firebase/storage/files`
- `DELETE /api/firebase/storage/file?fileName=...`
- `GET /api/firebase/storage/download-url?fileName=...&expiresMinutes=15`

File user: `{attachments}/users/{userId}/{fileName}`.

## Frontend (EndUser)

Menu **Kịch bản → Firebase Storage (file đính kèm)** — modal tải lên, danh sách, mở link tải, xóa (cần đăng nhập).

## Công cụ thầy cung cấp (`firebase_mgnt/`)

Streamlit `app.py` — quản trị Firestore/Storage độc lập; cùng project nếu dùng chung `serviceAccountKey.json`.

## Minh chứng nộp bài

1. Ảnh Firestore: collection `scenarios`, document theo UUID.
2. Ảnh Storage: thư mục `attachments/users/...` và/hoặc `scenario-json/`.
3. Ảnh MySQL: bảng `Scenarios` (có bản ghi, `Content` null nếu đã chuyển hết lên Firestore).
4. (Tuỳ chọn) Ảnh màn hình modal Firebase Storage trên web.
