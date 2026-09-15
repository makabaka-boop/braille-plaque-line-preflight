import { describe, expect, it } from 'vitest';
import {
  KEY_TO_DOT,
  createTranscriptionService,
  normalizeCaptureKey,
  type CaptureEvent,
  type TranscriptionService
} from '../../src/lib/transcription';

function down(key: string, repeat = false): CaptureEvent {
  return { type: 'down', key, repeat };
}

function up(key: string): CaptureEvent {
  return { type: 'up', key };
}

const INTERRUPT: CaptureEvent = { type: 'interrupt' };

/** 依次送入事件，返回每次的处理结果。 */
function play(service: TranscriptionService, events: CaptureEvent[]) {
  return events.map((event) => service.handle(event));
}

describe('六键与点号映射', () => {
  it('F、D、S、J、K、L 分别对应 1 至 6 点', () => {
    expect(KEY_TO_DOT).toEqual({ f: 1, d: 2, s: 3, j: 4, k: 5, l: 6 });
  });

  it('每个点位键单独击键即提交对应单点方', () => {
    for (const [key, dot] of Object.entries(KEY_TO_DOT)) {
      const service = createTranscriptionService();
      const outcomes = play(service, [down(key), up(key)]);
      expect(outcomes).toEqual([{ kind: 'collecting' }, { kind: 'committed', cell: String(dot) }]);
      expect(service.getSnapshot().cells).toEqual([String(dot)]);
    }
  });

  it('键名归一：大写字母等价，空格接受多种键名', () => {
    expect(normalizeCaptureKey('F')).toBe('f');
    expect(normalizeCaptureKey('L')).toBe('l');
    expect(normalizeCaptureKey(' ')).toBe('space');
    expect(normalizeCaptureKey('Space')).toBe('space');
    expect(normalizeCaptureKey('Spacebar')).toBe('space');
    expect(normalizeCaptureKey('a')).toBeNull();
    expect(normalizeCaptureKey('Enter')).toBeNull();

    const service = createTranscriptionService();
    play(service, [down('J'), up('J')]);
    expect(service.getSnapshot().cells).toEqual(['4']);
  });
});

describe('并击裁决：与按下顺序无关的按键集合', () => {
  it('同一按键集合的不同交错顺序裁决出同一方', () => {
    const sequences: CaptureEvent[][] = [
      [down('f'), down('j'), down('k'), up('f'), up('j'), up('k')],
      [down('k'), down('j'), down('f'), up('k'), up('j'), up('f')],
      [down('j'), down('f'), up('j'), down('k'), up('f'), up('k')],
      [down('k'), down('f'), up('k'), down('j'), up('f'), up('j')]
    ];
    for (const sequence of sequences) {
      const service = createTranscriptionService();
      const outcomes = play(service, sequence);
      // 整轮只提交一次，且结果为点号升序的同一方
      expect(outcomes.filter((outcome) => outcome.kind === 'committed')).toEqual([
        { kind: 'committed', cell: '145' }
      ]);
      expect(service.getSnapshot().cells).toEqual(['145']);
      expect(service.getSnapshot().collecting).toBe(false);
    }
  });

  it('部分释放后补键：补按的点号并入同一方，全部释放才提交', () => {
    const service = createTranscriptionService();
    expect(service.handle(down('f'))).toEqual({ kind: 'collecting' });
    expect(service.handle(down('d'))).toEqual({ kind: 'collecting' });
    // 部分释放：F 松开但 D 仍按住，本轮不提交
    expect(service.handle(up('f'))).toEqual({ kind: 'collecting' });
    expect(service.getSnapshot().cells).toEqual([]);
    expect(service.getSnapshot().collecting).toBe(true);
    expect(service.getSnapshot().pendingDots).toBe('12');
    // 补键 S：点 3 并入本轮
    expect(service.handle(down('s'))).toEqual({ kind: 'collecting' });
    expect(service.getSnapshot().pendingDots).toBe('123');
    // 全部释放后提交一次
    expect(service.handle(up('d'))).toEqual({ kind: 'collecting' });
    expect(service.handle(up('s'))).toEqual({ kind: 'committed', cell: '123' });
    expect(service.getSnapshot().cells).toEqual(['123']);
  });

  it('本轮所有参与键都释放后才提交：逐键释放不中途成方', () => {
    const service = createTranscriptionService();
    play(service, [down('f'), down('s'), down('l')]);
    expect(service.handle(up('f'))).toEqual({ kind: 'collecting' });
    expect(service.handle(up('s'))).toEqual({ kind: 'collecting' });
    expect(service.getSnapshot().cells).toEqual([]);
    expect(service.handle(up('l'))).toEqual({ kind: 'committed', cell: '136' });
  });

  it('连续多方按顺序组成抄录稿并统计总方数', () => {
    const service = createTranscriptionService();
    play(service, [down('f'), down('j'), up('f'), up('j')]);
    play(service, [down(' '), up(' ')]);
    play(service, [down('d'), down('j'), down('k'), up('d'), up('j'), up('k')]);
    const snapshot = service.getSnapshot();
    expect(snapshot.cells).toEqual(['14', '', '245']);
    expect(snapshot.totalCells).toBe(3);
  });
});

describe('空格与空方', () => {
  it('空格单独一轮提交空方', () => {
    const service = createTranscriptionService();
    const outcomes = play(service, [down(' '), up(' ')]);
    expect(outcomes).toEqual([{ kind: 'collecting' }, { kind: 'committed', cell: '' }]);
    expect(service.getSnapshot().cells).toEqual(['']);
    expect(service.getSnapshot().totalCells).toBe(1);
  });

  it('空格与点位键同轮时按点位集合裁决', () => {
    const service = createTranscriptionService();
    const outcomes = play(service, [down(' '), down('f'), up(' '), up('f')]);
    expect(outcomes.at(-1)).toEqual({ kind: 'committed', cell: '1' });
    expect(service.getSnapshot().cells).toEqual(['1']);
  });

  it('连续空格提交连续空方', () => {
    const service = createTranscriptionService();
    play(service, [down(' '), up(' '), down(' '), up(' ')]);
    expect(service.getSnapshot().cells).toEqual(['', '']);
  });
});

describe('重复事件与无关按键', () => {
  it('自动重复被忽略，一轮仍只提交一次', () => {
    const service = createTranscriptionService();
    expect(service.handle(down('f'))).toEqual({ kind: 'collecting' });
    expect(service.handle(down('f', true))).toEqual({ kind: 'ignored' });
    expect(service.handle(down('f', true))).toEqual({ kind: 'ignored' });
    expect(service.handle(down('f', true))).toEqual({ kind: 'ignored' });
    expect(service.handle(up('f'))).toEqual({ kind: 'committed', cell: '1' });
    expect(service.getSnapshot().cells).toEqual(['1']);
  });

  it('同一键无 repeat 标记的重复按下同样被忽略（防御性）', () => {
    const service = createTranscriptionService();
    play(service, [down('d'), down('d'), down('d')]);
    expect(service.handle(up('d'))).toEqual({ kind: 'committed', cell: '2' });
    // 提交后的滞留释放不再产生新方
    expect(service.handle(up('d'))).toEqual({ kind: 'ignored' });
    expect(service.getSnapshot().cells).toEqual(['2']);
  });

  it('无关按键完全忽略：不开轮、不入方、不影响进行中的并击', () => {
    const service = createTranscriptionService();
    for (const key of ['a', 'Enter', 'Shift', 'ArrowLeft', '1', 'Control']) {
      expect(service.handle(down(key))).toEqual({ kind: 'ignored' });
      expect(service.handle(up(key))).toEqual({ kind: 'ignored' });
    }
    expect(service.getSnapshot().collecting).toBe(false);
    expect(service.getSnapshot().cells).toEqual([]);

    const outcomes = play(service, [down('f'), down('x'), up('x'), down('j'), up('f'), up('j')]);
    expect(outcomes.at(-1)).toEqual({ kind: 'committed', cell: '14' });
    expect(service.getSnapshot().cells).toEqual(['14']);
  });

  it('空按释放（无对应按下）被忽略', () => {
    const service = createTranscriptionService();
    expect(service.handle(up('f'))).toEqual({ kind: 'ignored' });
    expect(service.handle(up(' '))).toEqual({ kind: 'ignored' });
    expect(service.getSnapshot().cells).toEqual([]);
  });
});

describe('焦点中断清理', () => {
  it('并击中断仅取消未完成的一方，已提交方保留，重新录入可继续', () => {
    const service = createTranscriptionService();
    play(service, [down('f'), up('f')]); // 已提交第 1 方 "1"
    play(service, [down('d'), down('s')]); // 第 2 方并击中（2、3 点）

    expect(service.handle(INTERRUPT)).toEqual({ kind: 'cancelled', cell: '23' });
    const interrupted = service.getSnapshot();
    expect(interrupted.cells).toEqual(['1']);
    expect(interrupted.totalCells).toBe(1);
    expect(interrupted.collecting).toBe(false);
    expect(interrupted.pendingDots).toBe('');
    expect(interrupted.heldKeys).toEqual([]);
    expect(interrupted.notice).toContain('第 2 方');
    expect(interrupted.notice).toContain('重新录入');

    // 中断后滞留键的释放被忽略，不产生幽灵方
    expect(service.handle(up('d'))).toEqual({ kind: 'ignored' });
    expect(service.handle(up('s'))).toEqual({ kind: 'ignored' });
    expect(service.getSnapshot().cells).toEqual(['1']);

    // 重新聚焦后继续抄录：新一轮正常提交，提示随之清除
    play(service, [down('s'), up('s')]);
    const resumed = service.getSnapshot();
    expect(resumed.cells).toEqual(['1', '3']);
    expect(resumed.notice).toBeNull();
  });

  it('空格并击中的中断同样取消未提交的空方', () => {
    const service = createTranscriptionService();
    play(service, [down('f'), up('f')]);
    service.handle(down(' '));
    expect(service.handle(INTERRUPT)).toEqual({ kind: 'cancelled', cell: '' });
    expect(service.getSnapshot().cells).toEqual(['1']);
    expect(service.getSnapshot().notice).toContain('第 2 方');
  });

  it('空闲时中断为无操作：无提示、无状态变化', () => {
    const service = createTranscriptionService();
    expect(service.handle(INTERRUPT)).toEqual({ kind: 'noop' });
    const snapshot = service.getSnapshot();
    expect(snapshot.cells).toEqual([]);
    expect(snapshot.notice).toBeNull();
    expect(snapshot.collecting).toBe(false);
  });

  it('中断后按住不放的键不会因自动重复开新轮（无幽灵方）', () => {
    const service = createTranscriptionService();
    service.handle(down('f'));
    service.handle(INTERRUPT);
    // 物理上仍按住 F：操作系统继续上送自动重复，全部被忽略
    expect(service.handle(down('f', true))).toEqual({ kind: 'ignored' });
    expect(service.handle(down('f', true))).toEqual({ kind: 'ignored' });
    expect(service.handle(up('f'))).toEqual({ kind: 'ignored' });
    expect(service.getSnapshot().cells).toEqual([]);
    expect(service.getSnapshot().collecting).toBe(false);
  });
});

describe('抄录稿丢弃与快照契约', () => {
  it('discard 丢弃整份抄录稿与进行中的一轮', () => {
    const service = createTranscriptionService();
    play(service, [down('f'), up('f'), down(' '), up(' ')]);
    service.handle(down('j')); // 进行中的一轮
    service.discard();
    const snapshot = service.getSnapshot();
    expect(snapshot.cells).toEqual([]);
    expect(snapshot.totalCells).toBe(0);
    expect(snapshot.collecting).toBe(false);
    expect(snapshot.pendingDots).toBe('');
    expect(snapshot.heldKeys).toEqual([]);
    expect(snapshot.notice).toBeNull();
    // 丢弃后滞留释放被忽略，可重新开始
    expect(service.handle(up('j'))).toEqual({ kind: 'ignored' });
    play(service, [down('k'), up('k')]);
    expect(service.getSnapshot().cells).toEqual(['5']);
  });

  it('采集中的快照暴露本轮点位与按住键', () => {
    const service = createTranscriptionService();
    play(service, [down('f'), down('j')]);
    const snapshot = service.getSnapshot();
    expect(snapshot.collecting).toBe(true);
    expect(snapshot.pendingDots).toBe('14');
    expect(snapshot.heldKeys).toEqual(['f', 'j']);
    expect(snapshot.totalCells).toBe(0);
    expect(snapshot.notice).toBeNull();
  });

  it('快照返回副本：外部修改不影响内部抄录稿', () => {
    const service = createTranscriptionService();
    play(service, [down('f'), up('f')]);
    const snapshot = service.getSnapshot();
    snapshot.cells.push('999');
    snapshot.heldKeys.push('f');
    expect(service.getSnapshot().cells).toEqual(['1']);
    expect(service.getSnapshot().heldKeys).toEqual([]);
  });
});
