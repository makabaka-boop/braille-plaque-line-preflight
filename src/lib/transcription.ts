/**
 * 六键抄录（现场摸读带回核查）采集服务。
 *
 * 现场安装后的触觉铭牌需要把摸读结果带回核查：质检员聚焦采集区后，
 * 以 F、D、S、J、K、L 六键分别代表 1 至 6 点并击录入凸点方，空格录入空方。
 * 一方在本轮所有参与键释放后提交一次，按录入顺序组成抄录稿。
 *
 * 采集规则：
 *  - 裁决一方只看“本轮参与过的按键集合”，与按下、释放的先后顺序无关；
 *  - 一轮从第一个有效键按下开始，到本轮所有参与键全部释放时结束并提交一次；
 *  - 一轮之中部分释放后再补按其他有效键，补按的点号并入同一方；
 *  - 操作系统的自动重复（按住不放产生的重复 keydown）与无关按键一律忽略；
 *  - 空格不贡献点号：单独一轮空格提交空方；与点位键同轮时按点位集合裁决；
 *  - 窗口失焦或页面隐藏等焦点中断发生在并击中时，仅取消未完成的一方
 *    （已提交的抄录稿不受影响），并提示重新录入；重新聚焦后可继续抄录。
 *
 * 本服务只维护抄录稿内存态：不读取也不改写单稿预检、双稿核对、试压校准
 * 与识读训练的任何数据，不访问网络、存储或 DOM；离开工作区时由界面调用
 * discard 丢弃整份抄录稿，不做本地保存。
 */
import type { BrailleCell, BrailleDot } from './braille';

/** 采集区识别的按键：六个点位键与空格。 */
export type CaptureKey = 'f' | 'd' | 's' | 'j' | 'k' | 'l' | 'space';

/** 六键到点号的固定映射：F=1、D=2、S=3、J=4、K=5、L=6。 */
export const KEY_TO_DOT: Readonly<Record<Exclude<CaptureKey, 'space'>, BrailleDot>> = {
  f: 1,
  d: 2,
  s: 3,
  j: 4,
  k: 5,
  l: 6
};

/**
 * 把键盘事件键名归一为采集键。
 *
 * 字母键不区分大小写（Shift 不影响点位）；空格接受标准键名 ' '
 * 以及 'Space'、'Spacebar' 两种别名。无法识别的键返回 null，由服务忽略。
 */
export function normalizeCaptureKey(raw: string): CaptureKey | null {
  const key = raw.toLowerCase();
  switch (key) {
    case 'f':
    case 'd':
    case 's':
    case 'j':
    case 'k':
    case 'l':
      return key;
    case ' ':
    case 'space':
    case 'spacebar':
      return 'space';
    default:
      return null;
  }
}

/** 采集服务接收的三类事件：按下、释放、焦点中断。 */
export type CaptureEvent =
  | { type: 'down'; key: string; repeat?: boolean }
  | { type: 'up'; key: string }
  | { type: 'interrupt' };

/** 一次事件处理的结果契约，便于调用方与测试断言。 */
export type CaptureOutcome =
  | { kind: 'committed'; cell: BrailleCell }
  | { kind: 'collecting' }
  | { kind: 'ignored' }
  | { kind: 'cancelled'; cell: BrailleCell }
  | { kind: 'noop' };

/** 采集服务对外快照：界面只读取该契约渲染。 */
export interface TranscriptionSnapshot {
  /** 已提交的抄录稿，按录入顺序排列（空方为空字符串）。 */
  cells: BrailleCell[];
  /** 已提交总方数。 */
  totalCells: number;
  /** 是否正处于一轮并击采集中。 */
  collecting: boolean;
  /** 本轮已累积的点号方（升序点号；仅空格参与时为空方）。 */
  pendingDots: BrailleCell;
  /** 当前仍按住的有效键，按按下顺序排列。 */
  heldKeys: CaptureKey[];
  /** 焦点中断提示（已取消未完成的一方，请重新录入）；无则为 null。 */
  notice: string | null;
}

export interface TranscriptionService {
  handle: (event: CaptureEvent) => CaptureOutcome;
  /** 丢弃整份抄录稿与进行中的一轮（离开工作区时调用），不做任何本地保存。 */
  discard: () => void;
  getSnapshot: () => TranscriptionSnapshot;
}

function dotsToCell(dots: ReadonlySet<BrailleDot>): BrailleCell {
  return [...dots].sort((a, b) => a - b).join('');
}

/**
 * 创建六键抄录采集服务。
 *
 * 状态机只有“空闲 / 采集中”两态：任一有效键按下即开轮，
 * 本轮所有参与键释放即提交；焦点中断取消未提交的一轮。
 */
export function createTranscriptionService(): TranscriptionService {
  let cells: BrailleCell[] = [];
  let held: CaptureKey[] = [];
  let roundDots = new Set<BrailleDot>();
  let roundHasSpace = false;
  let notice: string | null = null;

  function handleDown(rawKey: string, repeat: boolean): CaptureOutcome {
    const key = normalizeCaptureKey(rawKey);
    if (key === null) {
      return { kind: 'ignored' };
    }
    // 自动重复与同一键的重复按下（防御无 repeat 标记的环境）一律忽略。
    if (repeat || held.includes(key)) {
      return { kind: 'ignored' };
    }
    held.push(key);
    if (key === 'space') {
      roundHasSpace = true;
    } else {
      roundDots.add(KEY_TO_DOT[key]);
    }
    return { kind: 'collecting' };
  }

  function handleUp(rawKey: string): CaptureOutcome {
    const key = normalizeCaptureKey(rawKey);
    if (key === null) {
      return { kind: 'ignored' };
    }
    const heldIndex = held.indexOf(key);
    if (heldIndex === -1) {
      // 滞留释放（如中断后仍按住的键）：本轮已无此键，忽略。
      return { kind: 'ignored' };
    }
    held.splice(heldIndex, 1);
    if (held.length > 0) {
      return { kind: 'collecting' };
    }
    // 本轮所有参与键均已释放：按按键集合裁决并提交一次。
    const cell = dotsToCell(roundDots);
    if (cell === '' && !roundHasSpace) {
      // 理论不可达：一轮至少有一个有效参与键。
      return { kind: 'ignored' };
    }
    cells.push(cell);
    roundDots = new Set<BrailleDot>();
    roundHasSpace = false;
    // 被取消的一方重新录入完成，中断提示随之失效。
    notice = null;
    return { kind: 'committed', cell };
  }

  function handleInterrupt(): CaptureOutcome {
    if (held.length === 0) {
      // 空闲时的失焦或页面隐藏没有可取消的一方。
      return { kind: 'noop' };
    }
    const cancelled = roundHasSpace && roundDots.size === 0 ? '' : dotsToCell(roundDots);
    held = [];
    roundDots = new Set<BrailleDot>();
    roundHasSpace = false;
    notice = `采集中断：已取消未完成的第 ${cells.length + 1} 方，请重新录入该方。`;
    return { kind: 'cancelled', cell: cancelled };
  }

  function handle(event: CaptureEvent): CaptureOutcome {
    switch (event.type) {
      case 'down':
        return handleDown(event.key, event.repeat ?? false);
      case 'up':
        return handleUp(event.key);
      case 'interrupt':
        return handleInterrupt();
    }
  }

  function discard(): void {
    cells = [];
    held = [];
    roundDots = new Set<BrailleDot>();
    roundHasSpace = false;
    notice = null;
  }

  function getSnapshot(): TranscriptionSnapshot {
    return {
      cells: cells.slice(),
      totalCells: cells.length,
      collecting: held.length > 0,
      pendingDots: dotsToCell(roundDots),
      heldKeys: held.slice(),
      notice
    };
  }

  return { handle, discard, getSnapshot };
}
