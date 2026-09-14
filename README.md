# 电梯与楼层导向铭牌 · 触觉版压点前预检

纯浏览器单页应用（Vue 3 + TypeScript + Vite）。制版员键入短句并选择每行方数（4–20），
页面按仓库内固定编码表逐方预览六点点位、数字符位置、换行与总方数，压点前直接发现差错。

**不请求任何在线转换接口**：编码、排版全部在浏览器本地完成。

## 编码规则（固定表，见 `src/lib/braille.ts`）

六点编号，左列 1、2、3，右列 4、5、6：

```
1 ─ 4
2 ─ 5
3 ─ 6
```

| 字符 | 点号方 |
| --- | --- |
| 一 二 三 四 五 六 七 八 九 零 | `1` `12` `14` `145` `15` `124` `1245` `125` `24` `245` |
| 半角 0–9 | 沿用对应中文数字编码（0→零`245`，1→一`1`，…，9→九`24`） |
| 数字符（每段连续半角数字前自动插入一方） | `3456` |
| 逗号 `，` / 句号 `。` / 连字符 `-` / 空格 | `2` / `256` / `36` / 空方 |

- 半角数字串遇到**任何非数字字符**即结束；下一段数字前重新插入数字符 `3456`。
- 中文数字不触发数字符。
- 允许字符仅限：`一二三四五六七八九零`、半角 `0-9`、空格、`，。-`。
- 排版：逐方填充，达到行宽换行，**不拆分编码方，也不补齐末行**。
- **非法字符、空文本或非法行宽（非 4–20 的整数）阻止全部输出。**

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 输出单页应用到 dist/
npm run preview    # 预览构建产物 http://localhost:4173
```

## 验收测试

```bash
npm run test:unit  # Vitest：编码表、数字符边界、行宽边界、逐方排版
npx playwright install --with-deps chromium   # 首次运行 E2E 需要
npm run test:e2e   # Playwright：错误字符阻止输出、制版点位、换行、无在线请求
npm test           # 单元测试 + E2E
```

## Docker Compose

默认只运行 `web`（nginx 托管静态文件）：

```bash
docker compose up web                 # 宿主端口默认 8080
WEB_PORT=9090 docker compose up -d web
```

一次性验收服务（Vitest + 构建 + Playwright，运行结束即退出）：

```bash
docker compose run --rm verify
```

## 目录

```
src/lib/braille.ts    固定编码表与逐字编码（纯函数）
src/lib/layout.ts     行宽校验与逐方换行
src/lib/precheck.ts   预检总入口（任一非法即阻止全部输出）
src/App.vue           输入与逐方预览（六点网格 + 点号标签 + 总方数）
tests/unit            Vitest
tests/e2e             Playwright
```
