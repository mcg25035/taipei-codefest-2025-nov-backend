我已完成對 `databaseService.js` 檔案中所有函式的功能與要求的整理。

### `databaseService.js` 函式功能與要求整理

這個檔案負責管理應用程式與 SQLite 資料庫的互動，主要處理道路、節點和自行車道相關的地理空間資料。

#### 1. [`initializeDatabase()`](databaseService.js:17-145)

*   **功能**: 初始化 SQLite 資料庫。這包括連接到資料庫、建立 `Lines`、`Nodes` 和 `Bike` 三個資料表。根據環境變數 `SKIP_DB_INIT` 的設定，它會選擇清空現有資料並從 GeoJSON 檔案載入新資料，或跳過資料載入步驟。如果執行完整初始化，它會依序執行四個步驟：處理 `highway.geojson`、更新人行道資訊、處理 `bike.geojson`，最後執行高階自行車道比對 (透過 `DatabaseServiceExtension`)。
*   **要求**:
    *   依賴 `fs` 模組讀取 GeoJSON 檔案 (found in file: [`databaseService.js`](databaseService.js:3))。
    *   依賴 `sqlite3` 模組進行資料庫操作 (found in file: [`databaseService.js`](databaseService.js:4))。
    *   依賴 [`DatabaseServiceExtension`](databaseServiceExtension.js:5) 類別來執行高階比對邏輯。
    *   需要 `highway.db` 檔案作為 SQLite 資料庫 (found in file: [`databaseService.js`](databaseService.js:20))。
    *   如果 `process.env.SKIP_DB_INIT` 環境變數設定為 `'true'`，則會跳過資料載入和清空步驟 (found in file: [`databaseService.js`](databaseService.js:80-91))。
    *   如果未設定 `SKIP_DB_INIT` 或設定為其他值，則會清空 `Lines`、`Nodes` 和 `Bike` 表中的所有資料 (found in file: [`databaseService.js`](databaseService.js:95-98))。
    *   需要 `highway.geojson`、`osm-walk.geojson` 和 `bike.geojson` 檔案來載入初始資料 (found in file: [`databaseService.js`](databaseService.js:108), [`databaseService.js`](databaseService.js:113), [`databaseService.js`](databaseService.js:118))。
    *   在完整初始化流程中，會呼叫 [`processHighwayGeoJSON()`](databaseService.js:153-189)、[`updateSidewalksFromGeoJSON()`](databaseService.js:194-230) 和 [`processBikeGeoJSON()`](databaseService.js:235-275) 函式。
    *   最後會呼叫 `DatabaseServiceExtension` 的 `startHook` 方法，並傳入 [`fetchAllLines()`](databaseService.js:330-337)、[`fetchAllBikeLines()`](databaseService.js:340-347) 和 [`updateLinesBikeStatus()`](databaseService.js:357-412) 作為參數 (found in file: [`databaseService.js`](databaseService.js:126-128))。
    *   返回一個 Promise，在所有資料庫操作完成後解析 (resolve)，或在任何錯誤發生時拒絕 (reject) (found in file: [`databaseService.js`](databaseService.js:18-145))。

#### 2. [`processHighwayGeoJSON(db, reject, onSuccess)`](databaseService.js:153-189)

*   **功能**: 讀取 `highway.geojson` 檔案，解析其中的 LineString 特徵，並將這些線段資料插入到 `Lines` 資料表，同時將線段的起點和終點座標插入到 `Nodes` 資料表。
*   **要求**:
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:153))。
    *   `reject`: 是一個 Promise 的 reject 函式，用於在操作失敗時拒絕 Promise (found in file: [`databaseService.js`](databaseService.js:153))。
    *   `onSuccess`: 是一個回呼函式，在所有資料插入和事務提交成功後執行 (found in file: [`databaseService.js`](databaseService.js:153))。
    *   需要 `highway.geojson` 檔案存在於專案根目錄下，且格式正確 (found in file: [`databaseService.js`](databaseService.js:154))。
    *   會開啟一個資料庫事務 (BEGIN TRANSACTION)，以確保資料插入的原子性 (found in file: [`databaseService.js`](databaseService.js:160))。
    *   使用預處理語句 [`INSERT INTO Lines`](databaseService.js:158) 和 [`INSERT OR IGNORE INTO Nodes`](databaseService.js:159) 進行資料插入。
    *   `Lines` 表的 `id` 欄位會自動遞增，`name` 欄位會被賦予 `uiiai` 前綴和遞增的數字，`rd_from` 欄位來自 GeoJSON 的 `name` 屬性，`sidewalk` 欄位初始為 `null`，`start_lat`, `start_lng`, `end_lat`, `end_lng` 則來自 GeoJSON 的座標 (found in file: [`databaseService.js`](databaseService.js:173))。
    *   `Nodes` 表會插入線段的起點和終點座標，並使用 `INSERT OR IGNORE` 確保座標的唯一性 (found in file: [`databaseService.js`](databaseService.js:170))。
    *   在任何錯誤發生時，會執行 `ROLLBACK` 回滾事務 (found in file: [`databaseService.js`](databaseService.js:179), [`databaseService.js`](databaseService.js:181), [`databaseService.js`](databaseService.js:183))。
    *   成功後會執行 `COMMIT` 提交事務 (found in file: [`databaseService.js`](databaseService.js:182))。

#### 3. [`updateSidewalksFromGeoJSON(db, resolve, reject)`](databaseService.js:194-230)

*   **功能**: 讀取 `osm-walk.geojson` 檔案，解析其中的 LineString 特徵，並根據這些特徵的座標更新 `Lines` 資料表中的 `sidewalk` 欄位。如果 `osm-walk.geojson` 檔案不存在或無法讀取，則跳過此更新步驟。
*   **要求**:
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:194))。
    *   `resolve`: 是一個 Promise 的 resolve 函式，用於在操作成功時解析 Promise (found in file: [`databaseService.js`](databaseService.js:194))。
    *   `reject`: 是一個 Promise 的 reject 函式，用於在操作失敗時拒絕 Promise (found in file: [`databaseService.js`](databaseService.js:194))。
    *   需要 `osm-walk.geojson` 檔案存在於專案根目錄下，且格式正確。如果檔案不存在或讀取失敗，會發出警告並直接解析 Promise (found in file: [`databaseService.js`](databaseService.js:195-201))。
    *   會開啟一個資料庫事務 (BEGIN TRANSACTION)，以確保資料更新的原子性 (found in file: [`databaseService.js`](databaseService.js:204))。
    *   使用預處理語句 [`UPDATE Lines SET sidewalk = ? WHERE ...`](databaseService.js:203) 進行資料更新。
    *   `sidewalk` 欄位的值來自 GeoJSON 特徵的 `properties["sidewalk"]` 屬性。如果該屬性為 `"no"` 或不存在，則 `sidewalk` 欄位會被設定為 `null` (found in file: [`databaseService.js`](databaseService.js:209-210))。
    *   更新條件是基於線段的起點和終點座標，支援正向和反向匹配 (found in file: [`databaseService.js`](databaseService.js:203))。
    *   在任何錯誤發生時，會執行 `ROLLBACK` 回滾事務 (found in file: [`databaseService.js`](databaseService.js:223), [`databaseService.js`](databaseService.js:225))。
    *   成功後會執行 `COMMIT` 提交事務 (found in file: [`databaseService.js`](databaseService.js:224))。

#### 4. [`processBikeGeoJSON(db, resolve, reject)`](databaseService.js:235-275)

*   **功能**: 讀取 `bike.geojson` 檔案，解析其中的 LineString 特徵，並將這些自行車道線段資料插入到 `Bike` 資料表，同時將線段的起點和終點座標插入到 `Nodes` 資料表。如果 `bike.geojson` 檔案不存在或無法讀取，則跳過此導入步驟。
*   **要求**:
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:235))。
    *   `resolve`: 是一個 Promise 的 resolve 函式，用於在操作成功時解析 Promise (found in file: [`databaseService.js`](databaseService.js:235))。
    *   `reject`: 是一個 Promise 的 reject 函式，用於在操作失敗時拒絕 Promise (found in file: [`databaseService.js`](databaseService.js:235))。
    *   需要 `bike.geojson` 檔案存在於專案根目錄下，且格式正確。如果檔案不存在或讀取失敗，會發出警告並直接解析 Promise (found in file: [`databaseService.js`](databaseService.js:236-242))。
    *   會開啟一個資料庫事務 (BEGIN TRANSACTION)，以確保資料插入的原子性 (found in file: [`databaseService.js`](databaseService.js:246))。
    *   使用預處理語句 [`INSERT INTO Bike`](databaseService.js:244) 和 [`INSERT OR IGNORE INTO Nodes`](databaseService.js:245) 進行資料插入。
    *   `Bike` 表的 `id` 欄位會自動遞增，`name` 欄位會被賦予 `bike` 前綴和遞增的數字，`rd_from` 欄位來自 GeoJSON 的 `路段名稱` 屬性，`start_lat`, `start_lng`, `end_lat`, `end_lng` 則來自 GeoJSON 的座標 (found in file: [`databaseService.js`](databaseService.js:258-259))。
    *   `Nodes` 表會插入線段的起點和終點座標，並使用 `INSERT OR IGNORE` 確保座標的唯一性 (found in file: [`databaseService.js`](databaseService.js:256))。
    *   在任何錯誤發生時，會執行 `ROLLBACK` 回滾事務 (found in file: [`databaseService.js`](databaseService.js:265), [`databaseService.js`](databaseService.js:267), [`databaseService.js`](databaseService.js:269))。
    *   成功後會執行 `COMMIT` 提交事務 (found in file: [`databaseService.js`](databaseService.js:268))。

#### 5. [`findNodesInBounds(latMin, latMax, lngMin, lngMax)`](databaseService.js:281-288)

*   **功能**: 根據提供的經緯度範圍，從 `Nodes` 資料表中查詢所有位於該範圍內的節點。
*   **要求**:
    *   `latMin`: 最小緯度值 (found in file: [`databaseService.js`](databaseService.js:281))。
    *   `latMax`: 最大緯度值 (found in file: [`databaseService.js`](databaseService.js:281))。
    *   `lngMin`: 最小經度值 (found in file: [`databaseService.js`](databaseService.js:281))。
    *   `lngMax`: 最大經度值 (found in file: [`databaseService.js`](databaseService.js:281))。
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:10))。
    *   返回一個 Promise，在查詢成功時解析為包含符合條件的節點物件陣列，或在查詢失敗時拒絕 (found in file: [`databaseService.js`](databaseService.js:282-287))。
    *   查詢使用 SQL 語句 `SELECT * FROM Nodes WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?` (found in file: [`databaseService.js`](databaseService.js:283))。

#### 6. [`closeDatabase()`](databaseService.js:290-296)

*   **功能**: 關閉與 SQLite 資料庫的連接。
*   **要求**:
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:10))。
    *   返回一個 Promise，在資料庫連接成功關閉時解析，或在關閉失敗時拒絕 (found in file: [`databaseService.js`](databaseService.js:291-295))。
    *   在成功關閉連接時，會在控制台輸出 `'Database connection closed.'` (found in file: [`databaseService.js`](databaseService.js:294))。

#### 7. [`findLinesConnectedToNodesInBounds(latMin, latMax, lngMin, lngMax)`](databaseService.js:298-309)

*   **功能**: 根據提供的經緯度範圍，首先找出位於該範圍內的所有節點，然後查詢所有與這些節點相連的線段。
*   **要求**:
    *   `latMin`: 最小緯度值 (found in file: [`databaseService.js`](databaseService.js:298))。
    *   `latMax`: 最大緯度值 (found in file: [`databaseService.js`](databaseService.js:298))。
    *   `lngMin`: 最小經度值 (found in file: [`databaseService.js`](databaseService.js:298))。
    *   `lngMax`: 最大經度值 (found in file: [`databaseService.js`](databaseService.js:298))。
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:10))。
    *   返回一個 Promise，在查詢成功時解析為包含符合條件的線段物件陣列，或在查詢失敗時拒絕 (found in file: [`databaseService.js`](databaseService.js:299-308))。
    *   查詢使用 SQL 語句，該語句包含一個 `WITH` 子句來定義 `InBoundNodes` 臨時表，用於篩選範圍內的節點，然後再查詢與這些節點相連的 `Lines` (found in file: [`databaseService.js`](databaseService.js:301-305))。

#### 8. [`findLinesConnectedToLine(lineId)`](databaseService.js:311-328)

*   **功能**: 根據提供的線段 ID，找出與該線段的起點或終點相連的所有其他線段。
*   **要求**:
    *   `lineId`: 要查詢的線段的 ID (found in file: [`databaseService.js`](databaseService.js:311))。
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:10))。
    *   返回一個 Promise，在查詢成功時解析為包含符合條件的線段物件陣列，或在查詢失敗時拒絕 (found in file: [`databaseService.js`](databaseService.js:312-327))。
    *   查詢使用 SQL 語句，該語句包含一個 `WITH` 子句來定義 `TargetLineNodes` 臨時表，用於獲取目標線段的起點和終點座標，然後再查詢與這些節點相連的 `Lines` (found in file: [`databaseService.js`](databaseService.js:314-322))。

#### 9. [`fetchAllLines()`](databaseService.js:330-337)

*   **功能**: 從 `Lines` 資料表中獲取所有線段的 ID、起點緯度、起點經度、終點緯度和終點經度。
*   **要求**:
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:10))。
    *   返回一個 Promise，在查詢成功時解析為包含所有線段物件陣列，或在查詢失敗時拒絕 (found in file: [`databaseService.js`](databaseService.js:331-336))。
    *   查詢使用 SQL 語句 `SELECT id, start_lat, start_lng, end_lat, end_lng FROM Lines` (found in file: [`databaseService.js`](databaseService.js:333))。
    *   在開始查詢時，會在控制台輸出 `'Fetching all lines from 'Lines' table for matching...'` (found in file: [`databaseService.js`](databaseService.js:332))。

#### 10. [`fetchAllBikeLines()`](databaseService.js:340-347)

*   **功能**: 從 `Bike` 資料表中獲取所有自行車道線段的起點緯度、起點經度、終點緯度和終點經度。
*   **要求**:
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:10))。
    *   返回一個 Promise，在查詢成功時解析為包含所有自行車道線段物件陣列，或在查詢失敗時拒絕 (found in file: [`databaseService.js`](databaseService.js:341-346))。
    *   查詢使用 SQL 語句 `SELECT start_lat, start_lng, end_lat, end_lng FROM Bike` (found in file: [`databaseService.js`](databaseService.js:343))。
    *   在開始查詢時，會在控制台輸出 `'Fetching all lines from 'Bike' table for matching...'` (found in file: [`databaseService.js`](databaseService.js:342))。

#### 11. [`updateLinesBikeStatus(matchedLineIds)`](databaseService.js:357-412)

*   **功能**: 批次更新 `Lines` 資料表中的 `bike` 欄位，將指定 ID 的線段的 `bike` 欄位設為 `1`。此函式會將更新操作分塊 (chunk) 處理，並依序執行每個塊的資料庫事務，以避免潛在的交易衝突。
*   **要求**:
    *   `matchedLineIds`: 包含所有需要更新 `bike` 狀態為 `1` 的線段 ID 的陣列 (found in file: [`databaseService.js`](databaseService.js:357))。
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:10))。
    *   如果 `matchedLineIds` 為空或不是陣列，則不會執行任何更新，並返回 `0` (found in file: [`databaseService.js`](databaseService.js:358-361))。
    *   更新操作會被分成大小為 `900` 的塊 (found in file: [`databaseService.js`](databaseService.js:365))。
    *   每個塊的更新都會在一個獨立的資料庫事務中執行 (BEGIN TRANSACTION 和 COMMIT) (found in file: [`databaseService.js`](databaseService.js:380), [`databaseService.js`](databaseService.js:391))。
    *   使用 SQL 語句 `UPDATE Lines SET bike = 1 WHERE id IN (...)` 進行更新 (found in file: [`databaseService.js`](databaseService.js:377))。
    *   在任何錯誤發生時，會執行 `ROLLBACK` 回滾事務 (found in file: [`databaseService.js`](databaseService.js:385), [`databaseService.js`](databaseService.js:395))。
    *   返回一個 Promise，解析為成功更新的總行數 (found in file: [`databaseService.js`](databaseService.js:411))。
    *   在處理每個塊時，會在控制台輸出進度信息 (found in file: [`databaseService.js`](databaseService.js:372))。

#### 12. [`findAllLines()`](databaseService.js:417-426)

*   **功能**: 從 `Lines` 資料表中獲取所有線段的所有欄位資料。
*   **要求**:
    *   `db`: 必須是一個已連接的 SQLite 資料庫實例 (found in file: [`databaseService.js`](databaseService.js:10))。
    *   返回一個 Promise，在查詢成功時解析為包含所有線段物件陣列，或在查詢失敗時拒絕 (found in file: [`databaseService.js`](databaseService.js:418-425))。
    *   查詢使用 SQL 語句 `SELECT * FROM Lines` (found in file: [`databaseService.js`](databaseService.js:419))。