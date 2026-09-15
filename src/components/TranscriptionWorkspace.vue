<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue';
import {
  KEY_TO_DOT,
  createTranscriptionService,
  normalizeCaptureKey,
  type CaptureKey
} from '../lib/transcription';
import CellView from './CellView.vue';

/**
 * 六键抄录工作区：只消费采集服务输出的快照契约，
 * 不读取也不改写单稿预检、双稿核对、试压校准与识读训练的任何状态。
 * 抄录稿不做本地保存：离开本工作区（切换模式）即直接丢弃。
 */
const service = createTranscriptionService();
const snapshot = ref(service.getSnapshot());

const captureZone = ref<HTMLElement | null>(null);

const KEY_LABELS: Readonly<Record<Exclude<CaptureKey, 'space'>, string>> = {
  f: 'F',
  d: 'D',
  s: 'S',
  j: 'J',
  k: 'K',
  l: 'L'
};

const keyLegend = Object.entries(KEY_TO_DOT).map(([key, dot]) => ({
  label: KEY_LABELS[key as Exclude<CaptureKey, 'space'>],
  dot
}));

// 并击进行中的口语化提示：已累积点号或空方（仅空格参与）。
const pendingLabel = computed(() => {
  if (!snapshot.value.collecting) {
    return '';
  }
  if (snapshot.value.pendingDots === '') {
    return '空方（空格）';
  }
  return `第 ${snapshot.value.pendingDots.split('').join('、')} 点`;
});

const heldLabel = computed(() =>
  snapshot.value.heldKeys.map((key) => (key === 'space' ? '空格' : KEY_LABELS[key])).join(' + ')
);

function sync() {
  snapshot.value = service.getSnapshot();
}

function onKeyDown(event: KeyboardEvent) {
  if (normalizeCaptureKey(event.key) === null) {
    return; // 无关按键：不拦截默认行为，也不进入采集
  }
  event.preventDefault(); // 阻止空格滚动页面等默认行为
  service.handle({ type: 'down', key: event.key, repeat: event.repeat });
  sync();
}

function onKeyUp(event: KeyboardEvent) {
  if (normalizeCaptureKey(event.key) === null) {
    return;
  }
  event.preventDefault();
  service.handle({ type: 'up', key: event.key });
  sync();
}

// 焦点中断：采集区失焦、窗口失焦、页面隐藏都取消未完成的一方。
function interrupt() {
  service.handle({ type: 'interrupt' });
  sync();
}

function onVisibilityChange() {
  if (document.hidden) {
    interrupt();
  }
}

function clearAll() {
  service.discard();
  sync();
  captureZone.value?.focus();
}

onMounted(() => {
  window.addEventListener('blur', interrupt);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('blur', interrupt);
  document.removeEventListener('visibilitychange', onVisibilityChange);
});

// 离开工作区即丢弃抄录稿，不做任何本地保存。
onUnmounted(() => {
  service.discard();
});
</script>

<template>
  <section class="panel transcription-panel" aria-label="六键抄录">
    <p class="transcription-note">
      现场摸读带回核查：聚焦下方采集区后，以 F、D、S、J、K、L 并击录入 1 至 6 点的凸点方，空格录入空方；
      一方在本轮所有按键释放后提交。窗口失焦或页面隐藏会取消未完成的一方，重新聚焦后继续抄录。
      抄录稿不读取也不改写其他工作区的数据，离开本工作区即丢弃。
    </p>

    <ul class="key-legend" data-testid="key-legend" aria-label="六键点位对照">
      <li v-for="item in keyLegend" :key="item.label">
        <kbd>{{ item.label }}</kbd>
        <span>第 {{ item.dot }} 点</span>
      </li>
      <li>
        <kbd>空格</kbd>
        <span>空方</span>
      </li>
    </ul>

    <div
      ref="captureZone"
      class="capture-zone"
      :class="{ collecting: snapshot.collecting }"
      tabindex="0"
      role="group"
      aria-label="六键采集区，聚焦后并击录入"
      data-testid="capture-zone"
      @keydown="onKeyDown"
      @keyup="onKeyUp"
      @blur="interrupt"
    >
      <span v-if="snapshot.collecting" class="capture-live" data-testid="capture-live">
        并击中：{{ pendingLabel }}（按住 {{ heldLabel }}），松开全部按键提交本方
      </span>
      <span v-else class="capture-hint" data-testid="capture-hint">
        {{ snapshot.totalCells === 0 ? '点击此处聚焦，开始并击录入第一方' : '继续并击录入下一方' }}
      </span>
    </div>

    <p v-if="snapshot.notice" class="transcription-notice" role="alert" data-testid="transcription-notice">
      {{ snapshot.notice }}
    </p>

    <div class="transcription-actions">
      <button
        type="button"
        class="calibration-clear"
        data-testid="transcription-clear"
        :disabled="snapshot.totalCells === 0"
        @click="clearAll"
      >
        清空抄录稿
      </button>
    </div>
  </section>

  <section
    v-if="snapshot.totalCells > 0 || snapshot.collecting"
    class="panel transcription-result"
    data-testid="transcription-result"
    aria-label="抄录稿"
  >
    <h2>抄录稿（按录入顺序）</h2>
    <ol class="transcript-list" data-testid="transcript-list">
      <li v-for="(cell, index) in snapshot.cells" :key="index" class="transcript-item" data-testid="transcript-cell">
        <span class="transcript-no">第 {{ index + 1 }} 方</span>
        <CellView :cell="cell" />
      </li>
      <li v-if="snapshot.collecting" class="transcript-item is-pending" data-testid="transcript-pending">
        <span class="transcript-no">第 {{ snapshot.totalCells + 1 }} 方（录入中）</span>
        <CellView :cell="snapshot.pendingDots" />
      </li>
    </ol>
    <p class="total" data-testid="transcription-total">总方数：{{ snapshot.totalCells }} 方</p>
  </section>
</template>
