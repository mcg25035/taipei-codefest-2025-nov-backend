const express = require("express");
const app = express();
const cors = require("cors"); // 導入 cors 中間件
const accidentDataModule = require("./big_body_counter");
const events = require("./events");

// 導入我們的資料庫服務
const databaseService = require("./databaseService");

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(cors()); // 配置 cors 中間件
app.use(express.json());

const PORT = 5121;

// 提供靜態檔案
app.get("/NPA_TMA2_JSON_7.json", (req, res) => {
    const path = require("path");
    res.sendFile(path.join(__dirname, "NPA_TMA2_JSON_7.json"));
});

// --- API 路由 ---

app.get("/", (req, res) => {
    res.json({ message: "Hello, World! Database is ready." });
});

let userStatus = [
    {
        id: "test-user",
        isInCarDangerZone: false,
    },
];

let getUser = (req) => {
    // 這裡我們簡單地返回第一個使用者，實際應用中應根據請求資訊來識別使用者
    return userStatus[0];
};

let CAR_DANGER_THRESHOLD = 50; // 假設的閾值

app.put("/interact", (req, res) => {
    let eventList = [];

    if (!req.body.lng) {
        return res
            .status(400)
            .json({ error: "Missing required parameter: lng" });
    }
    if (!req.body.lat) {
        return res
            .status(400)
            .json({ error: "Missing required parameter: lat" });
    }

    let tmp = accidentDataModule.query(req.body.lng, req.body.lat);

    console.log("事故指數:", tmp);

    if (tmp > CAR_DANGER_THRESHOLD) {
        if (userStatus[0].isInCarDangerZone) {
            return res.status(200).json({});
        }
        userStatus[0].isInCarDangerZone = true;
        eventList.push(events.USER_ENTERED_DANGER_ZONE);
    } else {
        userStatus[0].isInCarDangerZone = false;
    }

    if ( eventList.includes(events.USER_ENTERED_DANGER_ZONE) ) {
        return res.status(200).json({
            "type": "car",
            "message": "你現在進到高發事故，危險區，請你注意，不要變成大體或是害別人變成大體。"
        });
    }
});

//   counter++;
//   counter %= 5;
//   if (counter) {
//     res.json({ message: '', lng: req.body.lng, lat: req.body.lat });
//   } else {
//     res.json({ message: 'Interaction received', lng: req.body.lng, lat: req.body.lat });
//   }

// --- 新增的 API 路由，使用 databaseService ---
app.get("/nodes/in-bounds", async (req, res) => {
    try {
        const { latMin, latMax, lngMin, lngMax } = req.query;

        // 基礎的參數驗證
        if (!latMin || !latMax || !lngMin || !lngMax) {
            return res.status(400).json({
                error: "Missing required query parameters: latMin, latMax, lngMin, lngMax",
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
            nodes: nodes,
        });
    } catch (err) {
        console.error("Error in /nodes/in-bounds route:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/lines/connected-to-nodes-in-bounds", async (req, res) => {
    try {
        const { latMin, latMax, lngMin, lngMax } = req.query;

        // 基礎的參數驗證
        if (!latMin || !latMax || !lngMin || !lngMax) {
            return res.status(400).json({
                error: "Missing required query parameters: latMin, latMax, lngMin, lngMax",
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
            lines: lines, // 回傳找到的線路
        });
    } catch (err) {
        console.error(
            "Error in /lines/connected-to-nodes-in-bounds route:",
            err.message
        );
        res.status(500).json({ error: "Internal server error" });
    }
});

// <--- 新增部分 START ---
app.get("/lines/:id/connected", async (req, res) => {
    try {
        // 1. 從 URL 參數中獲取 ID
        const { id } = req.params;

        // 2. 驗證 ID
        const lineId = parseInt(id, 10);
        if (isNaN(lineId)) {
            return res.status(400).json({ error: "Invalid line ID provided." });
        }

        // 3. 呼叫 databaseService 的新函式
        const lines = await databaseService.findLinesConnectedToLine(lineId);

        // 4. 處理找不到的情況
        // 如果 lineId 不存在，SQL 查詢會回傳空陣列
        if (lines.length === 0) {
            return res.status(404).json({
                message: `Line with ID ${lineId} not found.`,
                count: 0,
                lines: [],
            });
        }

        // 5. 回傳結果
        res.json({
            message: `Found ${lines.length} lines connected to the nodes of line ${lineId}.`,
            count: lines.length,
            lines: lines,
        });
    } catch (err) {
        console.error(
            `Error in /lines/${req.params.id}/connected route:`,
            err.message
        );
        res.status(500).json({ error: "Internal server error" });
    }
});
// <--- 新增部分 END ---

// --- 新增的 API 路由，取得所有線路 ---
app.get("/lines", async (req, res) => {
    try {
        // 呼叫服務模組的函式
        const lines = await databaseService.findAllLines();

        res.json({
            message: `Found ${lines.length} lines in total.`,
            count: lines.length,
            lines: lines,
        });
    } catch (err) {
        console.error("Error in /lines route:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

// --- 伺服器啟動邏輯 ---

/**
 * 主啟動函式
 */
async function startServer() {
    try {
        console.log("Initializing database... (This may take a moment)");
        // 1. 等待資料庫初始化 (包含載入 GeoJSON) 完成
        await databaseService.initializeDatabase();

        console.log("Database successfully initialized.");

        // 2. 資料庫準備就緒後，才啟動 Web 伺服器
        app.listen(PORT, () => {
            console.log(`Server listening on http://localhost:${PORT}`);
            console.log(
                "Try visiting: http://localhost:5121/nodes/in-bounds?latMin=25.01&latMax=25.02&lngMin=121.540&lngMax=121.542"
            );
            console.log(
                "Try visiting: http://localhost:5121/lines/connected-to-nodes-in-bounds?latMin=25.01&latMax=25.02&lngMin=121.540&lngMax=121.542"
            );
            console.log(
                "Try visiting: http://localhost:5121/lines/10/connected"
            ); // <--- 新增部分: 測試日誌
            console.log("Try visiting: http://localhost:5121/lines");
        });
    } catch (err) {
        console.error(
            "Failed to initialize database or start server:",
            err.message
        );
        process.exit(1); // 如果資料庫初始化失敗，程式應退出
    }
}

// 執行啟動
startServer();

// (可選) 處理程式中斷 (Ctrl+C)，優雅地關閉資料庫
process.on("SIGINT", async () => {
    console.log("\nCaught interrupt signal. Closing database connection...");
    try {
        await databaseService.closeDatabase();
        process.exit(0);
    } catch (err) {
        console.error("Error closing database:", err.message);
        process.exit(1);
    }
});

console.log("uiiaiauiiiai");
console.log(accidentDataModule.query(121.5438, 25.033));
