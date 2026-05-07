/**
 * utils.js — 日付・状態計算ユーティリティ
 */

/**
 * 今日の日付（時刻なし）を返す
 * @returns {Date}
 */
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 文字列（YYYY-MM-DD）をDateオブジェクトに変換する
 * @param {string} str
 * @returns {Date|null}
 */
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 日付を「YYYY年M月D日」形式の文字列に変換する
 * @param {string} str YYYY-MM-DD
 * @returns {string}
 */
function formatDateJP(str) {
  const d = parseDate(str);
  if (!d) return '—';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 収穫予定日の警告レベルを返す
 * @param {string} harvestDate YYYY-MM-DD
 * @returns {'over'|'soon'|null}
 *   'over'  … 収穫予定日超過
 *   'soon'  … 7日以内に収穫予定
 *   null    … 該当なし
 */
function getHarvestAlert(harvestDate) {
  const d = parseDate(harvestDate);
  if (!d) return null;
  const t = today();
  const diff = Math.floor((d - t) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'over';
  if (diff <= 7) return 'soon';
  return null;
}

/**
 * 追肥推奨かどうかを判定する
 * 直近 ±3日以内に追肥予定日があれば true
 * @param {string[]} fertilizeDates YYYY-MM-DD のリスト
 * @param {string[]} lastFertilized 実施済み日付のリスト
 * @returns {boolean}
 */
function isFertilizeDue(fertilizeDates, lastFertilized) {
  const t = today();
  return fertilizeDates.some(dateStr => {
    if (lastFertilized.includes(dateStr)) return false; // 実施済みはスキップ
    const d = parseDate(dateStr);
    if (!d) return false;
    const diff = Math.floor((d - t) / (1000 * 60 * 60 * 24));
    return diff >= -3 && diff <= 3;
  });
}

/**
 * ステータスの日本語ラベルを返す
 * @param {string} status
 * @returns {string}
 */
function statusLabel(status) {
  const map = {
    growing:    '成長中',
    harvesting: '収穫期',
    empty:      '空き',
    planned:    '作付け予定',
  };
  return map[status] ?? status;
}
