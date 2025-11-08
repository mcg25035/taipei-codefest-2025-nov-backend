const fs = require('fs');
const sqlite3 = require('sqlite3').verbose(); // 1. 引入 sqlite3

/**
 * @typedef {Object} Node
 * @property {number} lat - The latitude of the node.
 * @property {number} lng - The longitude of the node.
 */

/**
 * @typedef {Object} Line
 * @property {number} id - The unique identifier for the line.
 * @property {string} name - The name of the line.
 * @property {Node} start - The starting node of the line.
 * @property {Node} end - The ending node of the line.
 */

// 2. 連接到 SQLite 資料庫 (如果檔案不存在，會自動建立)
const db = new sqlite3.Database('./water_lines.db', (err) => {
    if (err) {
        return console.error('Error connecting to database:', err.message);
    }
    console.log('Connected to the SQLite database.');
});

// 3. 建立資料表 (Lines)
const createTableSql = `
CREATE TABLE IF NOT EXISTS Lines (
    id INTEGER PRIMARY KEY,
    name TEXT,
    start_lat REAL,
    start_lng REAL,
    end_lat REAL,
    end_lng REAL
);`;

// 3b. 建立 non-repeat nodes 資料表
// 使用 UNIQUE(lat, lng) 確保節點的唯一性
const createNodesTableSql = `
CREATE TABLE IF NOT EXISTS Nodes (
    node_id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    UNIQUE(lat, lng)
);`;


// 4. db.serialize 確保 SQL 語句依序執行
// 4. db.serialize 確保 SQL 語句依序執行
db.serialize(() => {
    // 執行建立 Lines 表
    db.run(createTableSql, (err) => {
        if (err) {
            return console.error('Error creating Lines table:', err.message);
        }
        console.log('Table "Lines" is ready.');
    });

    // 執行建立 Nodes 表
    db.run(createNodesTableSql, (err) => {
        if (err) {
            return console.error('Error creating Nodes table:', err.message);
        }
        console.log('Table "Nodes" is ready.');
    });

    // --- 新增的程式碼 ---
    // 在匯入資料前，先清空舊資料，這樣 ID 才能從 1 重新開始
    console.log('Clearing existing data from tables...');
    db.run(`DELETE FROM Lines;`, (err) => {
        if (err) {
            return console.error('Error clearing Lines table:', err.message);
        }
        console.log('Table "Lines" cleared.');
    });

    db.run(`DELETE FROM Nodes;`, (err) => {
        if (err) {
            return console.error('Error clearing Nodes table:', err.message);
        }
        console.log('Table "Nodes" cleared.');
    });
    // --- 新增結束 ---


    // 5. 在建立/清空表格後，才開始處理 GeoJSON
    db.run("SELECT 1", (err) => {
        if (err) {
            return console.error('Error queueing processGeoJSON:', err.message);
        }
        console.log('Database setup complete. Starting GeoJSON processing...');
        processGeoJSON();
    });
});

function processGeoJSON() {
    const waterGeoJSON = JSON.parse(fs.readFileSync('./water.geojson', 'utf8'));
    console.log(`Total features found: ${waterGeoJSON.features.length}`);

    const lineFeatures = waterGeoJSON.features.filter(feature => {
        return feature.geometry.type === 'LineString';
    });
    console.log(`Filtered LineString features: ${lineFeatures.length}`);

    // 6. 準備 SQL 插入語句 (Lines)
    const insertLineSql = `INSERT INTO Lines (id, name, start_lat, start_lng, end_lat, end_lng) VALUES (?, ?, ?, ?, ?, ?)`;
    
    // 6b. 準備 SQL 插入語句 (Nodes)
    // 使用 "INSERT OR IGNORE" 來自動處理重複的節點
    const insertNodeSql = `INSERT OR IGNORE INTO Nodes (lat, lng) VALUES (?, ?)`;

    // 7. 使用 Transaction (BEGIN/COMMIT) 大幅提升插入效能
    db.run("BEGIN TRANSACTION;");

    const lineStmt = db.prepare(insertLineSql);
    const nodeStmt = db.prepare(insertNodeSql);
    let lineIdCounter = 1;

    lineFeatures.forEach(element => {
        let last = null;
        element.geometry.coordinates.forEach(coordRaw => {
            let coord = {
                lat: coordRaw[1],
                lng: coordRaw[0]
            };

            // 嘗試插入每一個節點，重複的會被 IGNORE
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
            
            // 8. 執行插入 (Lines)
            lineStmt.run(
                line.id,
                line.name,
                line.start.lat,
                line.start.lng,
                line.end.lat,
                line.end.lng
            );

            lineIdCounter++;
            last = coord;
        });
    });

    // 9. 結束並提交 Transaction
    lineStmt.finalize((err) => {
        if (err) {
            console.error("Error finalizing line statement:", err.message);
        }
        console.log('Line statement finalized.');

        // 在 lineStmt 完成後，finalize nodeStmt
        nodeStmt.finalize((nodeErr) => {
            if (nodeErr) {
                console.error("Error finalizing node statement:", nodeErr.message);
            }
            console.log('Node statement finalized.');

            // --- MODIFIED ---
            // 確保兩個 statement 都 finalize 之後，才 COMMIT
            // 將回呼函式改為 async 以便使用 await
            db.run("COMMIT;", async (commitErr) => {
                if (commitErr) {
                    console.error("Error committing transaction:", commitErr.message);
                    // 如果 commit 失敗，可能需要 ROLLBACK
                    db.run("ROLLBACK;");
                    return;
                }
                
                console.log(`Successfully inserted ${lineIdCounter - 1} lines into the database.`);
                console.log('Node insertion complete (duplicates ignored).');
                
                
                // --- NEW ---
                // 在提交 Transaction 成功後，關閉資料庫之前，執行查詢
                try {
                    console.log('\n--- 正在查詢範圍內的節點 ---');
                    // 範例查詢範圍 (您可以自行修改這些值)
                    const latMin = 25.01;
                    const latMax = 25.02;
                    const lngMin = 121.540;
                    const lngMax = 121.542;
                    
                    const nodes = await findNodesInBounds(latMin, latMax, lngMin, lngMax);
                    
                    console.log(`在 [Lat: ${latMin} - ${latMax}, Lng: ${lngMin} - ${lngMax}] 範圍內找到 ${nodes.length} 個節點:`);
                    console.log(nodes);

                } catch (queryErr) {
                    console.error('查詢節點時發生錯誤:', queryErr.message);
                }
                // --- END NEW ---

                
                // 10. 關閉資料庫連線 (在查詢完成後)
                db.close((err) => {
                    if (err) {
                        return console.error('Error closing database:', err.message);
                    }
                    console.log('Database connection closed.');
                });
            });
            // --- END MODIFIED ---
        });
    });
}


// --- 這是您要求的新函式 ---

/**
 * 查詢在指定經緯度範圍內的節點
 * @param {number} latMin - 最小緯度
 * @param {number} latMax - 最大緯度
 * @param {number} lngMin - 最小經度
 * @param {number} lngMax - 最大經度
 * @returns {Promise<Array<Object>>} - 包含節點的陣列 (e.g., [{node_id: 1, lat: 25.1, lng: 121.5}, ...])
 */
function findNodesInBounds(latMin, latMax, lngMin, lngMax) {
    // 'db' 變數是從外部(頂層)範圍抓取的
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT * FROM Nodes 
            WHERE lat BETWEEN ? AND ? 
              AND lng BETWEEN ? AND ?
        `;
        // 參數的順序必須對應 '?' 的順序
        const params = [latMin, latMax, lngMin, lngMax];

        // db.all() 用於執行 SELECT 查詢並獲取所有結果
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Error querying nodes in bounds:', err.message);
                reject(err);
            } else {
                // 'rows' 是一個包含所有結果的陣列
                resolve(rows);
            }
        });
    });
}