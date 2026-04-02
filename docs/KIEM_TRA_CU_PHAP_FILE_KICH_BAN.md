# Kiểm tra cú pháp file kịch bản (.json)

## 1. Ý tưởng

- **Mục tiêu**: Có công cụ kiểm tra file `.json` đặc tả kịch bản trước khi import hoặc chỉnh sửa, báo **lỗi ở đâu** (dòng, cột, đường dẫn trường) để người dùng sửa nhanh.
- **Phạm vi**: 
  - **Lỗi cú pháp JSON**: dấu phẩy thừa, thiếu ngoặc, sai kiểu token → cần báo **dòng và cột** (từ thông báo lỗi `JSON.parse` hoặc từ vị trí ký tự).
  - **Lỗi cấu trúc/schema**: thiếu trường bắt buộc (`Name`, `Content`, `Type`, `Name` trong từng khối), sai kiểu (số/chuỗi/mảng), giá trị enum không hợp lệ (`Type`, `Parity`, `StopBits`, …) → báo **path** (ví dụ `Content[2].Type`) và nếu có thể **dòng/cột** tương ứng trong file nguồn.

- **Đồng bộ backend – frontend**: 
  - Backend (DB, API import/export) và frontend (load kịch bản, render khối lệnh) đều dùng chung một cấu trúc: root có `Name`, `Description`, `Content` (mảng), `Banners`, `Baudrate`, `Parity`, `StopBits`, `DataBits`, `NewLine`, `FlowControl`. 
  - Mỗi phần tử `Content[i]` có `Type`, `Name`, `Labels`, `TxFormats`, `Params`, `Hint`. 
  - Bộ kiểm tra dùng đúng schema này và danh sách `Type` hợp lệ giống frontend (`SerialAction` / `BlockType`) để báo lỗi chính xác và nhất quán.

## 2. Cách triển khai

### 2.1. Backend (Node/Express)

- **Module kiểm tra**: `modules/config/services/scenarioFileValidator.js`
  - **Đầu vào**: chuỗi thô (nội dung file .json).
  - **Bước 1 – Cú pháp JSON**: Dùng `json-source-map.parse()` để vừa parse vừa nhận bản đồ vị trí (pointers). Nếu parse throw (lỗi cú pháp), bắt lỗi và trích **vị trí** từ message (regex `position (\d+)`), rồi đổi vị trí ký tự → **dòng, cột** (đếm `\n` trong đoạn từ đầu file đến vị trí đó).
  - **Bước 2 – Cấu trúc**: Sau khi parse thành công, kiểm tra:
    - Root: `Name` (bắt buộc), `Description` (tùy chọn), `Content` (bắt buộc, mảng), `Banners` (mảng hoặc bỏ qua), `Baudrate`, `Parity`, `StopBits`, `DataBits`, `NewLine`, `FlowControl` (đúng kiểu và enum).
    - Từng phần tử `Content[i]`: `Type` (bắt buộc, thuộc danh sách block type), `Name` (bắt buộc), `Labels`, `TxFormats`, `Params` (đúng kiểu; `Params` có thể `null`).
  - **Vị trí cho lỗi cấu trúc**: Dùng `pointers` từ `json-source-map`: mỗi đường dẫn JSON (ví dụ `/Content/2/Type`) có thể ánh xạ tới `{ line, column }` trong file. Hàm `getPositionForPath(pointers, jsonPointer)` đổi pointer → dòng/cột (1-based) để gắn vào từng lỗi/cảnh báo.
  - **Đầu ra**: `{ valid, errors[], warnings[] }`, mỗi phần tử có `message`, `path` (vd `Content[2].Type`), `line`, `column` (có thể `null` nếu không xác định được).

- **API**: 
  - **POST `/verify-file`** (không bắt buộc đăng nhập): body là **raw text** (Content-Type: `text/plain`), chứa toàn bộ nội dung file .json. 
  - Route dùng middleware `express.text({ type: "text/plain", limit: "2mb" })` để đọc body thành chuỗi, gọi `validateScenarioFile(req.body)` và trả về JSON `{ valid, errors, warnings }`.

- **Phụ**: Sửa lỗi trong `scenarioService.updateScenario` (dùng `updateData.FlowControl` thay vì `scenarioData.FlowControl`).

### 2.2. Frontend (React)

- **Modal kiểm tra**: `ScenarioValidateModal.tsx`
  - Người dùng có thể **dán JSON** vào textarea hoặc **chọn file .json** (đọc bằng `FileReader` → gán vào textarea).
  - Nút **“Kiểm tra”** gửi nội dung (chuỗi) lên **POST `/verify-file`** với `Content-Type: text/plain`.
  - Kết quả hiển thị:
    - **Hợp lệ**: thông báo “File hợp lệ” (và có thể liệt kê cảnh báo nếu có).
    - **Không hợp lệ**: danh sách **Lỗi** và **Cảnh báo**, mỗi mục kèm **dòng**, **cột**, **path** (ví dụ `Content[2].Type`) và nội dung lỗi.

- **Tích hợp menu**: Trong menu **Kịch bản** (Scenario), thêm mục **“Kiểm tra cú pháp file”** → mở `ScenarioValidateModal` (không cần đăng nhập để chỉ kiểm tra file).

- **Đa ngôn ngữ**: Thêm các key `scenario.validate.*` trong `LanguageContext` (tiếng Việt và tiếng Anh) cho tiêu đề modal, nút, nhãn lỗi/cảnh báo, dòng/cột, v.v.

### 2.3. Đồng bộ với code hiện có

- **Schema Content**: Danh sách `Type` hợp lệ trong validator trùng với `BlockType` trong `SerialAction.tsx` (text, dropdown, para, button, button2, 5directions, slider, slider2, toogle, toogle2, var, knob, colorpicker, numberinput, joystick, matrix, gauge, progress).
- **Root**: Trùng với model Scenario (Name, Description, Content, Banners, Baudrate, Parity, StopBits, DataBits, NewLine, FlowControl) và với `SerialConfig` / cách frontend parse `ScenarioPackage2ScenarioConfigStructure`.
- **API verify cũ**: **POST `/verify`** vẫn giữ nguyên (nhận body là object JSON đã parse), dùng cho luồng upload/import hiện tại; **POST `/verify-file`** dành riêng cho kiểm tra file thô và báo lỗi chi tiết theo dòng/cột/path.

## 3. Cách sử dụng

1. Trên giao diện: **Kịch bản** → **Kiểm tra cú pháp file**.
2. Chọn file .json hoặc dán nội dung JSON vào ô.
3. Bấm **Kiểm tra**.
4. Xem danh sách lỗi/cảnh báo; mỗi mục có **dòng**, **cột** và **path** (ví dụ `Content[2].Name`) để tìm đúng vị trí trong file và sửa.

## 4. Gọi API trực tiếp (ví dụ)

```bash
curl -X POST http://localhost:2999/verify-file \
  -H "Content-Type: text/plain" \
  --data-binary @path/to/scenario.json
```

Trả về JSON dạng:

```json
{
  "valid": false,
  "errors": [
    {
      "message": "Trường \"Type\" của Content[2] không hợp lệ.",
      "path": "Content[2].Type",
      "line": 45,
      "column": 7
    }
  ],
  "warnings": []
}
```
