ALTER TABLE Scenarios
  ADD COLUMN Banners TEXT NULL COMMENT 'Danh sách banner dạng JSON mảng chuỗi (mỗi phần tử 1 URL/nội dung). Thay Banner1/Banner2 vốn chỉ giữ được 2 dòng (issue #10).';
