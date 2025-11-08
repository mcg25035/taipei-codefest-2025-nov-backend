const express = require('express');
const app = express();
const cors = require("cors"); // 導入 cors 中間件

// 導入我們的資料庫服務
const databaseService = require('./databaseService');

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(cors()); // 配置 cors 中間件
app.use(express.json());

const PORT = 5121;

// --- API 路由 ---

app.get('/', (req, res) => {
  res.json({ message: 'Hello, World! Database is ready.' });
});

let counter = 0;
app.put('/interact', (req, res) => {
  if (!req.body.lng) {
    return res.status(400).json({ error: 'Missing required parameter: lng' });
  }
  if (!req.body.lat) {
    return res.status(400).json({ error: 'Missing required parameter: lat' });
  }

  counter++;
  counter %= 5;
  if (counter) {
    res.json({ message: '', lng: req.body.lng, lat: req.body.lat });
  } else {
    res.json({ message: 'Interaction received', lng: req.body.lng, lat: req.body.lat });
  }
});

// --- 新增的 API 路由，使用 databaseService ---
app.get('/nodes/in-bounds', async (req, res) => {
    try {
        const { latMin, latMax, lngMin, lngMax } = req.query;

        // 基礎的參數驗證
        if (!latMin || !latMax || !lngMin || !lngMax) {
            return res.status(400).json({ 
                error: 'Missing required query parameters: latMin, latMax, lngMin, lngMax' 
            });
        }

        // 呼叫服務模組的函式
        const nodes = await databaseService.findNodesInBounds(
            parseFloat(latMin),
            parseFloat(latMax),
            parseFloat(lngMin),
            parseFloat(lngMax)
        );

        res.json({
            message: `Found ${nodes.length} nodes.`,
            count: nodes.length,
            nodes: nodes
        });

    } catch (err) {
        console.error('Error in /nodes/in-bounds route:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.get('/lines/connected-to-nodes-in-bounds', async (req, res) => {
    try {
        const { latMin, latMax, lngMin, lngMax } = req.query;

        // 基礎的參數驗證
        if (!latMin || !latMax || !lngMin || !lngMax) {
            return res.status(400).json({ 
                error: 'Missing required query parameters: latMin, latMax, lngMin, lngMax' 
            });
        }

        // 呼叫我們在 service 中新增的函式
        const lines = await databaseService.findLinesConnectedToNodesInBounds(
            parseFloat(latMin),
            parseFloat(latMax),
            parseFloat(lngMin),
            parseFloat(lngMax)
        );

        res.json({
            message: `Found ${lines.length} lines connected to nodes in the specified bounds.`,
            count: lines.length,
            lines: lines // 回傳找到的線路
        });

    } catch (err) {
        console.error('Error in /lines/connected-to-nodes-in-bounds route:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// <--- 新增部分 START ---
app.get('/lines/:id/connected', async (req, res) => {
    try {
        // 1. 從 URL 參數中獲取 ID
        const { id } = req.params;

        // 2. 驗證 ID
        const lineId = parseInt(id, 10);
        if (isNaN(lineId)) {
            return res.status(400).json({ error: 'Invalid line ID provided.' });
        }

        // 3. 呼叫 databaseService 的新函式
        const lines = await databaseService.findLinesConnectedToLine(lineId);

        // 4. 處理找不到的情況
        // 如果 lineId 不存在，SQL 查詢會回傳空陣列
        if (lines.length === 0) {
            return res.status(404).json({
                message: `Line with ID ${lineId} not found.`,
                count: 0,
                lines: []
            });
        }

        // 5. 回傳結果
        res.json({
            message: `Found ${lines.length} lines connected to the nodes of line ${lineId}.`,
            count: lines.length,
            lines: lines
        });

    } catch (err) {
        console.error(`Error in /lines/${req.params.id}/connected route:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// <--- 新增部分 END ---


// --- 伺服器啟動邏輯 ---

/**
 * 主啟動函式
 */
async function startServer() {
    try {
        console.log('Initializing database... (This may take a moment)');
        // 1. 等待資料庫初始化 (包含載入 GeoJSON) 完成
        await databaseService.initializeDatabase();
        
        console.log('Database successfully initialized.');

        // 2. 資料庫準備就緒後，才啟動 Web 伺服器
        app.listen(PORT, () => {
            console.log(`Server listening on http://localhost:${PORT}`);
            console.log('Try visiting: http://localhost:5121/nodes/in-bounds?latMin=25.01&latMax=25.02&lngMin=121.540&lngMax=121.542');
            console.log('Try visiting: http://localhost:5121/lines/connected-to-nodes-in-bounds?latMin=25.01&latMax=25.02&lngMin=121.540&lngMax=121.542');
            console.log('Try visiting: http://localhost:5121/lines/10/connected'); // <--- 新增部分: 測試日誌
        });

    } catch (err) {
        console.error('Failed to initialize database or start server:', err.message);
        process.exit(1); // 如果資料庫初始化失敗，程式應退出
    }
}

// 執行啟動
startServer();

// (可選) 處理程式中斷 (Ctrl+C)，優雅地關閉資料庫
process.on('SIGINT', async () => {
    console.log('\nCaught interrupt signal. Closing database connection...');
    try {
        await databaseService.closeDatabase();
        process.exit(0);
    } catch (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
    }
});