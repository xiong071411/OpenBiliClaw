# 手机 Web 前端模块

## 概述

`web/` 是 OpenBiliClaw 的手机优先 Web 操作台。它面向“没有安装浏览器扩展、但已经有后端服务和公网入口”的使用场景，让手机浏览器可以直接访问推荐、画像、聊天、消息和运行状态。

Web 前端不承担跨站内容采集，也不会读取 B 站 / 小红书 / 抖音 / YouTube 的浏览器 Cookie。跨站登录态同步、内容脚本采集、系统通知、toolbar badge、side panel/sidebar 仍由浏览器扩展负责。

## 已实现功能

| 功能 | 状态 | 说明 |
|------|------|------|
| Vite 子项目 | ✅ | `web/package.json`、`tsconfig.json`、`vite.config.ts`，构建输出到 `web/dist/` |
| 移动端 Shell | ✅ | 顶部状态条 + hash route 主视图 + 底部导航，支持手机和桌面宽度 |
| 推荐页 | ✅ | `GET /api/recommendations`、换一批、继续加载、补货、喜欢 / 不喜欢 / 评论反馈、打开视频 |
| 画像页 | ✅ | 展示画像总述、核心特质、深层需求、MBTI、价值观、兴趣、避雷、常看 UP、认知风格、近期记忆和活跃洞察 |
| 聊天页 | ✅ | 使用 `/api/chat/turns` durable turn 创建、轮询和历史恢复，不走旧长请求 `/api/chat` |
| 消息页 | ✅ | 展示 `/api/delight/pending-batch` 惊喜推荐和画像中的 active speculative interests；支持惊喜反馈、兴趣确认/拒绝/多聊聊 |
| 设置页 | ✅ | 显示后端地址、健康状态、候选池数量、Cookie 状态提示和手动刷新推荐池按钮 |
| runtime-stream | ✅ | `client=web` 连接 `/api/runtime-stream`，处理补货、画像更新、惊喜推荐和兴趣探针事件 |
| PWA 基础 | ✅ | 提供 `manifest.webmanifest`，当前不启用 push notification |
| 部署脚本 | ✅ | `scripts/deploy_web_frontend.sh` 构建并 rsync 到宝塔站点静态目录，保留 `.well-known/` 与 `downloads/` |

## 公开 API

Web 前端通过 `web/src/api.ts` 统一封装请求，默认使用同源 `/api`：

```ts
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

await fetchRecommendations();
await reshuffleRecommendations();
await appendRecommendations(excludedBvids);
await submitFeedback(recommendationId, "like");
await fetchProfileSummary({ limit: 6 });
await startChatTurn("最近想看轻松一点的内容");
await respondToDelight(bvid, "like", title);
await respondToInterestProbe(domain, "confirm");
```

WebSocket URL 由当前协议自动推导：

```ts
// https://example.com/api -> wss://example.com/api/runtime-stream?client=web
createRuntimeStreamUrl();
```

## 配置项

| 配置 | 默认值 | 说明 |
|------|------|------|
| `VITE_API_BASE` | `/api` | 本地开发时可覆盖为 `https://bili.qingningplayer.top/api` |
| hash route | `#/recommend` | 避免依赖 Nginx history fallback；刷新仍请求 `/` |
| `web/dist/` | 构建产物 | 不提交到 Git，部署时生成 |

本模块不新增 `config.toml` 字段，不在浏览器里展示完整 API Key 或 Cookie。

## 设计决策

- 第一版使用原生 DOM + TypeScript，不引入 React/Vue，降低构建和运行复杂度。
- Web App 复制并整理扩展 popup 的纯前端逻辑，但不直接 import `extension/popup/*.js`，避免扩展生命周期和 `chrome.storage` 依赖泄漏到普通网页。
- 推荐、画像、聊天、消息、设置都走后端已有 API；跨站 Cookie 和页面采集能力明确留给扩展。
- 部署脚本使用 `rsync --delete` 同步静态产物，但排除 `.well-known/`、`downloads/`、`.user.ini`、`.htaccess` 和 `404.html`，避免破坏证书续签、扩展下载和宝塔隐藏文件。
