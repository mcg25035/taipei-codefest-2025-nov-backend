const { readFileSync } = require('fs');

const BINS = [200, 200];
const EXTENT = [
  [121.4, 121.6],
  [24.9, 25.1],
];

/**
 * 查詢指定點的周圍遭的總數
 * @param longitude - 經度
 * @param latitude - 緯度
 * @param radius - 查詢的半徑，預設為 5
 * @returns 周圍遭的總數
 */
function query(longitude, latitude, options = {
    bins: BINS, 
    extent: EXTENT
}, radius = 5) {
  try {
    const gridJson = readFileSync('grid.json', 'utf8');
    const grid = JSON.parse(gridJson);

    const { bins, extent } = options;

    const [[xmin, xmax], [ymin, ymax]] = extent;
    const [nx, ny] = bins;

    const dx = (xmax - xmin) / nx;
    const dy = (ymax - ymin) / ny;

    const i = Math.floor((longitude - xmin) / dx);
    const j = Math.floor((latitude - ymin) / dy);
    if (i < 0 || i >= nx || j < 0 || j >= ny) return 0;

    let sum = 0;
    for (let dyIdx = -radius; dyIdx <= radius; dyIdx++) {
      for (let dxIdx = -radius; dxIdx <= radius; dxIdx++) {
        const ii = i + dxIdx;
        const jj = j + dyIdx;
        if (ii >= 0 && ii < nx && jj >= 0 && jj < ny) {
          sum += grid[jj][ii].count;
        }
      }
    }

    console.log('[Query] Query successful:', sum);
    return sum;
  } catch (error) {
    console.error('[Query] Error:', error);
    return 0;
  }
}


module.exports = {
  query,
};