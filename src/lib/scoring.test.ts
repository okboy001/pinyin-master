import assert from 'node:assert/strict';
import { diagnoseAttempt, isPronunciationMatch, onlyHanzi } from './scoring.ts';

assert.equal(onlyHanzi('你好!'), '你好');
assert.equal(isPronunciationMatch('你好', '你好', '你好'), true);
assert.equal(isPronunciationMatch('我在学习中文', '學習', '学习'), false, 'long includes should fail');
assert.equal(isPronunciationMatch('学习', '學習', '学习'), true);

const toneIssue = diagnoseAttempt('媽', '罵');
assert.equal(toneIssue.tone, true);

const ok = diagnoseAttempt('朋友', '朋友');
assert.equal(ok.tone || ok.initial || ok.final, false);

assert.equal(isPronunciationMatch('花', '花兒', '花儿'), true, 'erhua optional');
assert.equal(isPronunciationMatch('花儿', '花', '花'), true, 'erhua accepted');
assert.equal(
  isPronunciationMatch('我想点一杯咖啡不要糖了', '我想點一杯咖啡不要糖', '我想点一杯咖啡不要糖'),
  true,
  'optional trailing 了 on long phrases',
);
assert.equal(
  isPronunciationMatch('请说慢一点', '請說慢一點', '请说慢一点'),
  true,
  'ASR prefix 请 stripped when already in target',
);
assert.equal(
  isPronunciationMatch('可以微信支付吗', '可以微信支付嗎', '可以微信支付吗'),
  true,
  'long phrase exact still passes',
);

console.log('scoring checks passed');
