/**
 * 试压校准工作区的本地草稿持久化。
 *
 * 领域模块（calibration.ts）只负责判定契约，不接触浏览器存储；
 * 本助手在其之外负责把“未提交草稿”和“本次成功判定所用读数”
 * 安全地写入 / 读出 localStorage，任何存储异常都退化为全新草稿，
 * 绝不影响单稿预检与双稿核对（离线运行同样可用）。
 */
import { createDraft, judgeCalibration, type CalibrationDraft, type CalibrationResult } from './calibration';

const STORAGE_KEY = 'braille-plate:calibration:v1';

export interface StoredCalibration {
  draft: CalibrationDraft;
  /** 最近一次成功判定（合格/需调机）所用的六点原始读数；无则为 null。 */
  judgedRaws: string[] | null;
  result: CalibrationResult | null;
}

interface StoredShape {
  draft?: unknown;
  judgedRaws?: unknown;
}

function draftReadings(value: unknown): string[] | null {
  if (isStringArray(value)) {
    return value.slice();
  }
  if (value !== null && typeof value === 'object' && isStringArray((value as { readings?: unknown }).readings)) {
    return ((value as { readings: string[] }).readings).slice();
  }
  return null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // 隐私模式等场景禁用存储时，退化为仅内存态。
    return null;
  }
}

/**
 * 读取上次未提交草稿与成功判定结果。
 * 判定结果不直接信任缓存，而是用领域服务按存下的读数重新判定，
 * 确保恢复后的结论与当前阈值规则始终一致。
 */
export function loadCalibrationState(): StoredCalibration {
  const fallback: StoredCalibration = { draft: createDraft(), judgedRaws: null, result: null };
  const store = storage();
  if (!store) {
    return fallback;
  }

  let parsed: StoredShape;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    parsed = JSON.parse(raw) as StoredShape;
  } catch {
    return fallback;
  }

  const storedReadings = draftReadings(parsed.draft);
  const draft: CalibrationDraft = storedReadings
    ? { readings: createDraft().readings.map((_, index) => storedReadings[index] ?? '') }
    : createDraft();

  if (!isStringArray(parsed.judgedRaws)) {
    return { draft, judgedRaws: null, result: null };
  }

  const judgedRaws = parsed.judgedRaws.slice(0, 6);
  const result = judgeCalibration(judgedRaws);
  if (result.verdict === 'blocked') {
    return { draft, judgedRaws: null, result: null };
  }
  return { draft, judgedRaws, result };
}

/** 保存草稿与本次成功判定所用读数（无效读数不构成结果，传 null）。 */
export function saveCalibrationState(draft: CalibrationDraft, judgedRaws: string[] | null): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ draft, judgedRaws }));
  } catch {
    // 配额或写入失败时忽略：本次会话内存态仍可继续判定。
  }
}

/** 清空所有校准本地状态（用于“清空重填”）。 */
export function clearCalibrationState(): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // 忽略删除失败。
  }
}
