# Nodeseek 关键词监控 Telegram 机器人

基于Cloudflare Workers + Hono + Grammy的RSS监控系统，支持关键词匹配和Telegram通知。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ljnchn/seeknode)

## 使用准备

- cloudflare 账号
- github 账号
- telegram bot token

## 使用步骤

1. 在 telegram 中搜索 @BotFather 并创建一个 bot，复制 bot token 备用
2. 点击上方按钮部署到 Cloudflare
3. 按照提示进行配置部署
4. 在设置 -> 变量和机密 -> 添加变量名称 `BOT_TOKEN` 为上一步复制的 bot token
5. 访问 worker 域名 + /setup 查看状态
6. 在 telegram 中发送 /start 注册用户

## 功能特性

- 🤖 **Telegram机器人交互**：完整的命令系统，用户友好的界面
- 📡 **RSS监控**：自动监控NodeSeek RSS源，解析最新帖子
- 🔍 **关键词匹配**：支持1-3个关键词的组合匹配
- 📨 **实时通知**：匹配到关键词时自动发送Telegram消息
- ⏰ **定时任务**：每1分钟自动检查新帖子
- 🌐 **HTTP触发**：支持手动触发监控检查
- 💾 **D1数据库**：存储用户信息、订阅记录和推送日志
- 🔒 **去重处理**：确保同一帖子不会重复推送

## 系统架构

```
📁 src/
├── index.ts          # 主入口文件，路由配置
├── monitor.ts        # RSS监控核心逻辑
├── bot-commands.ts   # Telegram机器人命令处理
├── rss.ts           # RSS解析功能
└── ...

📁 migrations/
└── 0001_initial.sql  # 数据库初始化脚本

📁 配置文件
├── wrangler.jsonc    # Cloudflare Workers配置
├── package.json      # 项目依赖
└── tsconfig.json     # TypeScript配置
```

## 数据库设计

### users 表
- 存储Telegram用户信息
- 管理订阅限制和账户状态

### keywords_sub 表  
- 存储用户的关键词订阅
- 支持1-3个关键词的组合匹配

### push_logs 表
- 记录所有推送日志
- 去重防止重复通知

## 机器人命令

### 基础命令
- `/start` - 注册用户并显示欢迎信息
- `/help` - 显示详细帮助信息
- `/info` - 查看用户信息和订阅统计
- `/status` - 查看服务运行状态

### 订阅管理
- `/list` - 查看当前所有订阅
- `/add 关键词1 [关键词2] [关键词3]` - 添加关键词订阅
- `/remove 订阅ID` - 删除指定订阅

### 使用示例
```
/add 服务器                    # 监控包含"服务器"的帖子
/add VPS 优惠                  # 监控同时包含"VPS"和"优惠"的帖子  
/add 服务器 免费 教程           # 监控同时包含这三个关键词的帖子
/remove 123                   # 删除ID为123的订阅
```

## API接口

### RSS相关
- `GET /rss/posts` - 获取RSS数据
- `GET /rss/status` - RSS服务状态
- `GET /rss/test` - RSS连接测试

### 监控相关
- `GET /monitor/check` - 手动触发监控检查
- `POST /monitor/check` - 手动触发监控检查  
- `GET /monitor/status` - 监控服务状态

### 机器人相关
- `POST /webhook` - Telegram webhook处理
- `GET /debug` - 调试信息
- `GET /` - 健康检查

## 部署指南

### 1. 环境准备
```bash
# 安装依赖
pnpm install

# 安装Wrangler CLI
npm install -g wrangler
```

### 2. 配置环境变量
```bash
# 设置Telegram Bot Token
wrangler secret put BOT_TOKEN

# 配置其他环境变量
# 在wrangler.jsonc中配置D1数据库
```

### 3. 数据库设置
```bash
# 创建D1数据库
wrangler d1 create seeknode-prod

# 运行数据库迁移
wrangler d1 migrations apply seeknode-prod
```

### 4. 部署应用
```bash
# 开发环境
pnpm run dev

# 生产部署
pnpm run deploy
```

### 5. 配置Telegram Webhook
```bash
# 设置webhook URL
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-worker-domain.workers.dev/webhook"}'
```

## 定时任务配置

系统配置为每1分钟自动执行一次RSS监控：

```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": [
      "*/1 * * * *"  // 每1分钟执行一次
    ]
  }
}
```

### 自定义频率
可以根据需要修改cron表达式：
- `"*/5 * * * *"` - 每5分钟
- `"0 * * * *"` - 每小时
- `"0 */2 * * *"` - 每2小时

## 监控流程

1. **定时触发**：每1分钟自动执行或手动HTTP触发
2. **获取RSS**：从NodeSeek获取最新RSS数据
3. **解析帖子**：提取帖子标题、描述、分类等信息
4. **用户遍历**：获取所有活跃用户和他们的订阅
5. **关键词匹配**：检查帖子内容是否匹配用户关键词
6. **去重检查**：确保同一帖子不会重复推送
7. **发送通知**：向匹配用户发送Telegram消息
8. **记录日志**：保存推送记录到数据库

## 开发说明

### 本地开发
```bash
# 启动开发服务器
pnpm run dev

# 使用开发环境配置
pnpm run dev:config
```

### 数据库操作
```bash
# 创建开发数据库
pnpm run db:create:dev

# 运行开发环境迁移
pnpm run db:migrate:dev
```

### 类型生成
```bash
# 生成Cloudflare类型
pnpm run cf-typegen
```

## 注意事项

1. **频率限制**：避免过于频繁的RSS请求
2. **错误处理**：完善的异常捕获和日志记录
3. **数据清理**：定期清理过期的推送日志
4. **用户限制**：每个用户最多5个订阅，防止滥用
5. **安全性**：妥善保管Bot Token和数据库配置

## 许可证

MIT License

## 支持

如有问题，请查看：
1. Cloudflare Workers文档
2. Grammy机器人框架文档  
3. Hono框架文档
