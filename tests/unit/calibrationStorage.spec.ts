import { beforeEach, describe, expect, it } from 'vitest';
import { createDraft } from '../../src/lib/calibration';
import { clearCalibrationState, loadCalibrationState, saveCalibrationState } from '../../src/lib/calibrationStorage';

describe('calibrationStorage 草稿持久化', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('首次加载返回六点空草稿且无结果', () => {
    const state = loadCalibrationState();
    expect(state.draft).toEqual(createDraft());
    expect(state.judgedRaws).toBeNull();
    expect(state.result).toBeNull();
  });

  it('未提交草稿保存后刷新可恢复（含空缺项）', () => {
    const draft = { readings: ['0.71', '', '0.73', '0.74', '0.75', '0.76'] };
    saveCalibrationState(draft, null);

    const restored = loadCalibrationState();
    expect(restored.draft).toEqual(draft);
    expect(restored.result).toBeNull();
  });

  it('成功判定保存后重新判定恢复合格结果', () => {
    const readings = ['0.70', '0.72', '0.74', '0.76', '0.78', '0.80'];
    saveCalibrationState({ readings }, readings);

    const restored = loadCalibrationState();
    expect(restored.result?.verdict).toBe('pass');
    if (restored.result?.verdict === 'pass') {
      expect(restored.result.threshold.spread).toBe(0.1);
      expect(restored.result.readings.map((point) => point.value)).toEqual([0.7, 0.72, 0.74, 0.76, 0.78, 0.8]);
    }
  });

  it('需调机判定同样作为本次结果保留', () => {
    const readings = ['0.70', '0.71', '0.72', '0.73', '0.74', '0.91'];
    saveCalibrationState({ readings }, readings);

    const restored = loadCalibrationState();
    expect(restored.result?.verdict).toBe('adjust');
  });

  it('缓存损坏时退化为空草稿', () => {
    window.localStorage.setItem('braille-plate:calibration:v1', '{不是合法 JSON');
    expect(loadCalibrationState().draft).toEqual(createDraft());

    window.localStorage.setItem('braille-plate:calibration:v1', JSON.stringify({ draft: [1, 2, 3] }));
    expect(loadCalibrationState().draft).toEqual(createDraft());
  });

  it('clearCalibrationState 清空草稿与结果', () => {
    saveCalibrationState({ readings: ['0.7', '0.71', '0.72', '0.73', '0.74', '0.75'] }, null);
    clearCalibrationState();
    expect(loadCalibrationState().draft).toEqual(createDraft());
    expect(loadCalibrationState().result).toBeNull();
  });
});
