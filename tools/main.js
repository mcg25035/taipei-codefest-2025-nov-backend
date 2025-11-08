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

// 3. 建立資料表 (使用 IF NOT EXISTS 避免重複建立)
const createTableSql = `
CREATE TABLE IF NOT EXISTS Lines (
    id INTEGER PRIMARY KEY,
    name TEXT,
    start_lat REAL,
    start_lng REAL,
    end_lat REAL,
    end_lng REAL
);`;

// 4. db.serialize 確保 SQL 語句依序執行
db.serialize(() => {
    db.run(createTableSql, (err) => {
        if (err) {
            return console.error('Error creating table:', err.message);
        }
        console.log('Table "Lines" is ready.');

        // 5. 在建立表格後，才開始處理 GeoJSON
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

    // 6. 準備 SQL 插入語句 (使用 ? 作為佔位符)
    const insertSql = `INSERT INTO Lines (id, name, start_lat, start_lng, end_lat, end_lng) VALUES (?, ?, ?, ?, ?, ?)`;
    
    // 7. 使用 Transaction (BEGIN/COMMIT) 大幅提升插入效能
    db.run("BEGIN TRANSACTION;");

    const stmt = db.prepare(insertSql);
    let lineIdCounter = 1;

    lineFeatures.forEach(element => {
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

            const line = {
                id: lineIdCounter,
                name: `uiiai${lineIdCounter}`,
                start: last,
                end: coord
            };
            
            // 8. 執行插入，傳入參數
            stmt.run(
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
    stmt.finalize((err) => {
        if (err) {
            console.error("Error finalizing statement:", err.message);
        }
        db.run("COMMIT;", (commitErr) => {
            if (commitErr) {
                console.error("Error committing transaction:", commitErr.message);
            }
            console.log(`Successfully inserted ${lineIdCounter - 1} lines into the database.`);
            
            // 10. 關閉資料庫連線
            db.close((err) => {
                if (err) {
                    return console.error('Error closing database:', err.message);
                }
                console.log('Database connection closed.');
            });
        });
    });
}