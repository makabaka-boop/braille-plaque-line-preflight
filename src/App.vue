<script setup lang="ts">
import { computed, ref } from 'vue';
import { NUMBER_SIGN, VISUAL_ORDER, type BrailleCell } from './lib/braille';
import { planPlate } from './lib/precheck';
import { MAX_WIDTH, MIN_WIDTH } from './lib/layout';

const phrase = ref('');
const widthInput = ref('12');
const widthChoices = [4, 8, 12, 16, 20];

const plan = computed(() => planPlate(phrase.value, widthInput.value));
const hasOutput = computed(() => plan.value.errors.length === 0 && plan.value.totalCells > 0);

function raised(cell: BrailleCell, dot: number): boolean {
  return cell.split('').includes(String(dot));
}

function isNumberSign(cell: BrailleCell): boolean {
  return cell === NUMBER_SIGN;
}
</script>

<template>
  <main class="page">
    <header class="masthead">
      <h1>电梯与楼层导向铭牌 · 触觉版预检</h1>
      <p class="subtitle">压点前逐方核对点号组合、数字符（3456）与换行；全部计算在本机浏览器完成，不请求在线转换接口。</p>
    </header>

    <section class="panel input-panel" aria-label="制版输入">
      <label class="field">
        <span class="field-label">制版短句</span>
        <textarea
          v-model="phrase"
          rows="3"
          spellcheck="false"
          placeholder="允许：一二三四五六七八九零、半角数字、空格、“，”“。”“-”"
          data-testid="phrase-input"
        ></textarea>
      </label>

      <div class="field-row">
        <label class="field field-width">
          <span class="field-label">每行方数（{{ MIN_WIDTH }}–{{ MAX_WIDTH }} 方）</span>
          <input
            v-model="widthInput"
            type="number"
            :min="MIN_WIDTH"
            :max="MAX_WIDTH"
            step="1"
            inputmode="numeric"
            data-testid="width-input"
          />
        </label>
        <div class="width-quick" role="group" aria-label="快速选择每行方数">
          <button
            v-for="choice in widthChoices"
            :key="choice"
            type="button"
            class="quick-btn"
            :class="{ active: widthInput === String(choice) }"
            @click="widthInput = String(choice)"
          >
            {{ choice }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="plan.errors.length > 0" class="panel errors" role="alert" data-testid="errors">
      <h2>已阻止全部输出</h2>
      <ul>
        <li v-for="(error, i) in plan.errors" :key="i">{{ error }}</li>
      </ul>
    </section>

    <section v-else-if="hasOutput" class="panel preview" data-testid="preview" aria-label="逐方预览">
      <h2>逐方预览（每行 {{ plan.width }} 方）</h2>
      <div v-for="line in plan.lines" :key="line.index" class="plate-line" data-testid="plate-line">
        <span class="line-no">第 {{ line.index }} 行</span>
        <ol class="cells">
          <li
            v-for="(cell, cellIndex) in line.cells"
            :key="cellIndex"
            class="cell"
            :class="{ 'is-number-sign': isNumberSign(cell), 'is-empty': cell === '' }"
            :data-dots="cell"
            :data-number-sign="isNumberSign(cell) ? 'true' : 'false'"
          >
            <span class="dot-grid" aria-hidden="true">
              <span
                v-for="dot in VISUAL_ORDER"
                :key="dot"
                class="dot"
                :class="{ raised: raised(cell, dot) }"
                :data-dot="dot"
              ></span>
            </span>
            <span class="dots-label">{{ cell === '' ? '空方' : cell }}</span>
          </li>
        </ol>
      </div>
      <p class="total" data-testid="total-cells">总方数：{{ plan.totalCells }} 方（共 {{ plan.lines.length }} 行，末行不补齐）</p>
    </section>
  </main>
</template>
