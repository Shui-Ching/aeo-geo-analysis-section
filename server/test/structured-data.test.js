'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { flattenJsonLd } = require('../lib/analyzers/structured-data');

test('flattenJsonLd：單一物件包成單元素陣列', () => {
  const node = { '@type': 'Article', headline: '標題' };
  assert.deepEqual(flattenJsonLd(node), [node]);
});

test('flattenJsonLd：頂層陣列直接攤平', () => {
  const a = { '@type': 'Organization' };
  const b = { '@type': 'WebSite' };
  assert.deepEqual(flattenJsonLd([a, b]), [a, b]);
});

test('flattenJsonLd：@graph 容器攤平成成員陣列', () => {
  const a = { '@type': 'Organization' };
  const b = { '@type': 'WebSite' };
  const result = flattenJsonLd({ '@context': 'https://schema.org', '@graph': [a, b] });
  assert.deepEqual(result, [a, b], '@graph 容器本身不該出現在結果裡');
});

test('flattenJsonLd：巢狀的陣列與 @graph 遞迴攤平', () => {
  const a = { '@type': 'Article' };
  const b = { '@type': 'Person' };
  const c = { '@type': 'Product' };
  const result = flattenJsonLd([{ '@graph': [a, [b]] }, c]);
  assert.deepEqual(result, [a, b, c]);
});

test('flattenJsonLd：空陣列與空 @graph 得到空結果', () => {
  assert.deepEqual(flattenJsonLd([]), []);
  assert.deepEqual(flattenJsonLd({ '@graph': [] }), []);
});

test('flattenJsonLd：null 與 undefined 不進結果、不拋錯', () => {
  // JSON.parse('null') 是合法的，攤平時不能讓它變成 [null] 汙染後續的 @type 檢查。
  assert.deepEqual(flattenJsonLd(null), []);
  assert.deepEqual(flattenJsonLd(undefined), []);
  assert.deepEqual(flattenJsonLd([null, { '@type': 'Article' }]), [{ '@type': 'Article' }]);
});

test('flattenJsonLd：@graph 不是陣列時當成一般節點處理', () => {
  const node = { '@graph': { '@type': 'Article' } };
  assert.deepEqual(flattenJsonLd(node), [node], '畸形的 @graph 不該被當成容器攤開');
});

test('flattenJsonLd：巢狀屬性不會被攤平，只處理陣列與 @graph', () => {
  // author 是節點的屬性而不是獨立的頂層實體，content-trust 靠 `n.author` 判斷，
  // 攤平它會讓 author 物件本身被誤當成一個結構化資料節點。
  const node = { '@type': 'Article', author: { '@type': 'Person', name: '某人' } };
  assert.deepEqual(flattenJsonLd(node), [node]);
});
