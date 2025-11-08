// 檔名: databaseServiceExtension.js

// 引入 isInRact 函數
let { isInRact } = require("./MathHelper");
/**
 * @class DatabaseServiceExtension
 * 處理資料庫初始化後的高階、複雜的業務邏輯，
 * 例如將自行車道資料與主要道路進行比對。
 */
class DatabaseServiceExtension {


    /**
     * 您的複雜線性代數比對函式
     * (注意：這是一個 class method)
     * @param {Object} line - {lat_start, lng_start, lat_end, lng_end}
     * @param {Object} bikeLine - {lat_start, lng_start, lat_end, lng_end}
     * @returns {boolean} - True if it's a match
     */
    isMatch(line, bikeLine) {
        // --- 1. 定義矩形的半徑/寬度 (Buffer) ---
        // 這個值決定了橘色矩形有多寬。您可以根據經緯度的實際比例調整。
        // 例如，0.0001 大約對應 10 公尺。
        const buffer = 0.0005; // 緩衝區寬度
        const buffer_rapid = 0.1; // 斜率容差

        // --- 2. 計算 bikeLine 的向量 ---
        const bike_start = { x: bikeLine.start_lng, y: bikeLine.start_lat };
        const bike_end = { x: bikeLine.end_lng, y: bikeLine.end_lat };

        // 方向向量 d = (end - start)
        const dx = bike_end.x - bike_start.x;
        const dy = bike_end.y - bike_start.y;

        // --- 3. 計算垂直法向量並正規化 (使其長度為 1) ---
        const perpendicular_dx = -dy;
        const perpendicular_dy = dx;
        
        const length = Math.sqrt(perpendicular_dx * perpendicular_dx + perpendicular_dy * perpendicular_dy);
        
        // 防止除以零的狀況 (如果 bikeLine 是一個點)
        if (length === 0) {
            return false;
        }

        const p_norm_dx = perpendicular_dx / length;
        const p_norm_dy = perpendicular_dy / length;
        
        // --- 4. 計算矩形的四個頂點 (順時針) ---
        // 根據縮放後的法向量計算位移
        const offsetX = p_norm_dx * buffer;
        const offsetY = p_norm_dy * buffer;

        // 西南 (South-West) -> 西北 (North-West) -> 東北 (North-East) -> 東南 (South-East)
        // 為了符合 isInRact 的 [東, 北, 南, 西] 的預期順序 (假設 v 是東，u 是西)，我們調整一下順序
        // v = 東 - 南, u = 西 - 南
        const north_west = [bike_start.x - offsetX, bike_start.y - offsetY]; // 西北
        const north_east = [bike_end.x - offsetX, bike_end.y - offsetY];   // 東北
        const south_east = [bike_end.x + offsetX, bike_end.y + offsetY];   // 東南 (新座標系的原點)
        const south_west = [bike_start.x + offsetX, bike_start.y + offsetY]; // 西南

        // 整理成 isInRact 需要的順時針陣列 [東, 北, 南, 西]
        const ract = [
            north_east, // 東 (v 的終點)
            north_west, // 北 (不直接使用，但保持順時針)
            south_west, // 南 (新座標系原點)
            south_east  // 西 (u 的終點)
        ];
        
        // --- 5. 取得 line 的兩個端點 ---
        const line_start_point = [line.start_lng, line.start_lat];
        const line_end_point = [line.end_lng, line.end_lat];

        // --- 6. 判斷 line 的任一端點是否在矩形內 ---
        const isStartIn = isInRact(ract, line_start_point);
        const isEndIn = isInRact(ract, line_end_point);

        const line_rapid = (line_start_point[0]-line_end_point[0])/(line_start_point[1]-line_end_point[1])
        const bike_rapid = (bike_start.x-bike_end.x)/(bike_start.y-bike_end.y)
        
        
        const sameR = Math.abs(((line_rapid / bike_rapid) - 1) < buffer_rapid ? true : false)

        return (isStartIn && isEndIn) && sameR;
    }

    /**
     * 啟動比對處理的掛鉤 (Hook)
     * * @param {Object} dbFunctions - 一個包含所需資料庫函式的物件
     * @param {Function} dbFunctions.fetchAllLines - 用於獲取所有 Lines
     * @param {Function} dbFunctions.fetchAllBikeLines - 用於獲取所有 Bike lines
     * @param {Function} dbFunctions.updateLinesBikeStatus - 用於寫回匹配的 ID
     * @returns {Promise<void>}
     */
    async startHook(dbFunctions) {
        // 從參數中解構出所需的函式
        const { fetchAllLines, fetchAllBikeLines, updateLinesBikeStatus } =
            dbFunctions;

        // 步驟 1: 讀取所有資料到記憶體
        console.log("[Extension] Fetching data for complex matching...");
        const [allLines, allBikeLines] = await Promise.all([
            fetchAllLines(),
            fetchAllBikeLines(),
        ]);
        console.log(
            `[Extension] Fetched ${allLines.length} lines and ${allBikeLines.length} bike lines.`
        );

        // 步驟 2: 執行您複雜的 N*M JavaScript 迴圈
        console.log("[Extension] Running complex 'isMatch' logic...");
        const matchedLineIds = [];

        for (const line of allLines) {
            for (const bikeLine of allBikeLines) {
                // 呼叫同一個 class 中的 isMatch method
                if (this.isMatch(line, bikeLine)) {
                    matchedLineIds.push(line.id);
                    // 找到一個匹配就夠了，跳到下一條 Line
                    break;
                }
            }
        }
        console.log(
            `[Extension] Matching complete. Found ${matchedLineIds.length} matching lines.`
        );

        // 步驟 3: 將結果批次寫回資料庫
        if (matchedLineIds.length > 0) {
            await updateLinesBikeStatus(matchedLineIds);
        } else {
            console.log("[Extension] No matches found, no updates needed.");
        }

        console.log("[Extension] Bike lane matching process complete.");
    }
}

// 匯出 class
module.exports = {
    DatabaseServiceExtension,
};
