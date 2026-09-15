<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  MAX_HEIGHT,
  MAX_SPREAD,
  MIN_HEIGHT,
  POINT_COUNT,
  POINT_LABELS,
  createDraft,
  formatHeight,
  judgeCalibration,
  type CalibrationResult,
  type PointJudgmentView,
  type PointReadingView
} from '../lib/calibration';
import { clearCalibrationState, loadCalibrationState, saveCalibrationState } from '../lib/calibrationStorage';

/**
 * 试压校准工作区：只消费校准领域服务输出的契约，
 * 不读取也不改写单稿预检或双稿核对的任何状态。
 * 未提交草稿与成功判定所用读数自动存入 localStorage，刷新后恢复。
 */
const restored = loadCalibrationState();

const readings = ref<string[]>(restored.draft.readings.slice());
const result = ref<CalibrationResult | null>(restored.result);
const judgedRaws = ref<string[] | null>(restored.judgedRaws);

const pointIndices = Array.from({ length: POINT_COUNT }, (_, index) => index);

const blockedReadings = computed<PointReadingView[]>(() =>
  result.value?.verdict === 'blocked' ? result.value.readings : []
);

const judgedPoints = computed<PointJudgmentView[]>(() =>
  result.value?.verdict === 'pass' || result.value?.verdict === 'adjust' ? result.value.readings : []
);

const threshold = computed(() =>
  result.value?.verdict === 'pass' || result.value?.verdict === 'adjust' ? result.value.threshold : null
);

function pointError(index: number): string | null {
  return blockedReadings.value[index]?.error?.message ?? null;
}

function judgedPoint(index: number): PointJudgmentView | null {
  return judgedPoints.value[index] ?? null;
}

function runJudge() {
  const judged = judgeCalibration(readings.value);
  result.value = judged;
  if (judged.verdict === 'blocked') {
    // 无效读数只构成输入受阻，不保留为本次判定结果。
    judgedRaws.value = null;
  } else {
    judgedRaws.value = readings.value.slice();
  }
  saveCalibrationState({ readings: readings.value.slice() }, judgedRaws.value);
}

function resetAll() {
  readings.value = createDraft().readings;
  result.value = null;
  judgedRaws.value = null;
  clearCalibrationState();
}

// 判定之后只要任一读数再被改动，上次结论立即失效并回到“未提交草稿”保存。
watch(
  readings,
  (values) => {
    if (result.value !== null) {
      result.value = null;
      judgedRaws.value = null;
    }
    saveCalibrationState({ readings: values.slice() }, null);
  },
  { deep: true }
);
</script>

<template>
  <section class="panel calibration-input" aria-label="试压校准录入">
    <p class="calibration-note">
      换模或保养后先压一张六点试压片：为 1 至 6 号点分别录入一次凸点高度（毫米），再执行判定。
      单点合格范围固定为 {{ MIN_HEIGHT.toFixed(2) }}–{{ MAX_HEIGHT.toFixed(2) }} 毫米，六点极差不得超过
      {{ MAX_SPREAD.toFixed(2) }} 毫米。校准结果独立保存，不影响单稿预检与双稿核对。
    </p>

    <ol class="point-grid" data-testid="point-grid">
      <li v-for="index in pointIndices" :key="index" class="point-field">
        <label class="point-label" :for="`height-input-${index + 1}`">{{ POINT_LABELS[index] }}</label>
        <span class="point-input-wrap">
          <input
            :id="`height-input-${index + 1}`"
            v-model="readings[index]"
            type="text"
            inputmode="decimal"
            spellcheck="false"
            placeholder="0.75"
            class="height-input"
            :class="{ 'input-invalid': pointError(index) !== null }"
            :aria-invalid="pointError(index) !== null"
            :aria-describedby="pointError(index) ? `height-error-${index + 1}` : undefined"
            :data-testid="`height-input-${index + 1}`"
          />
          <span class="unit">毫米</span>
        </span>
        <span v-if="pointError(index)" :id="`height-error-${index + 1}`" class="point-error" role="alert" :data-testid="`height-error-${index + 1}`">
          {{ pointError(index) }}
        </span>
      </li>
    </ol>

    <div class="calibration-actions">
      <button type="button" class="compare-btn" data-testid="calibration-judge" @click="runJudge">执行判定</button>
      <button type="button" class="calibration-clear" data-testid="calibration-clear" @click="resetAll">清空重填</button>
    </div>
  </section>

  <section
    v-if="result?.verdict === 'blocked'"
    class="panel errors calibration-blocked"
    role="alert"
    data-testid="calibration-blocked"
  >
    <h2>读数无效，已停止判定</h2>
    <p>{{ result.conclusion }}</p>
  </section>

  <section
    v-else-if="result"
    class="panel calibration-result"
    :class="`verdict-${result.verdict}`"
    :data-verdict="result.verdict"
    data-testid="calibration-result"
    aria-label="试压校准结果"
  >
    <h2>{{ result.verdict === 'pass' ? '试压校准：合格' : '试压校准：需调机' }}</h2>

    <table class="point-table">
      <thead>
        <tr>
          <th scope="col">点位</th>
          <th scope="col">实测值（毫米）</th>
          <th scope="col">单点判定</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="index in pointIndices" :key="index" class="point-row" :data-testid="`point-row-${index + 1}`">
          <td>{{ POINT_LABELS[index] }}</td>
          <td class="point-value" data-testid="point-value">{{ formatHeight(judgedPoint(index)?.value ?? 0) }}</td>
          <td>
            <span
              v-if="judgedPoint(index)?.inRange"
              class="point-tag ok"
              :data-testid="`point-status-${index + 1}`"
            >合格</span>
            <span v-else class="point-tag bad" :data-testid="`point-status-${index + 1}`">
              {{ judgedPoint(index)?.outReason?.message }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <dl v-if="threshold" class="threshold-summary" data-testid="threshold-summary">
      <div><dt>最小</dt><dd>{{ formatHeight(threshold.min) }} 毫米</dd></div>
      <div><dt>最大</dt><dd>{{ formatHeight(threshold.max) }} 毫米</dd></div>
      <div>
        <dt>极差</dt>
        <dd :class="{ bad: !threshold.spreadOk }">
          {{ formatHeight(threshold.spread) }} 毫米（限值 {{ formatHeight(threshold.spreadLimit) }} 毫米）
        </dd>
      </div>
    </dl>

    <p class="calibration-conclusion" role="status" data-testid="calibration-conclusion">
      {{ result.conclusion }}
    </p>
  </section>
</template>
