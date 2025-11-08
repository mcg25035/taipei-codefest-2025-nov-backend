// 檔名: databaseManager.js

const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { DatabaseServiceExtension } = require('./databaseServiceExtension.js'); // *** 1. 匯入 Extension ***

// *** 1. 新增：讀取環境變數開關 ***
const SKIP_INIT = process.env.SKIP_DB_INIT === 'true';

let db;

/**
 * 初始化資料庫：連接、建立資料表、清空舊資料、載入 GeoJSON
 * *** 並且執行高階比對 ***
 * @returns {Promise<void>} - 一個在資料載入和比對完成後 resolve 的 Promise
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

        // 2. 建立資料表 (Lines) - 包含 bike 欄位
        const createTableSql = `
        CREATE TABLE IF NOT EXISTS Lines (
            id INTEGER PRIMARY KEY,
            name TEXT,
            rd_from TEXT, 
            sidewalk TEXT, 
            start_lat REAL,
            start_lng REAL,
            end_lat REAL,
            end_lng REAL,
            bike INTEGER NOT NULL DEFAULT 0 
        );`;

        // 3. 建立 Nodes 表
        const createNodesTableSql = `
        CREATE TABLE IF NOT EXISTS Nodes (
            node_id INTEGER PRIMARY KEY AUTOINCREMENT,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            UNIQUE(lat, lng)
        );`;

        // 4. 建立 Bike 表
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
            // (確保資料表存在 - 這一步總是安全的)
            db.run(createTableSql, (err) => {
                if (err) return reject(err);
                console.log('Table "Lines" is ready.');
            });
            db.run(createNodesTableSql, (err) => {
                if (err) return reject(err);
                console.log('Table "Nodes" is ready.');
            });
            db.run(createBikeTableSql, (err) => {
                if (err) return reject(err);
                console.log('Table "Bike" is ready.');
            });

            // *** 2. 關鍵修改：檢查開關 ***
            if (SKIP_INIT) {
                // 如果開關為 true，跳過所有資料載入步驟
                console.warn('SKIP_DB_INIT=true. Skipping data (re)load.');
                console.log('Using existing database data.');
                
                // 執行一個無意義的查詢，以確保隊列中的 CREATE TABLE 已完成
                db.run("SELECT 1", (err) => {
                    if (err) return reject(err);
                    resolve(); // 立刻 resolve，表示資料庫已就緒
                });

            } else {
                // 否則，執行完整的初始化流程 (您原本的程式碼)
                console.log('SKIP_DB_INIT is not set. Starting full database initialization...');

                console.log('Clearing existing data from tables...');
                db.run(`DELETE FROM Lines;`, (err) => { if (err) return reject(err); });
                db.run(`DELETE FROM Nodes;`, (err) => { if (err) return reject(err); });
                db.run(`DELETE FROM Bike;`, (err) => { if (err) return reject(err); });


                // 6. 啟動四階段處理
                db.run("SELECT 1", (err) => {
                    if (err) return reject(err);
                    
                    console.log('Database setup complete. Starting Step 1: Processing highway.geojson...');
                    
                    // 執行第一步：載入基礎道路
                    processHighwayGeoJSON(db, reject, () => {
                        // 第一步成功的回呼
                        console.log('Step 1 complete. Starting Step 2: Updating sidewalks...');
                        
                        // 執行第二步：更新人行道資訊
                        updateSidewalksFromGeoJSON(db, () => {
                            // 第二步成功的回呼
                            console.log('Step 2 complete. Starting Step 3: Processing bike.geojson...');
                            
                            // 執行第三步：載入自行車道
                            processBikeGeoJSON(db, () => {
                                // 第三步成功的回呼
                                console.log('Step 3 complete. Starting Step 4: Complex bike matching (Extension)...');
                                
                                const extension = new DatabaseServiceExtension();
                                
                                // 呼叫 hook
                                extension.startHook({
                                    fetchAllLines,
                                    fetchAllBikeLines,
                                    updateLinesBikeStatus
                                })
                                .then(() => {
                                    // 當 Hook 完成後，才真正 resolve
                                    console.log('Step 4 complete. All database tasks finished.');
                                    resolve(); 
                                })
                                .catch(reject); // 如果 hook 出錯，則 reject 整個
                                
                            }, reject); // 傳入 reject 供第三步使用

                        }, reject); // 傳入 reject 供第二步使用
                    });
                });
            }
        });
    });
}

// ... (processHighwayGeoJSON, updateSidewalksFromGeoJSON, processBikeGeoJSON 函式... )
// ... (這些函式與您上一回合的程式碼完全相同，請保留它們) ...

/**
 * (第 1 步) 處理 highway.geojson ...
 */
function processHighwayGeoJSON(db, reject, onSuccess) {
    const highwayGeoJSON = JSON.parse(fs.readFileSync('./highway.geojson', 'utf8'));
    console.log(`[Step 1] Total highway features found: ${highwayGeoJSON.features.length}`);
    const lineFeatures = highwayGeoJSON.features.filter(feature => feature.geometry.type === 'LineString');
    console.log(`[Step 1] Filtered LineString features: ${lineFeatures.length}`);
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
        element.geometry.coordinates.forEach(coordRaw => {
            let coord = { lat: coordRaw[1], lng: coordRaw[0] };
            nodeStmt.run(coord.lat, coord.lng);
            if (!last) { last = coord; return; }
            const line = { id: lineIdCounter, name: `uiiai${lineIdCounter}`, start: last, end: coord };
            lineStmt.run(line.id, line.name, roadName, null, line.start.lat, line.start.lng, line.end.lat, line.end.lng);
            lineIdCounter++;
            last = coord;
        });
    });
    lineStmt.finalize((err) => {
        if (err) { db.run("ROLLBACK;"); return reject(err); }
        nodeStmt.finalize((nodeErr) => {
            if (nodeErr) { db.run("ROLLBACK;"); return reject(nodeErr); }
            db.run("COMMIT;", (commitErr) => {
                if (commitErr) { db.run("ROLLBACK;"); return reject(commitErr); }
                console.log(`[Step 1] Successfully inserted ${lineIdCounter - 1} base lines.`);
                onSuccess(); 
            });
        });
    });
}

/**
 * (第 2 步) 讀取 osm-walk.geojson ...
 */
function updateSidewalksFromGeoJSON(db, resolve, reject) {
    let walkGeoJSON;
    try {
        walkGeoJSON = JSON.parse(fs.readFileSync('./osm-walk.geojson', 'utf8'));
    } catch (err) {
        console.warn("[Step 2] Skipping sidewalk update as osm-walk.geojson could not be read.");
        return resolve();
    }
    const lineFeatures = walkGeoJSON.features.filter(feature => feature.geometry.type === 'LineString');
    const updateLineSql = `UPDATE Lines SET sidewalk = ? WHERE (start_lat = ? AND start_lng = ? AND end_lat = ? AND end_lng = ?) OR (start_lat = ? AND start_lng = ? AND end_lat = ? AND end_lng = ?)`;
    db.run("BEGIN TRANSACTION;");
    const updateStmt = db.prepare(updateLineSql);
    let updatedCount = 0; 
    lineFeatures.forEach(element => {
        const properties = element.properties || {};
        const sidewalk = (properties["sidewalk"] === "no") ? null : properties["sidewalk"]; 
        if (!sidewalk) return;
        let last = null;
        element.geometry.coordinates.forEach(coordRaw => {
            let coord = { lat: coordRaw[1], lng: coordRaw[0] };
            if (!last) { last = coord; return; }
            updateStmt.run(sidewalk, last.lat, last.lng, coord.lat, coord.lng, coord.lat, coord.lng, last.lat, last.lng, function(err) {
                if (err) return; 
                if (this.changes > 0) updatedCount += this.changes;
            });
            last = coord;
        });
    });
    updateStmt.finalize((err) => {
        if (err) { db.run("ROLLBACK;"); return reject(err); }
        db.run("COMMIT;", (commitErr) => {
            if (commitErr) { db.run("ROLLBACK;"); return reject(commitErr); }
            console.log(`[Step 2] Sidewalk update complete. ${updatedCount} segment updates executed.`);
            resolve();
        });
    });
}

/**
 * (第 3 步) 處理 bike.geojson ...
 */
function processBikeGeoJSON(db, resolve, reject) {
    let bikeGeoJSON;
    try {
        bikeGeoJSON = JSON.parse(fs.readFileSync('./bike.geojson', 'utf8'));
    } catch (err) {
        console.warn("[Step 3] Skipping bike lane import as bike.geojson could not be read.");
        return resolve(); 
    }
    const lineFeatures = bikeGeoJSON.features.filter(feature => feature.geometry.type === 'LineString');
    const insertBikeSql = `INSERT INTO Bike (id, name, rd_from, start_lat, start_lng, end_lat, end_lng) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const insertNodeSql = `INSERT OR IGNORE INTO Nodes (lat, lng) VALUES (?, ?)`;
    db.run("BEGIN TRANSACTION;");
    const bikeStmt = db.prepare(insertBikeSql);
    const nodeStmt = db.prepare(insertNodeSql);
    let lineIdCounter = 1; 
    lineFeatures.forEach(element => {
        let last = null;
        const properties = element.properties || {};
        const roadName = properties["路段名稱"] || null; 
        element.geometry.coordinates.forEach(coordRaw => {
            let coord = { lat: coordRaw[1], lng: coordRaw[0] };
            nodeStmt.run(coord.lat, coord.lng);
            if (!last) { last = coord; return; }
            const line = { id: lineIdCounter, name: `bike${lineIdCounter}`, start: last, end: coord };
            bikeStmt.run(line.id, line.name, roadName, line.start.lat, line.start.lng, line.end.lat, line.end.lng);
            lineIdCounter++;
            last = coord;
        });
    });
    bikeStmt.finalize((err) => {
        if (err) { db.run("ROLLBACK;"); return reject(err); }
        nodeStmt.finalize((nodeErr) => {
            if (nodeErr) { db.run("ROLLBACK;"); return reject(nodeErr); }
            db.run("COMMIT;", (commitErr) => {
                if (commitErr) { db.run("ROLLBACK;"); return reject(commitErr); }
                console.log(`[Step 3] Successfully inserted ${lineIdCounter - 1} bike lines.`);
                resolve(); 
            });
        });
    });
}


// --- (其餘的資料庫存取函式) ---
// ... (這些函式與您上一回合的程式碼完全相同) ...

function findNodesInBounds(latMin, latMax, lngMin, lngMax) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM Nodes WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`;
        db.all(sql, [latMin, latMax, lngMin, lngMax], (err, rows) => {
            if (err) { reject(err); } else { resolve(rows); }
        });
    });
}

function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) { reject(err); } else { console.log('Database connection closed.'); resolve(); }
        });
    });
}

function findLinesConnectedToNodesInBounds(latMin, latMax, lngMin, lngMax) {
    return new Promise((resolve, reject) => {
        const sql = `
            WITH InBoundNodes AS (SELECT lat, lng FROM Nodes WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?)
            SELECT T1.* FROM Lines AS T1
            WHERE (T1.start_lat, T1.start_lng) IN (SELECT lat, lng FROM InBoundNodes)
            OR (T1.end_lat, T1.end_lng) IN (SELECT lat, lng FROM InBoundNodes);
        `;
        db.all(sql, [latMin, latMax, lngMin, lngMax], (err, rows) => {
            if (err) { reject(err); } else { resolve(rows); }
        });
    });
}

function findLinesConnectedToLine(lineId) {
    return new Promise((resolve, reject) => {
        const sql = `
            WITH TargetLineNodes AS (
                SELECT start_lat AS lat, start_lng AS lng FROM Lines WHERE id = ?
                UNION
                SELECT end_lat AS lat, end_lng AS lng FROM Lines WHERE id = ?
            )
            SELECT T1.* FROM Lines AS T1
            WHERE (T1.start_lat, T1.start_lng) IN (SELECT lat, lng FROM TargetLineNodes)
            OR (T1.end_lat, T1.end_lng) IN (SELECT lat, lng FROM TargetLineNodes);
        `;
        db.all(sql, [lineId, lineId], (err, rows) => {
            if (err) { reject(err); } else { resolve(rows); }
        });
    });
}

function fetchAllLines() {
    return new Promise((resolve, reject) => {
        console.log("Fetching all lines from 'Lines' table for matching...");
        const sql = "SELECT id, start_lat, start_lng, end_lat, end_lng FROM Lines";
        db.all(sql, [], (err, rows) => {
            if (err) { reject(err); } else { resolve(rows); }
        });
    });
}

function fetchAllBikeLines() {
    return new Promise((resolve, reject) => {
        console.log("Fetching all lines from 'Bike' table for matching...");
        const sql = "SELECT start_lat, start_lng, end_lat, end_lng FROM Bike";
        db.all(sql, [], (err, rows) => {
            if (err) { reject(err); } else { resolve(rows); }
        });
    });
}

/**
 * *** 新增函式 (已修復並改為 Async) ***
 * 批次更新 'Lines' 表，將 'bike' 欄位設為 1
 * (此版本會依序執行 chunks，以避免交易衝突)
 * @param {Array<number>} matchedLineIds - 包含所有匹配上的 Line ID 的陣列
 * @returns {Promise<number>} - 成功更新的行數
 */
async function updateLinesBikeStatus(matchedLineIds) {
    if (!Array.isArray(matchedLineIds) || matchedLineIds.length === 0) {
        console.log("No line IDs provided to update bike status.");
        return 0; // 0 筆變更
    }

    console.log(`Preparing to update ${matchedLineIds.length} lines as bike lanes (in chunks)...`);
    
    const chunkSize = 900;
    let totalChanges = 0; // 我們將在此累計總變更數

    // 關鍵：我們不再使用 Promise.all，而是使用一個會暫停的 for 迴圈
    for (let i = 0; i < matchedLineIds.length; i += chunkSize) {
        const chunk = matchedLineIds.slice(i, i + chunkSize);
        
        console.log(`  ... Processing chunk ${Math.floor(i / chunkSize) + 1} (IDs: ${chunk[0]}...${chunk[chunk.length-1]})`);

        // 'await' 會暫停 for 迴圈，直到這個 chunk 的 Promise 完成
        const changes = await new Promise((chunkResolve, chunkReject) => {
            const placeholders = chunk.map(() => '?').join(',');
            const sql = `UPDATE Lines SET bike = 1 WHERE id IN (${placeholders})`;

            // 1. 開始此 chunk 的交易
            db.run("BEGIN TRANSACTION;");
            
            db.run(sql, chunk, function(err) {
                if (err) {
                    console.error("Error updating bike status chunk:", err.message);
                    db.run("ROLLBACK;");
                    return chunkReject(err);
                }

                const numChanges = this.changes;
                
                // 2. 提交此 chunk 的交易
                db.run("COMMIT;", (commitErr) => {
                    if (commitErr) {
                        console.error("Error committing bike status update chunk:", commitErr.message);
                        db.run("ROLLBACK;");
                        return chunkReject(commitErr);
                    }
                    
                    // 3. 交易成功，Resolve 這個 chunk
                    chunkResolve(numChanges); 
                });
            });
        });

        // 'await' 已解除，將此 chunk 的變更數加總
        totalChanges += changes;
    }

    // 迴圈完成，所有 chunks 都已依序處理
    console.log(`[Update] Successfully marked ${totalChanges} lines as bike lanes in total.`);
    return totalChanges; // 回傳總數
}

/**
 * 尋找所有線路
 */
function findAllLines() {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM Lines`;
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}


// 匯出(Export)所有函式
module.exports = {
    initializeDatabase,
    findNodesInBounds,
    closeDatabase,
    findLinesConnectedToNodesInBounds,
    findLinesConnectedToLine,
    fetchAllLines,
    fetchAllBikeLines,
    updateLinesBikeStatus,
    findAllLines
};