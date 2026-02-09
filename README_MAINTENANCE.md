# Telegram 新闻推送 维护说明（云端 GitHub Actions + 本地维护目录）

本项目用于把 NYP / WaPo / Politico / Economist / WSJ / AP NEWS / The Atlantic / Reuters / SCMP 的新闻通过 Telegram Bot 推送。

当前部署形态：
- 云端：GitHub Actions 定时运行（每 5 分钟一次）
- 本地：仅保留代码目录用于后续修改维护，不需要常驻运行

仓库：
- GitHub: `zixuouoscaroliver/Oscar-Oliver`

## 目录结构（本地）
维护目录：`/Users/oliverou/telegram-news-pusher`

关键文件：
- `news_notifier.py`：主逻辑（抓取/过滤/夜间免打扰/配图/去重）
- `.github/workflows/news-bot.yml`：GitHub Actions 工作流（cron、env 配置、持久化 state）
- `.state.cloud.json`：云端去重/夜间汇总状态（由 Actions 自动提交更新）
- `.env.example`：本地运行时的示例配置（注意：不要把真实 token 写进仓库）

## 云端是怎么跑的
- 工作流：`.github/workflows/news-bot.yml`
- 触发：
  - cron: 每 5 分钟一次
  - 手动：workflow_dispatch
- 运行方式：`python news_notifier.py --once`
- 状态持久化：运行后若 `.state.cloud.json` 有变化，会自动 `git commit` 并 push 到 `main`

Actions 页面：
- `https://github.com/zixuouoscaroliver/Oscar-Oliver/actions`

## Secrets / Variables（只在 GitHub 仓库设置，不写入仓库文件）
位置：GitHub 仓库 `Settings -> Secrets and variables -> Actions`

必需 Secrets：
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Variables：
- `NEWS_TZ`（例如 `Asia/Shanghai`）

## 常见修改怎么做（只改代码然后 push）
### 修改推送频率
在 `.github/workflows/news-bot.yml` 里改 cron 表达式：
- 当前：`*/5 * * * *`（GitHub schedule 最短 5 分钟）

### 修改重大新闻关键词
在 `.github/workflows/news-bot.yml` 的 env 中修改：
- `MAJOR_KEYWORDS`

### 修改免打扰时间与夜间汇总
在 `.github/workflows/news-bot.yml` 的 env 中修改：
- `QUIET_HOUR_START`（默认 23）
- `QUIET_HOUR_END`（默认 9）
- `NIGHT_DIGEST_MAX`（默认 40）

### 调整配图清晰度
在 `news_notifier.py` 里函数 `normalize_image_url()` 维护。
- Bing News 缩略图会自动加 `w=1600&h=900...` 参数

### 修改数据源（某媒体 403/无图）
在 `news_notifier.py` 的 `SOURCE_FEEDS` 中调整。
- 当前 Reuters/Economist/AP 使用 Bing RSS 以获得图片字段

## 排障（不推送/推送少）
1. 先看 Actions 是否成功
- 打开 Actions 页面，查看最新一次 `Telegram News Bot` 是否绿色

2. 可能原因
- 没有命中重大关键词：`MAJOR_ONLY=true` 时只发命中关键词的标题
- 在免打扰时段（23:00-09:00，按 `NEWS_TZ`）：会缓存进 `.state.cloud.json`，09:00 后发送汇总
- Actions 失败：点进去看失败 step（常见为网络/RSS 403）

3. 手动触发一次（用于测试）
- GitHub Actions 页面里对 `Telegram News Bot` 点 `Run workflow`

## 本地维护与推送更新（不需要输入密码）
本机已配置 Git 凭据缓存到 macOS Keychain，后续只需要：

```bash
cd /Users/oliverou/telegram-news-pusher
# 修改代码...
git status
git add -A
git commit -m "your message"
git push origin main
```

注意：云端会自动提交 `.state.cloud.json`，因此你 push 前偶尔需要先同步一下：

```bash
git fetch origin main
git rebase origin/main
# 然后再 git push
```

## 安全约定
- 不要把任何真实 token/password 写入仓库文件或 README。
- Telegram/GitHub 凭据只放在 GitHub Actions Secrets 或本机 Keychain。
