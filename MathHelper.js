// 矩陣乘法函數 (你的原函數是正確的)
function leftMultipMatrix(a, b) {
    // ... 你的原始程式碼 ...
    if (!a || !b || !a[0] || !b[0] || a[0].length !== b.length) {
        throw new Error("Invalid matrices for multiplication.");
    }
    const result = [];
    for (let i = 0; i < a.length; i++) {
        result[i] = [];
        for (let j = 0; j < b[0].length; j++) {
            let sum = 0;
            for (let k = 0; k < a[0].length; k++) {
                sum += a[i][k] * b[k][j];
            }
            result[i][j] = sum;
        }
    }
    return result;
}
// 新增：計算 2x2 矩陣反矩陣的輔助函數
function invertMatrix(m) {
    const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
    // 如果行列式為 0，則沒有反矩陣
    if (det === 0) {
        return null;
    }
    const invDet = 1 / det;
    return [
        [m[1][1] * invDet, -m[0][1] * invDet],
        [-m[1][0] * invDet, m[0][0] * invDet],
    ];
}
function isInRact(ract, point) {
    // 1. 歸零座標軸 (使用南點作為新原點)
    const normalizedPoint = [point[0] - ract[2][0], point[1] - ract[2][1]];
    // 2. 建立由基底向量組成的變換矩陣 M
    // 基底向量 u = 西 - 南
    const u = [ract[3][0] - ract[2][0], ract[3][1] - ract[2][1]];
    // 基底向量 v = 東 - 南
    const v = [ract[1][0] - ract[2][0], ract[1][1] - ract[2][1]];
    const transformationMatrix = [
        [u[0], v[0]],
        [u[1], v[1]],
    ];
    // 3. 計算 M 的反矩陣 M⁻¹
    const inverseMatrix = invertMatrix(transformationMatrix);
    if (!inverseMatrix) {
        // 如果矩陣不可逆 (例如四個點共線)，則視為不在內部
        return false;
    }
    // 4. 將歸零點轉換到新座標系： newCoords = M⁻¹ * normalizedPoint
    const pointMatrix = [[normalizedPoint[0]], [normalizedPoint[1]]];
    const newCoordsMatrix = leftMultipMatrix(inverseMatrix, pointMatrix);
    const m = newCoordsMatrix[0][0];
    const n = newCoordsMatrix[1][0];
    // 5. 判斷新座標 (m, n) 是否在 [0, 1] x [0, 1] 的單位正方形內
    return m >= 0 && m <= 1 && n >= 0 && n <= 1;
}

/**
 * 判斷兩條線段是否平行
 * @param {Array<Number>} param0 - 第一條線段的起點 [x, y]
 * @param {Array<Number>} param1 - 第一條線段的終點 [x, y]
 * @param {Array<Number>} param2 - 第二條線段的起點 [x, y]
 * @param {Array<Number>} param3 - 第二條線段的終點 [x, y]
 * @returns {boolean} - 如果平行則返回 true，否則返回 false
 */
function isParallel([a1x, a1y], [a2x, a2y], [b1x, b1y], [b2x, b2y]) {
    const EPS = 8e-7;
    const ax = a2x - a1x;
    const ay = a2y - a1y;
    const bx = b2x - b1x;
    const by = b2y - b1y;
    return Math.abs(ax * by - ay * bx) < EPS;
}
// 測試

module.exports = {
    leftMultipMatrix,
    isInRact,
    invertMatrix,
    isParallel,
};
