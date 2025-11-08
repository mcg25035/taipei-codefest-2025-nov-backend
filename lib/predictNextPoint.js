/**
 * 根據一維數值序列，使用線性迴歸預測下一個值。
 * 這是一個輔助函式。
 * @param {number[]} values 包含五個歷史數據點的陣列
 * @param {number} [steps=1] 要預測多少個時間步後的結果 (預設為 1)
 * @returns {number} 預測的下一個數值
 */
function _linearRegressionPredictor(values, steps = 1) {
  const n = values.length;
  // 我們將時間步驟設為 0, 1, 2, 3, 4
  const time_steps = Array.from({ length: n }, (_, i) => i);

  const sum_t = time_steps.reduce((a, b) => a + b, 0);
  const sum_y = values.reduce((a, b) => a + b, 0);

  let sum_ty = 0;
  let sum_t_sq = 0;
  for (let i = 0; i < n; i++) {
    sum_ty += time_steps[i] * values[i];
    sum_t_sq += time_steps[i] * time_steps[i];
  }

  // 計算斜率 (m) 和截距 (b)
  const m = (n * sum_ty - sum_t * sum_y) / (n * sum_t_sq - sum_t * sum_t);
  const b = (sum_y - m * sum_t) / n;

  // 預測 `steps` 個時間步驟後的值
  const next_t = n + steps - 1;
  return m * next_t + b;
}

/**
 * 根據歷史五個二維點，預測 `steps` 個時間步後的二維點
 * @param {{x: number, y: number}[]} points 包含五個點物件的陣列
 * @param {number} [steps=1] 要預測多少個時間步後的結果 (預設為 1)
 * @returns {{x: number, y: number}|string} 預測的點物件，或錯誤訊息
 */
function predictNext2DPoint(points, steps = 1) {
  // 檢查輸入是否為包含五個點物件的有效陣列
  if (!Array.isArray(points) || points.length !== 5) {
    return "錯誤：請提供一個包含五個點物件的陣列。";
  }
  const isInvalid = points.some(
    (p) => typeof p !== "object" || p === null || isNaN(p.x) || isNaN(p.y)
  );
  if (isInvalid) {
    return "錯誤：陣列中的每個元素都必須是包含數字 x 和 y 屬性的物件。";
  }

  // 1. 分離 x 和 y 座標
  const x_coords = points.map((p) => p.x);
  const y_coords = points.map((p) => p.y);

  // 2. 獨立預測 x 和 y 的下一個值
  const predictedX = _linearRegressionPredictor(x_coords, steps);
  const predictedY = _linearRegressionPredictor(y_coords, steps);

  // 3. 組合結果
  return { x: predictedX, y: predictedY };
}

module.exports = {
  predictNext2DPoint,
};

const historicalPoints1 = [
  { x: 25.03780170016759, y: 121.5375953956165 },
  { x: 25.037637664361583, y: 121.53753839867564 },
  { x: 25.037609717498665, y: 121.53752632873523 },
  { x: 25.037587846036292, y: 121.53751492934708 },
  { x: 25.03756172178449, y: 121.53750755327236 },
];
const prediction1 = predictNext2DPoint(historicalPoints1);
console.log("歷史數據 1:", historicalPoints1);
console.log("預測的下一個點 (1 步):", prediction1); // 預期 x 每次加 10, y 每次加 5 => { x: 60, y: 30 }

const prediction5 = predictNext2DPoint(historicalPoints1, 5);
console.log("預測的下一個點 (5 步):", prediction5);

const prediction10 = predictNext2DPoint(historicalPoints1, 10);
console.log("預測的下一個點 (10 步):", prediction10);

const prediction20 = predictNext2DPoint(historicalPoints1, 20);
console.log("預測的下一個點 (20 步):", prediction20);
