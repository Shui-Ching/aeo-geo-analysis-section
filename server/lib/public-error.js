'use strict';

/**
 * 建立「訊息可以原封不動回給前端」的錯誤。
 *
 * 抓取階段的錯誤分成兩類,分界線是「這句話有沒有洩漏內網的資訊」:
 *
 * - 可公開(用這個函式建立):只描述使用者輸入本身,或描述一台已經確定是公開主機
 *   的行為。前者例如 URL 格式無效、協定不支援;後者例如重導向次數超過上限、
 *   回應內容超過大小上限 —— 能走到那一步,代表連線早就通過 safeLookup 的網段檢查,
 *   對方必定是攻擊者自己也連得到的公開主機,講出來不會多給他任何情報。
 *
 * - 不可公開(維持 `new Error`):DNS 解析失敗、目標落在私有網段、連線被拒或逾時。
 *   這三種措辭的差異本身就是一個內網探測 oracle,攻擊者可以靠「回哪一種錯誤」
 *   推測某個內部主機名存不存在、有沒有對到內網位址。呼叫端(routes/analyze.js)
 *   會把它們一律換成同一句通用訊息,真正的原因只寫進伺服器 log。
 *
 * 屬性名沿用 http-errors 的 `expose` 慣例,語意相同:true 表示訊息可對外顯示。
 */
function publicError(message) {
  const err = new Error(message);
  err.expose = true;
  return err;
}

module.exports = { publicError };
