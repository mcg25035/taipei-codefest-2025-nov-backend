const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// (JSDoc 註解和頂層 'db' 變數... 保持不變)
// ...
/**
 * @typedef {Object} Line
 * @property {number} id - The unique identifier for the line.
 * @property {string} name - The name of the line.
 * @property {string} rd_from - The road name from the GeoJSON properties.
 * @property {string | null} sidewalk - Sidewalk information (e.g., "left", "right", null).
 * @property {Node} start - The starting node of the line.
 * @property {Node} end - The ending node of the line.
 */
let db;


/**
 * 初始化資料庫：連接、建立資料表、清空舊資料、載入 GeoJSON
 * @returns {Promise<void>} - 一個在資料載入完成後 resolve 的 Promise
 */
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        // 1. 連接到 SQLite 資料庫
        db = new sqlite3.Database('./highway.db', (err) => {
            if (err) {
                console.error('Error connecting to database:', err.message);
                return reject(err);
            }
            console.log('Connected to the SQLite database.');
        });

        // 2. 建立資料表 (Lines) - 包含 sidewalk 欄位
        const createTableSql = `
        CREATE TABLE IF NOT EXISTS Lines (
            id INTEGER PRIMARY KEY,
            name TEXT,
            rd_from TEXT, 
            sidewalk TEXT, 
            start_lat REAL,
            start_lng REAL,
            end_lat REAL,
            end_lng REAL
        );`;

        // 3. 建立 Nodes 表
        const createNodesTableSql = `
        CREATE TABLE IF NOT EXISTS Nodes (
            node_id INTEGER PRIMARY KEY AUTOINCREMENT,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            UNIQUE(lat, lng)
        );`;

        // *** 新增 ***
        // 4. 建立 Bike 表 (不含 sidewalk)
        const createBikeTableSql = `
        CREATE TABLE IF NOT EXISTS Bike (
            id INTEGER PRIMARY KEY,
            name TEXT,
            rd_from TEXT, 
            start_lat REAL,
            start_lng REAL,
            end_lat REAL,
            end_lng REAL
        );`;

        // 5. db.serialize 確保 SQL 語句依序執行
        db.serialize(() => {
            db.run(createTableSql, (err) => {
                if (err) return reject(err);
                console.log('Table "Lines" is ready.');
            });

            db.run(createNodesTableSql, (err) => {
                if (err) return reject(err);
                console.log('Table "Nodes" is ready.');
            });

            // *** 新增 ***
            db.run(createBikeTableSql, (err) => {
                if (err) return reject(err);
                console.log('Table "Bike" is ready.');
            });

            console.log('Clearing existing data from tables...');
            db.run(`DELETE FROM Lines;`, (err) => {
                if (err) return reject(err);
                console.log('Table "Lines" cleared.');
            });

            db.run(`DELETE FROM Nodes;`, (err) => {
                if (err) return reject(err);
                console.log('Table "Nodes" cleared.');
            });

            // *** 新增 ***
            db.run(`DELETE FROM Bike;`, (err) => {
                if (err) return reject(err);
                console.log('Table "Bike" cleared.');
            });


            // 6. 啟動三階段處理
            db.run("SELECT 1", (err) => {
                if (err) return reject(err);
                
                console.log('Database setup complete. Starting Step 1: Processing highway.geojson...');
                
                // *** 關鍵修改 (三階段) ***
                // 執行第一步：載入基礎道路
                processHighwayGeoJSON(db, reject, () => {
                    // 第一步成功的回呼
                    console.log('Step 1 complete. Starting Step 2: Updating sidewalks from osm-walk.geojson...');
                    
                    // 執行第二步：更新人行道資訊
                    // (使用 updateSidewalks 的 'resolve' 參數作為我們的 'onSuccess' 回呼)
                    updateSidewalksFromGeoJSON(db, () => {
                        // 第二步成功的回呼
                        console.log('Step 2 complete. Starting Step 3: Processing bike.geojson...');
                        
                        // 執行第三步：載入自行車道
                        // (這是最後一步，所以我們傳入 *原始* 的 resolve)
                        processBikeGeoJSON(db, resolve, reject);

                    }, reject); // 傳入 reject 供第二步使用
                });
            });
        });
    });
}

/**
 * (第 1 步) 處理 highway.geojson 檔案並寫入資料庫
 * @param {sqlite3.Database} db - 資料庫實例
 * @param {Function} reject - 失敗時呼叫的 Promise reject 函式
 * @param {Function} onSuccess - 成功時呼叫的回呼函式
 */
function processHighwayGeoJSON(db, reject, onSuccess) {
    // ... (此函式保持不變) ...
    const highwayGeoJSON = JSON.parse(fs.readFileSync('./highway.geojson', 'utf8'));
    console.log(`[Step 1] Total highway features found: ${highwayGeoJSON.features.length}`);

    const lineFeatures = highwayGeoJSON.features.filter(feature => {
        return feature.geometry.type === 'LineString';
    });
    console.log(`[Step 1] Filtered LineString features: ${lineFeatures.length}`);

    // INSERT 語句包含 sidewalk 欄位
    const insertLineSql = `INSERT INTO Lines (id, name, rd_from, sidewalk, start_lat, start_lng, end_lat, end_lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const insertNodeSql = `INSERT OR IGNORE INTO Nodes (lat, lng) VALUES (?, ?)`;

    db.run("BEGIN TRANSACTION;");

    const lineStmt = db.prepare(insertLineSql);
    const nodeStmt = db.prepare(insertNodeSql);
    let lineIdCounter = 1;

    lineFeatures.forEach(element => {
        let last = null;
        
        const properties = element.properties || {};
        const roadName = properties["name"] || null;
        // 注意：基礎道路的 sidewalk 預設為 null

        element.geometry.coordinates.forEach(coordRaw => {
            let coord = {
                lat: coordRaw[1],
                lng: coordRaw[0]
            };

            nodeStmt.run(coord.lat, coord.lng);

            if (!last) {
                last = coord;
                return;
            }

            const line = {
                id: lineIdCounter,
                name: `uiiai${lineIdCounter}`,
                start: last,
                end: coord
            };
            
            // 執行 INSERT，sidewalk 欄位傳入 null
            lineStmt.run(
                line.id, 
                line.name, 
                roadName, 
                null, // <--- 基礎道路的人行道設為 null
                line.start.lat, 
                line.start.lng, 
                line.end.lat, 
                line.end.lng
            );

            lineIdCounter++;
            last = coord;
        });
    });

    lineStmt.finalize((err) => {
        if (err) {
            console.error("[Step 1] Error finalizing line statement:", err.message);
            db.run("ROLLBACK;");
            return reject(err);
        }
        console.log('[Step 1] Line statement finalized.');

        nodeStmt.finalize((nodeErr) => {
            if (nodeErr) {
                console.error("[Step 1] Error finalizing node statement:", nodeErr.message);
                db.run("ROLLBACK;");
                return reject(nodeErr);
            }
            console.log('[Step 1] Node statement finalized.');

            db.run("COMMIT;", (commitErr) => {
                if (commitErr) {
                    console.error("[Step 1] Error committing transaction:", commitErr.message);
                    db.run("ROLLBACK;");
                    return reject(commitErr);
                }
                
                console.log(`[Step 1] Successfully inserted ${lineIdCounter - 1} base lines.`);
                
                // *** 關鍵 ***
                // 呼叫成功回呼 (onSuccess)，觸發第二步
                onSuccess(); 
            });
        });
    });
}

/**
 * (第 2 步) 讀取 osm-walk.geojson 並更新現有線路的 sidewalk 資訊
 * @param {sqlite3.Database} db - 資料庫實例
 * @param {Function} resolve - 成功時呼叫的 Promise resolve 函式 (這裡被當作 onSuccess)
 * @param {Function} reject - 失敗時呼叫的 Promise reject 函式
 */
function updateSidewalksFromGeoJSON(db, resolve, reject) {
    // ... (此函式保持不變) ...
    let walkGeoJSON;
    try {
        walkGeoJSON = JSON.parse(fs.readFileSync('./osm-walk.geojson', 'utf8'));
    } catch (err) {
        console.error("[Step 2] Error reading osm-walk.geojson:", err.message);
        console.warn("[Step 2] Skipping sidewalk update as osm-walk.geojson could not be read.");
        return resolve();
    }
    
    console.log(`[Step 2] Total walk features found: ${walkGeoJSON.features.length}`);

    const lineFeatures = walkGeoJSON.features.filter(feature => {
        return feature.geometry.type === 'LineString';
    });
    console.log(`[Step 2] Filtered LineString features: ${lineFeatures.length}`);

    const updateLineSql = `
        UPDATE Lines
        SET sidewalk = ?
        WHERE
            (start_lat = ? AND start_lng = ? AND end_lat = ? AND end_lng = ?)
            OR
            (start_lat = ? AND start_lng = ? AND end_lat = ? AND end_lng = ?)
    `;

    db.run("BEGIN TRANSACTION;");

    const updateStmt = db.prepare(updateLineSql);
    let updatedCount = 0; 

    lineFeatures.forEach(element => {
        const properties = element.properties || {};
        const sidewalk = (properties["sidewalk"] === "no") ? null : properties["sidewalk"]; 

        if (!sidewalk) {
            return;
        }

        let last = null;

        element.geometry.coordinates.forEach(coordRaw => {
            let coord = {
                lat: coordRaw[1],
                lng: coordRaw[0]
            };

            if (!last) {
                last = coord;
                return;
            }

            // console.log(`[Step 2] Updating sidewalk for segment: (${last.lat}, ${last.lng}) -> (${coord.lat}, ${coord.lng}) to "${sidewalk}"`);

            updateStmt.run(
                sidewalk,      // 1. SET sidewalk = ?
                last.lat,      // 2. start_lat (A)
                last.lng,      // 3. start_lng (A)
                coord.lat,     // 4. end_lat (B)
                coord.lng,     // 5. end_lng (B)
                coord.lat,     // 6. start_lat (B)
                coord.lng,     // 7. start_lng (B)
                last.lat,      // 8. end_lat (A)
                last.lng,      // 9. end_lng (A)
                function(err) {
                    if (err) return; 
                    if (this.changes > 0) {
                        updatedCount += this.changes;
                    }
                }
            );

            last = coord;
        });
    });

    updateStmt.finalize((err) => {
        if (err) {
            console.error("[Step 2] Error finalizing update statement:", err.message);
            db.run("ROLLBACK;");
            return reject(err);
        }
        console.log('[Step 2] Update statement finalized.');

        db.run("COMMIT;", (commitErr) => {
            if (commitErr) {
                console.error("[Step 2] Error committing transaction:", commitErr.message);
                db.run("ROLLBACK;");
                return reject(commitErr);
            }
            
            console.log(`[Step 2] Sidewalk update complete. ${updatedCount} segment updates executed.`);
            
            // *** 關鍵 ***
            // 呼叫 resolve() (作為 onSuccess)，
            // 告訴 initializeDatabase() 進行第三步
            resolve();
        });
    });
}

/**
 * *** 新增函式 ***
 * (第 3 步) 處理 bike.geojson 檔案並寫入資料庫
 * @param {sqlite3.Database} db - 資料庫實例
 * @param {Function} resolve - 成功時呼叫的 Promise resolve 函式
 * @param {Function} reject - 失敗時呼叫的 Promise reject 函式
 */
function processBikeGeoJSON(db, resolve, reject) {
    let bikeGeoJSON;
    try {
        bikeGeoJSON = JSON.parse(fs.readFileSync('./bike.geojson', 'utf8'));
    } catch (err) {
        console.error("[Step 3] Error reading bike.geojson:", err.message);
        console.warn("[Step 3] Skipping bike lane import as bike.geojson could not be read.");
        return resolve(); // 即使失敗也 resolve，因為這不是關鍵步驟
    }

    console.log(`[Step 3] Total bike features found: ${bikeGeoJSON.features.length}`);

    const lineFeatures = bikeGeoJSON.features.filter(feature => {
        return feature.geometry.type === 'LineString';
    });
    console.log(`[Step 3] Filtered LineString features: ${lineFeatures.length}`);

    // INSERT 語句 (不含 sidewalk)
    const insertBikeSql = `INSERT INTO Bike (id, name, rd_from, start_lat, start_lng, end_lat, end_lng) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    // 同樣寫入 Nodes 表
    const insertNodeSql = `INSERT OR IGNORE INTO Nodes (lat, lng) VALUES (?, ?)`;

    db.run("BEGIN TRANSACTION;");

    const bikeStmt = db.prepare(insertBikeSql);
    const nodeStmt = db.prepare(insertNodeSql);
    let lineIdCounter = 1; // Bike 表使用獨立的 ID 計數器

    lineFeatures.forEach(element => {
        let last = null;
        
        const properties = element.properties || {};
        // *** 關鍵：使用 "路段名稱" ***
        const roadName = properties["路段名稱"] || null; 

        element.geometry.coordinates.forEach(coordRaw => {
            let coord = {
                lat: coordRaw[1],
                lng: coordRaw[0]
            };

            // 寫入
            nodeStmt.run(coord.lat, coord.lng);

            if (!last) {
                last = coord;
                return;
            }

            const line = {
                id: lineIdCounter,
                name: `bike${lineIdCounter}`, // 給定一個唯一的 name
                start: last,
                end: coord
            };
            
            // 執行 INSERT (7 個參數)
            bikeStmt.run(
                line.id, 
                line.name, 
                roadName, // <-- 來自 "路段名稱"
                line.start.lat, 
                line.start.lng, 
                line.end.lat, 
                line.end.lng
            );

            lineIdCounter++;
            last = coord;
        });
    });

    bikeStmt.finalize((err) => {
        if (err) {
            console.error("[Step 3] Error finalizing bike statement:", err.message);
            db.run("ROLLBACK;");
            return reject(err);
        }
        console.log('[Step 3] Bike statement finalized.');

        nodeStmt.finalize((nodeErr) => {
            if (nodeErr) {
                console.error("[Step 3] Error finalizing node statement:", nodeErr.message);
                db.run("ROLLBACK;");
                return reject(nodeErr);
            }
            console.log('[Step 3] Node statement finalized.');

            db.run("COMMIT;", (commitErr) => {
                if (commitErr) {
                    console.error("[Step 3] Error committing transaction:", commitErr.message);
                    db.run("ROLLBACK;");
                    return reject(commitErr);
                }
                
                console.log(`[Step 3] Successfully inserted ${lineIdCounter - 1} bike lines.`);
                
                // *** 關鍵 ***
                // 這是最後一步，呼叫 resolve()
                // 告訴 initializeDatabase() 整個程序已完成
                resolve(); 
            });
        });
    });
}


// --- (其餘函式保持不變) ---

/**
 * 查詢在指定經緯度範圍內的節點
 * (... 程式碼不變 ...)
 */
function findNodesInBounds(latMin, latMax, lngMin, lngMax) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT * FROM Nodes 
            WHERE lat BETWEEN ? AND ? 
              AND lng BETWEEN ? AND ?
        `;
        const params = [latMin, latMax, lngMin, lngMax];

        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Error querying nodes in bounds:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

/**
 * 關閉資料庫連線 (用於程式結束時)
 * (... 程式碼不變 ...)
 */
function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
                return reject(err);
            }
            console.log('Database connection closed.');
            resolve();
        });
    });
}

/**
 * 查詢連接到指定範圍內節點的線路
 * (... 程式碼不變 ...)
 */
function findLinesConnectedToNodesInBounds(latMin, latMax, lngMin, lngMax) {
    return new Promise((resolve, reject) => {
        const sql = `
            WITH InBoundNodes AS (
                SELECT lat, lng
                FROM Nodes
                WHERE lat BETWEEN ? AND ?
                  AND lng BETWEEN ? AND ?
            )
            SELECT T1.*
            FROM Lines AS T1
            WHERE
                (T1.start_lat, T1.start_lng) IN (SELECT lat, lng FROM InBoundNodes)
            OR
                (T1.end_lat, T1.end_lng) IN (SELECT lat, lng FROM InBoundNodes);
        `;
        
        const params = [latMin, latMax, lngMin, lngMax];

        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Error querying lines connected to nodes in bounds:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

/**
 * 根據 line_id 查詢與其端點相連的所有線路
 * (... 程式碼不變 ...)
 */
function findLinesConnectedToLine(lineId) {
    return new Promise((resolve, reject) => {
        const sql = `
            WITH TargetLineNodes AS (
                SELECT start_lat AS lat, start_lng AS lng
                FROM Lines
                WHERE id = ?
                UNION
                SELECT end_lat AS lat, end_lng AS lng
                FROM Lines
                WHERE id = ?
            )
            SELECT T1.*
            FROM Lines AS T1
            WHERE
                (T1.start_lat, T1.start_lng) IN (SELECT lat, lng FROM TargetLineNodes)
            OR
                (T1.end_lat, T1.end_lng) IN (SELECT lat, lng FROM TargetLineNodes);
        `;
        
        const params = [lineId, lineId];

        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Error querying lines connected to line ID:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}


// 匯出(Export)這些函式
module.exports = {
    initializeDatabase,
    findNodesInBounds,
    closeDatabase,
    findLinesConnectedToNodesInBounds,
    findLinesConnectedToLine 
};