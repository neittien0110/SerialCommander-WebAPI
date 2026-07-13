ALTER TABLE Scenarios
  ADD COLUMN SyncedAt DATETIME NULL COMMENT 'Watermark đồng bộ Firestore: bằng ModifiedAt của lần sửa đã lên Firestore. NULL hoặc < ModifiedAt = content MySQL chưa sync — worker reconcile sẽ re-enqueue (kernels/scenarioSyncWatermark.js).';
