import assert from 'node:assert/strict';
import {
  diagnoseAttempt,
  displayTranscript,
  isGarbageTranscript,
  isNoSpeechResult,
  isPronunciationMatch,
  isSameSyllableWrongTone,
  isTonelessLatinNearMiss,
  onlyHanzi,
  pickBestTranscriptCandidate,
} from './scoring.ts';

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

// Single-char ASR: digits / latin are garbage
assert.equal(isGarbageTranscript('222'), true);
assert.equal(isGarbageTranscript('２２２'), true, 'fullwidth digits');
assert.equal(isGarbageTranscript('ok'), true);
assert.equal(isGarbageTranscript('啊啊'), true, 'filler particles are garbage');
assert.equal(isNoSpeechResult('222'), true);
assert.equal(isNoSpeechResult('以'), false);
assert.equal(displayTranscript('222'), '');
assert.equal(isPronunciationMatch('222', '椅', '椅'), false, 'digits must not match');

// Homophones with same tone should pass (pronunciation, not character ID)
assert.equal(isPronunciationMatch('以', '椅', '椅'), true, 'yi3 homophone 以≈椅');
assert.equal(isPronunciationMatch('已', '椅', '椅'), true, 'yi3 homophone 已≈椅');
assert.equal(isPronunciationMatch('意', '椅', '椅'), false, 'yi4 must not pass for yi3');
assert.equal(isPronunciationMatch('椅子', '椅', '椅'), true, 'compound containing target');
assert.equal(isPronunciationMatch('第一', '椅', '椅'), false, 'unrelated compound must fail');

const quoted = pickBestTranscriptCandidate(['「以」', '222'], '椅', '椅');
assert.equal(quoted.matched, true, 'quoted homophone still matches');

const fromCompound = pickBestTranscriptCandidate(['一把椅'], '椅', '椅');
assert.equal(fromCompound.matched, true, 'char extracted from compound');

// Latin / tone-mark romanization from some ASR engines
assert.equal(isPronunciationMatch('yǐ', '椅', '椅'), true, 'tone-mark yi3');
assert.equal(isPronunciationMatch('yi3', '椅', '椅'), true, 'numbered yi3');
assert.equal(isPronunciationMatch('yi4', '椅', '椅'), false, 'numbered yi4 must fail');
assert.equal(isPronunciationMatch('yi', '椅', '椅'), false, 'toneless latin must fail');

// Wrong-answer pick prefers closer pinyin (意 closer to 椅 than 媽)
const pickedWrong = pickBestTranscriptCandidate(['222', '媽', '意'], '椅', '椅');
assert.equal(pickedWrong.matched, false);
assert.equal(pickedWrong.transcript, '意');

// Alternatives: prefer matching homophone over garbage
const picked = pickBestTranscriptCandidate(['222', '以', '椅子'], '椅', '椅');
assert.equal(picked.matched, true);
assert.ok(onlyHanzi(picked.transcript).length >= 1);

const pickedGarbage = pickBestTranscriptCandidate(['222', 'um'], '椅', '椅');
assert.equal(pickedGarbage.matched, false);
assert.equal(pickedGarbage.transcript, '');

const toneOnly = diagnoseAttempt('椅', '意');
assert.equal(toneOnly.tone, true);
assert.ok(toneOnly.tips.some((t) => t.includes('聲調')), 'tone tip for yi4 vs yi3');
assert.equal(isSameSyllableWrongTone('意', '椅'), true);
assert.equal(isSameSyllableWrongTone('以', '椅'), false);
assert.equal(isTonelessLatinNearMiss('yi', '椅'), true);
assert.equal(isTonelessLatinNearMiss('yi3', '椅'), false);
assert.equal(isTonelessLatinNearMiss('ma', '椅'), false);

const tonelessPick = pickBestTranscriptCandidate(['yi', '222'], '椅', '椅');
assert.equal(tonelessPick.matched, false);
assert.equal(tonelessPick.transcript, 'yi');

console.log('scoring checks passed');
