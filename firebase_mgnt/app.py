import streamlit as st
import firebase_admin
from firebase_admin import credentials, firestore, storage
import json
import os
from firebase_config import (
    PATH_TO_JSON, 
    STORAGE_BUCKET, 
    SCENARIO_FIREBASE_STORAGE_FOLDER, 
    SCENARIO_FIRESTORE_COLLECTION
)

# --- 1. KHỞI TẠO FIREBASE (Chỉ thực hiện 1 lần) ---
if not firebase_admin._apps:
    cred = credentials.Certificate(PATH_TO_JSON)
    firebase_admin.initialize_app(cred, {
        'storageBucket': STORAGE_BUCKET
    })

db = firestore.client()
bucket = storage.bucket()

# --- 2. THIẾT LẬP SIDEBAR MENU ---
st.sidebar.title("🔥 Firebase Control")
st.sidebar.image("https://firebase.google.com/downloads/brand-guidelines/PNG/logo-standard.png", width=100)
menu = st.sidebar.radio(
    "Chọn dịch vụ:",
    ("Firestore (Scenario Database)", "Storage (Attachments)")
)

st.sidebar.divider()
st.sidebar.info(f"**Project:** {STORAGE_BUCKET.split('.')[0]}")

# --- 3. LOGIC XỬ LÝ THEO MENU ---

# ---------------------------------------------------------
# PHẦN 1: FIRESTORE (SCENARIO DATABASE)
# ---------------------------------------------------------
if menu == "Firestore (Scenario Database)":
    st.title("📑 Scenario JSON Management")
    
    # Session State cho tính năng Sửa
    if 'edit_mode' not in st.session_state: st.session_state.edit_mode = False
    if 'edit_data' not in st.session_state: st.session_state.edit_data = {}

    # Form Thêm/Sửa
    with st.expander("🛠️ Form nhập liệu kịch bản", expanded=st.session_state.edit_mode):
        with st.form("json_config_form"):
            scen_id = st.text_input("Mã kịch bản (ID)", 
                                   value=st.session_state.edit_data.get('id', ''),
                                   disabled=st.session_state.edit_mode)
            
            default_json = {"baudrate": 9600, "port": "COM1", "cmd": "INIT"}
            raw_json_str = st.text_area("Cấu hình JSON thô", 
                                       value=json.dumps(st.session_state.edit_data.get('content', default_json), indent=4),
                                       height=250)
            
            c1, c2 = st.columns([1, 4])
            if c1.form_submit_button("💾 Lưu"):
                try:
                    parsed_json = json.loads(raw_json_str)
                    if scen_id:
                        db.collection(SCENARIO_FIRESTORE_COLLECTION).document(scen_id).set(parsed_json)
                        st.success(f"Đã lưu kịch bản {scen_id}")
                        st.session_state.edit_mode = False
                        st.rerun()
                    else:
                        st.error("Vui lòng nhập ID!")
                except Exception as e:
                    st.error(f"Lỗi JSON: {e}")
            
            if st.session_state.edit_mode and c2.form_submit_button("✖️ Hủy"):
                st.session_state.edit_mode = False
                st.session_state.edit_data = {}
                st.rerun()

    # Tìm kiếm và Danh sách
    st.divider()
    search = st.text_input("🔍 Tìm kiếm theo ID kịch bản...")
    docs = db.collection(SCENARIO_FIRESTORE_COLLECTION).stream()
    
    for doc in docs:
        if search.lower() in doc.id.lower():
            with st.container(border=True):
                col_txt, col_btn = st.columns([5, 1])
                col_txt.subheader(f"🆔 {doc.id}")
                col_txt.json(doc.to_dict())
                
                if col_btn.button("✏️ Sửa", key=f"edit_{doc.id}"):
                    st.session_state.edit_mode = True
                    st.session_state.edit_data = {'id': doc.id, 'content': doc.to_dict()}
                    st.rerun()
                
                if col_btn.button("🗑️ Xóa", key=f"del_{doc.id}"):
                    db.collection(SCENARIO_FIRESTORE_COLLECTION).document(doc.id).delete()
                    st.rerun()

# ---------------------------------------------------------
# PHẦN 2: STORAGE (ATTACHMENTS)
# ---------------------------------------------------------
# ---------------------------------------------------------
# PHẦN 2: STORAGE (ATTACHMENTS)
# ---------------------------------------------------------
elif menu == "Storage (Attachments)":
    st.title("📁 File Attachments")
    st.info(f"Giới hạn: Mọi loại file, kích thước tối đa **5 MB**")

    # Upload tệp
    with st.container(border=True):
        st.subheader("📤 Tải lên tệp mới")
        
        # Bỏ 'type' để không giới hạn loại file
        up_file = st.file_uploader("Chọn file bất kỳ (Kịch bản, hình ảnh, firmware...)", type=None)
        
        if up_file:
            # Kiểm tra kích thước file (5 MB = 5 * 1024 * 1024 bytes)
            max_size_mb = 5
            file_size_mb = up_file.size / (1024 * 1024)
            
            if file_size_mb > max_size_mb:
                st.error(f"❌ File quá lớn ({file_size_mb:.2f} MB). Vui lòng chọn file nhỏ hơn 5 MB.")
            else:
                st.success(f"✅ File hợp lệ: {file_size_mb:.2f} MB")
                
                if st.button("Bắt đầu Upload"):
                    with st.spinner("Đang tải lên..."):
                        try:
                            full_path = f"{SCENARIO_FIREBASE_STORAGE_FOLDER}/{up_file.name}"
                            blob = bucket.blob(full_path)
                            
                            # Upload dữ liệu
                            blob.upload_from_string(
                                up_file.read(), 
                                content_type=up_file.type
                            )
                            
                            st.success(f"Đã tải lên {up_file.name} thành công!")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Lỗi khi upload: {e}")

    st.divider()
    st.subheader("📂 Danh sách tệp tin trên Storage")
    
    # Liệt kê và tính năng Xóa (Giữ nguyên như cũ)
    blobs = bucket.list_blobs(prefix=f"{SCENARIO_FIREBASE_STORAGE_FOLDER}/")
    
    has_files = False
    for blob in blobs:
        file_name = blob.name.replace(f"{SCENARIO_FIREBASE_STORAGE_FOLDER}/", "")
        if not file_name: continue 
        
        has_files = True
        with st.container(border=True):
            c_name, c_size, c_action = st.columns([4, 2, 1])
            c_name.write(f"📄 **{file_name}**")
            # Hiển thị dung lượng file đã lưu trên cloud
            c_size.write(f"⚖️ {blob.size / 1024:.1f} KB")
            
            if c_action.button("🗑️", key=f"fdel_{file_name}"):
                blob.delete()
                st.rerun()
                
    if not has_files:
        st.write("Chưa có tệp tin nào.")