# OpenBiliClaw 手机 Web 前端实施文档

本文档给后续执行者使用，目标是在现有源码部署基础上新增一个可在手机浏览器直接使用的 Web 前端。执行者需要先阅读本文件，再动代码。

## 0. 当前部署和项目路径

- 项目绝对路径：`/root/OpenBiliClaw`
- 当前部署方式：源码部署，不是 Docker
- 后端服务：`openbiliclaw.service`
- 后端本机监听：`http://127.0.0.1:8420`
- 公网入口：`https://bili.qingningplayer.top`
- 公网 API 前缀：`https://bili.qingningplayer.top/api`
- 宝塔站点静态目录：`/www/wwwroot/bili.qingningplayer.top`
- Nginx vhost：`/www/server/panel/vhost/nginx/bili.qingningplayer.top.conf`
- 当前模型：OpenAI-compatible MiMo，base URL 为 `https://token-plan-cn.xiaomimimo.com/v1`
- 当前 B 站 Cookie 来源：`/root/b站cookie.txt`，初始化脚本已兼容导入

执行前必须先看：

```bash
cd /root/OpenBiliClaw
git status --short --branch
```

注意：当前工作区可能有部署适配产生的本机改动，例如扩展默认后端地址、MiMo health-check 兼容、API key 遮罩、初始化脚本等。不要随手 revert 这些改动。

## 1. 目标

新增一个独立的手机 Web 前端，让用户不安装浏览器扩展也能在手机浏览器里使用核心功能。

第一版目标不是复刻浏览器扩展所有能力，而是把已经由后端 API 支撑的产品能力做成手机可用的网页操作台。

第一版必须实现：

- 推荐流：查看推荐、打开视频、喜欢、不喜欢、写反馈、换一批、继续加载。
- 用户画像：查看画像文本、核心特质、深层需求、MBTI、价值观、兴趣、避雷、认知风格、近期记忆、活跃洞察。
- 聊天：发送消息、显示历史 turn、等待后端 durable turn 完成。
- 运行状态：显示后端在线状态、初始化状态、候选池数量、推荐数量、最近补货情况。
- 惊喜推荐和兴趣探针：能展示、确认、拒绝、聊一聊。
- 移动端优先布局：手机 Firefox/Chrome/Safari 能正常使用。

第一版可以先不实现：

- 小红书、抖音、YouTube 的页面内容采集。
- 浏览器 Cookie 自动同步。
- 浏览器扩展通知、toolbar badge、side panel/sidebar。
- 后台任务派发器。
- PWA push notification。

这些必须在文案上解释为“需要浏览器扩展或未来 Web/PWA 版本支持”，不要假装已经实现。

## 2. 为什么能做 Web

现有扩展的 `popup/` 页面本质已经是一个前端 App，只是运行在浏览器扩展容器里。它的推荐、画像、聊天、状态、反馈等主要功能都走后端 HTTP API 和 WebSocket。

主要可复用依据：

- `extension/popup/popup.html`：现有产品 UI 的 HTML 和 CSS 视觉系统。
- `extension/popup/popup.js`：推荐、画像、聊天、消息、状态的状态管理和 DOM 渲染逻辑。
- `extension/popup/popup-api.js`：后端 API 封装。
- `extension/popup/popup-helpers.js`：推荐项规范化、状态文案、卡片 UI 状态等纯 helper。
- `extension/popup/popup-stream.js`：runtime-stream WebSocket 连接。
- `docs/index.html`：项目官网/品牌页，可参考颜色、字体、品牌感，但不要直接当功能前端。

## 3. 现有能力和 Web 可实现范围

### 3.1 可以在 Web 中完整实现

这些功能已经有后端 API 支撑，Web 前端可以直接调用：

| 功能 | API | Web 实现说明 |
|---|---|---|
| 健康检查 | `GET /api/health` | 页面顶部状态徽标 |
| 运行状态 | `GET /api/runtime-status` | 候选池、推荐数、最近刷新、补货数量 |
| 用户画像 | `GET /api/profile-summary` | 画像页完整展示 |
| 推荐列表 | `GET /api/recommendations` | 推荐流首屏 |
| 换一批 | `POST /api/recommendations/reshuffle` | 替换当前推荐流 |
| 继续加载 | `POST /api/recommendations/append` | 滚到底追加 |
| 后台补货 | `POST /api/recommendations/refresh` | 手动触发补货，显示等待状态 |
| 推荐反馈 | `POST /api/feedback` | 喜欢/不喜欢/评论反馈 |
| 活动流 | `GET /api/activity-feed` | 可做首页动态/底部状态 |
| 惊喜推荐 | `GET /api/delight/pending-batch` | 消息/惊喜模块 |
| 惊喜反馈 | `POST /api/delight/respond` | 看看/喜欢/不喜欢/聊一聊 |
| 兴趣探针 | runtime-stream + `POST /api/interest-probes/respond` | 确认/拒绝/多聊聊 |
| 聊天 | `POST /api/chat/turns`, `GET /api/chat/turns`, `GET /api/chat/turns/{turn_id}` | 使用 durable turn，避免长请求中断 |
| WebSocket 状态流 | `WS /api/runtime-stream?client=web` | 接收 profile 更新、delight、probe、runtime 事件 |

### 3.2 Web 中会有差异

这些能力不能只靠普通网页实现，原因是手机网页没有浏览器扩展权限：

| 原扩展能力 | Web 差异 |
|---|---|
| 自动读取 B 站 Cookie | 普通网页不能读取 `bilibili.com` 的 Cookie。当前服务器已支持从 `/root/b站cookie.txt` 导入。 |
| 自动读取抖音 Cookie | 普通网页不能读取 `douyin.com` Cookie。 |
| 内容脚本采集点击、停留、搜索、滚动 | 普通网页只能采集 Web 前端内的点击，不能采集 B 站页面内行为。 |
| 小红书/抖音/YouTube 登录态任务 | 需要扩展 content script / service worker 访问对应站点。Web v1 不做。 |
| 浏览器侧通知 | Web v1 可以页面内显示消息；系统通知需 PWA/Notification API，后续再做。 |
| side panel/sidebar | Web 用普通网页布局替代。 |

### 3.3 当前已关闭的依赖项

这台服务器上已经把 `scheduler.pause_on_extension_disconnect` 关掉了，所以后端不会因为没有扩展连接就暂停后台任务。Web 前端只需要连 API，不需要伪装扩展 presence。

## 4. 推荐技术方案

新增目录：

```text
/root/OpenBiliClaw/web/
```

推荐技术栈：

- Vite
- TypeScript
- 不引入 React/Vue，先用原生 DOM + 模块化状态管理
- CSS 直接复用/整理现有 extension popup 的视觉 token
- 路由使用 hash route，例如：
  - `#/recommend`
  - `#/profile`
  - `#/chat`
  - `#/messages`
  - `#/settings`

为什么用 hash route：

- 当前 Nginx 已经把 `/api/*` 反代到后端。
- 当前根路径 `/` 可直接返回静态 `index.html`。
- 如果用 `/recommend` 这种 history route，需要额外改 Nginx `try_files`，容易误伤 API。
- hash route 刷新页面时仍然请求 `/`，部署最稳。

目录建议：

```text
web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts
│   ├── api.ts
│   ├── stream.ts
│   ├── state.ts
│   ├── router.ts
│   ├── types.ts
│   ├── helpers/
│   │   ├── recommendation.ts
│   │   ├── profile.ts
│   │   ├── format.ts
│   │   └── storage.ts
│   ├── views/
│   │   ├── recommend.ts
│   │   ├── profile.ts
│   │   ├── chat.ts
│   │   ├── messages.ts
│   │   └── settings.ts
│   └── styles/
│       ├── tokens.css
│       ├── base.css
│       ├── layout.css
│       ├── components.css
│       └── mobile.css
└── dist/
```

不要把 `web/dist` 提交为必须内容，除非项目已有发布制品提交习惯。部署到服务器时再构建。

## 5. 样式和页面迁移策略

不要把 `docs/index.html` 整页搬成 App。它是官网/营销页，不是操作台。

可以复用：

- 品牌色：B 站粉 `#fb7299`、蓝色 `#5aa9ff` 或官网里的 cyan。
- 字体族：`Avenir Next`, `PingFang SC`, `Microsoft YaHei`, system UI。
- 卡片质感：浅色背景、细边框、轻阴影。
- 推荐卡片结构：封面、标题、UP 主、topic label、朋友式推荐文案、反馈按钮。
- 画像页结构：分区卡片、chips、进度/状态文本。
- 聊天页结构：消息列表、底部输入框、等待状态。

需要改造：

- 扩展 popup 宽度较窄，手机 Web 应支持 360px 到 430px，也要支持桌面浏览器。
- 扩展里很多元素假设固定 side panel 高度；Web 要允许整页自然滚动。
- 底部导航比顶部 tab 更适合手机。
- 不要把设置项都塞首版首页，避免公开暴露敏感配置。
- 首页应该直接是 App 操作台，不要再做一屏营销 hero。

建议页面结构：

```text
顶部：
  OpenBiliClaw 标题
  在线/离线状态
  初始化状态和候选池简短摘要

主体：
  根据 hash route 展示 Recommend/Profile/Chat/Messages/Settings

底部导航：
  推荐
  画像
  聊天
  消息
  设置
```

移动端按钮需要足够大，建议最小高度 `40px`，底部导航按钮最小触摸区域 `44px`。

## 6. API 封装要求

`web/src/api.ts` 必须统一封装请求，不要在各个 view 里散落 `fetch`。

请求前缀：

- 同源部署时直接使用 `/api`。
- 本地开发时允许通过 `VITE_API_BASE` 覆盖，例如 `https://bili.qingningplayer.top/api`。

推荐写法：

```ts
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = null;
    }
    const error = new Error(`${path} failed: ${response.status}`);
    (error as any).status = response.status;
    (error as any).details = details;
    throw error;
  }
  return response.json();
}
```

WebSocket：

- 同源 HTTPS：`wss://bili.qingningplayer.top/api/runtime-stream?client=web`
- 同源本地 HTTP：`ws://127.0.0.1:8420/api/runtime-stream?client=web`
- 代码里根据当前 `location.protocol` 自动拼。

不要在 Web 前端写死 tokenplan API key。
不要在 Web 前端展示完整 B 站 Cookie。
不要调用 `GET /api/config?reveal_keys=true` 作为公开页面默认行为。

## 7. 安全边界

这是个人画像和推荐系统，公网域名直接暴露会泄露个人偏好、画像、推荐记录和聊天内容。

第一版 Web 上线前必须做访问保护。二选一：

### 方案 A：Nginx Basic Auth，推荐

优点：最快，能保护静态页面和 `/api/*`。

要求：

- 给 `bili.qingningplayer.top` 全站加 Basic Auth。
- 放行 `/.well-known/acme-challenge/`，不能影响证书续签。
- 可以放行 `/api/health`，但更安全是全站都保护。
- 用户手机浏览器第一次输入账号密码后，后续同源 API 请求会自动携带 Basic Auth。

不要把密码写进 Git。
如果需要生成密码，存在服务器本地，例如：

```text
/www/server/panel/vhost/auth/openbiliclaw.htpasswd
```

### 方案 B：后端增加 Web Token

优点：更像 App 登录。

缺点：需要改 FastAPI middleware、前端登录页、systemd 环境变量、Nginx 保持透传，工作量更大。

如果做方案 B：

- 使用 `OPENBILICLAW_WEB_TOKEN` 环境变量。
- 除 `/api/health` 外，所有 `/api/*` 需要 `Authorization: Bearer ...`。
- 前端把 token 存到 `localStorage`。
- `config.toml` 和 API key 不要进入浏览器。

第一版建议先做方案 A。

## 8. 页面和功能细节

### 8.1 推荐页

数据：

- 初始加载：`GET /api/recommendations`
- 换一批：`POST /api/recommendations/reshuffle`
- 继续加载：`POST /api/recommendations/append`
- 补货：`POST /api/recommendations/refresh`
- 反馈：`POST /api/feedback`

推荐卡片字段兼容：

- `recommendation_id`
- `content.bvid`
- `content.title`
- `content.up_name`
- `content.cover_url`
- `content.relevance_score`
- `expression`
- `topic_label`
- `confidence`

打开视频：

- 优先使用后端返回的 `content_url`。
- 没有时用 `https://www.bilibili.com/video/${bvid}`。
- 手机上直接 `target="_blank"` 打开，交给系统决定是否跳 B 站 App。

反馈按钮：

- 喜欢：`feedback_type = "like"`
- 不喜欢：`feedback_type = "dislike"`
- 评论反馈：`feedback_type = "comment"`，附带 `feedback_note`

反馈成功后：

- 卡片局部显示“已记住”。
- 不要立即把卡片删掉，避免页面跳动。

### 8.2 画像页

数据：

- `GET /api/profile-summary`

展示区域：

- 画像总述：`personality_portrait`
- 核心特质：`core_traits`
- 深层需求：`deep_needs`
- MBTI：`mbti.type`、`mbti.confidence`、`mbti.dimensions`
- 价值观：`values`
- 动机：`motivational_drivers`
- 喜欢：`likes`
- 不喜欢：`dislikes`
- 常看 UP：`favorite_up_users`
- 人生阶段：`life_stage`
- 当前阶段：`current_phase`
- 认知风格：`cognitive_style`
- 内容风格偏好：`style`
- 场景规律：`context`
- 探索开放度：`exploration_openness`
- 猜测兴趣：`speculative_interests`
- 近期认知更新：`recent_cognition_updates`
- 活跃洞察：`active_insights`
- 近期觉察：`recent_awareness`

如果 `initialized=false`：

- 显示未初始化状态。
- 提示服务器会从 `/root/b站cookie.txt` 导入 Cookie 并初始化。
- 不要让用户在 Web 里粘贴 Cookie，除非先做了访问保护。

### 8.3 聊天页

首选 durable turn API：

- 创建 turn：`POST /api/chat/turns`
- 查询 turn：`GET /api/chat/turns/{turn_id}`
- 历史：`GET /api/chat/turns?session=web&limit=50`

不要优先使用旧的 `POST /api/chat` 长请求，因为手机浏览器切后台容易中断。

建议流程：

1. 用户发送消息。
2. 生成本地临时消息。
3. `POST /api/chat/turns`，参数：
   - `session: "web"`
   - `scope: "chat"`
   - `message: 用户输入`
4. 后端返回 turn 后轮询 `GET /api/chat/turns/{turn_id}`。
5. 如果 WebSocket 收到相关更新，提前刷新。
6. 超时 180 秒后提示“还在后台处理中，请稍后刷新”。

### 8.4 消息页

数据来源：

- `GET /api/delight/pending-batch?limit=20`
- runtime-stream 里的 `delight.candidate`
- runtime-stream 里的 `interest.probe`

消息类型：

- 惊喜推荐：卡片展示封面、标题、理由、hook，按钮：看看、喜欢、不喜欢、聊一聊。
- 兴趣探针：展示推测兴趣、理由、证据 chips，按钮：是、不是、多聊聊。

响应接口：

- `POST /api/delight/respond`
- `POST /api/interest-probes/respond`

### 8.5 设置页

第一版设置页只做低风险功能：

- 显示后端地址。
- 显示版本/健康状态。
- 显示候选池目标和当前数量。
- 显示 Cookie 状态提示。
- 提供“手动刷新推荐池”按钮。

不要在公开 Web v1 中实现完整 LLM key 编辑、Cookie 粘贴、配置保存，除非已经做了访问保护。

如果已经加 Basic Auth，可以做部分配置开关：

- `scheduler.enabled`
- `sources.bilibili.enabled`
- `sources.douyin.enabled`
- `sources.youtube.enabled`

但仍然不要显示完整 API key。

## 9. 与现有扩展代码的复用方式

可以复制并改造这些文件里的逻辑：

- `extension/popup/popup-api.js` -> `web/src/api.ts`
- `extension/popup/popup-stream.js` -> `web/src/stream.ts`
- `extension/popup/popup-helpers.js` -> `web/src/helpers/*`
- `extension/popup/popup.html` 的 CSS token -> `web/src/styles/tokens.css`

不要让 Web 代码直接 import `extension/popup/*.js`，因为它们依赖 `chrome.storage`、扩展路径和扩展生命周期。应该把纯逻辑复制/提取到 Web 自己的模块里。

如果想做得更干净，可以后续再抽公共包：

```text
shared-ui/
```

第一版不建议做公共包，避免扩大改动面。

## 10. 构建和部署

### 10.1 本地开发

```bash
cd /root/OpenBiliClaw/web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

本地开发时可以配置：

```bash
VITE_API_BASE=https://bili.qingningplayer.top/api
```

### 10.2 构建

```bash
cd /root/OpenBiliClaw/web
npm run build
```

输出：

```text
/root/OpenBiliClaw/web/dist
```

### 10.3 部署到当前服务器

不要删除：

- `/www/wwwroot/bili.qingningplayer.top/.well-known`
- `/www/wwwroot/bili.qingningplayer.top/downloads`
- 宝塔生成的隐藏文件

建议新增脚本：

```text
/root/OpenBiliClaw/scripts/deploy_web_frontend.sh
```

脚本逻辑：

1. `cd /root/OpenBiliClaw/web`
2. `npm ci` 或 `npm install`
3. `npm run build`
4. 使用 `rsync` 把 `web/dist/` 同步到 `/www/wwwroot/bili.qingningplayer.top/`
5. 排除 `.well-known/`、`downloads/`
6. `chown -R www:www /www/wwwroot/bili.qingningplayer.top`
7. `nginx -t`
8. `systemctl reload nginx`

rsync 示例：

```bash
rsync -av --delete \
  --exclude '.well-known/' \
  --exclude 'downloads/' \
  /root/OpenBiliClaw/web/dist/ \
  /www/wwwroot/bili.qingningplayer.top/
```

如果 Web 使用 hash route，不需要改 Nginx。

如果未来使用 history route，才需要把 HTTPS server 里的静态 location 改成：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}

location ^~ /api/ {
    proxy_pass http://127.0.0.1:8420/api/;
    ...
}
```

当前第一版不要做 history route。

## 11. 验收标准

执行完成后必须验证：

### 11.1 构建验证

```bash
cd /root/OpenBiliClaw/web
npm run typecheck
npm run build
```

### 11.2 API 验证

```bash
curl -fsS https://bili.qingningplayer.top/api/health
curl -fsS https://bili.qingningplayer.top/api/runtime-status
curl -fsS https://bili.qingningplayer.top/api/profile-summary
curl -fsS https://bili.qingningplayer.top/api/recommendations
```

### 11.3 页面验证

```bash
curl -fsSI https://bili.qingningplayer.top/
curl -fsS https://bili.qingningplayer.top/ | head
```

结果应为 HTTP 200，且 HTML 内包含新 Web App 标识。

### 11.4 浏览器验证

必须至少验证：

- 手机宽度 390x844。
- 桌面宽度 1440x900。
- 推荐页能展示卡片和封面。
- 画像页不溢出。
- 聊天输入框不被底部导航遮挡。
- 底部导航不会盖住内容最后一行。
- 暗色模式如果实现，文本对比度正常。

如果环境有 Playwright，使用 Playwright 截图验证。没有就用浏览器手工检查。

### 11.5 服务验证

```bash
systemctl is-active openbiliclaw.service
systemctl is-active nginx
systemctl status openbiliclaw.service --no-pager -l | sed -n '1,30p'
```

### 11.6 安全验证

如果加了 Basic Auth：

- 未认证访问 `/` 应返回 `401`。
- 未认证访问 `/api/profile-summary` 应返回 `401`。
- `/.well-known/acme-challenge/` 不受影响。
- 手机浏览器登录后页面 API 请求正常。

无论是否加 Basic Auth，都必须确认：

```bash
curl -fsS 'https://bili.qingningplayer.top/api/config?reveal_keys=true'
```

公网不应泄露完整 tokenplan API key。

## 12. 不要做的事

- 不要改掉现有源码部署方式。
- 不要引入 Docker。
- 不要本地部署模型或 Ollama。
- 不要把 MiMo API key 写进前端。
- 不要把 B 站 Cookie 写进前端。
- 不要删除现有扩展目录。
- 不要删除 `/www/wwwroot/bili.qingningplayer.top/downloads`，那里有扩展包。
- 不要删除 ACME challenge 目录。
- 不要把 `config.toml` 里的真实 key 打印到日志或页面。
- 不要为了手机 Web 去破坏扩展构建。
- 不要把官网 `docs/index.html` 整页作为 App 首页。

## 13. 建议实施顺序

第一阶段：只读 Web App

1. 新建 `web/` 子项目。
2. 做 API client。
3. 做 hash router。
4. 做推荐页。
5. 做画像页。
6. 做运行状态顶部条。
7. 部署到当前域名。

第二阶段：交互能力

1. 推荐反馈。
2. 换一批。
3. 继续加载。
4. 聊天 durable turn。
5. runtime-stream 自动刷新。

第三阶段：消息和惊喜

1. 惊喜推荐消息页。
2. 兴趣探针确认/拒绝。
3. 与聊天页联动。

第四阶段：安全和配置

1. 全站 Basic Auth。
2. 低风险设置页。
3. 手动刷新候选池。

第五阶段：体验优化

1. 首屏 skeleton。
2. 错误重试。
3. 空状态。
4. PWA manifest。
5. 添加到桌面图标。

## 14. 最终交付内容

完成后应提交或保留以下文件：

```text
web/
scripts/deploy_web_frontend.sh
docs/mobile-web-frontend-implementation.md
```

如果修改了 Nginx 或 systemd，需要在最终回复里写清楚：

- 修改了哪个文件。
- 是否重载 Nginx。
- 是否重启 OpenBiliClaw。
- 当前访问 URL。
- Basic Auth 账号在哪里，密码如何交付给用户。

## 15. 当前最小可行版本定义

最小可行版本必须满足：

- 手机打开 `https://bili.qingningplayer.top/` 能看到真实推荐列表。
- 能切到画像页。
- 能切到聊天页并发送一条消息。
- 能对推荐点喜欢/不喜欢。
- 能换一批推荐。
- 页面不依赖 Firefox/Chrome 扩展。
- 不暴露 API key 和 Cookie。
- 不影响现有 `openbiliclaw.service`、宝塔证书自动续签和扩展下载链接。

## 16. 实施结果（2026-05-19）

- 已新增 `web/` Vite + TypeScript 子项目，采用原生 DOM、hash route 和移动端优先布局。
- 已实现推荐页、画像页、聊天页、消息页和设置页；聊天默认使用 `/api/chat/turns` durable turn。
- 已实现 `web/src/api.ts` 统一 API 封装和 `web/src/stream.ts` runtime-stream 客户端，WebSocket 使用 `client=web`。
- 已新增 `scripts/deploy_web_frontend.sh`，构建后同步到 `/www/wwwroot/bili.qingningplayer.top/`，并排除 `.well-known/`、`downloads/` 和宝塔隐藏文件。
- Web v1 明确不实现跨站 Cookie 读取、内容脚本采集、系统通知和完整敏感配置编辑。
