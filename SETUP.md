# 系统初始化指南

## 概述

RSS监控机器人提供了一个简单易用的系统初始化页面，帮助您快速完成系统设置。

## 使用方法

访问 `/setup` 路径即可进入系统初始化页面：

```
https://your-domain.com/setup
```

系统将按以下步骤自动进行设置：

### 步骤1：检查Bot Token
- 验证环境变量中的`BOT_TOKEN`是否有效
- 获取机器人基本信息（用户名、ID等）

### 步骤2：设置Webhook
- 根据当前域名自动设置Telegram Webhook
- Webhook地址：`https://your-domain.com/webhook`

### 步骤3：检查数据库
- 检查D1数据库中是否存在所需的表
- 如果表不存在，自动创建所有必需的表

## 数据库表结构

系统会自动创建以下4个表：

### posts 表
存储RSS帖子信息
- `id` - 主键
- `post_id` - 帖子ID  
- `title` - 标题
- `content` - 内容
- `pub_date` - 发布时间
- `category` - 分类
- `creator` - 作者
- `is_push` - 是否已推送
- `created_at` - 创建时间

### users 表
存储用户信息
- `id` - 主键
- `chat_id` - Telegram聊天ID
- `username` - 用户名
- `first_name` - 名字
- `last_name` - 姓氏
- `max_sub` - 最大订阅数（默认5）
- `is_active` - 是否活跃
- `created_at` - 创建时间
- `updated_at` - 更新时间

### keywords_sub 表
存储关键词订阅
- `id` - 主键
- `user_id` - 用户ID
- `keywords_count` - 关键词数量
- `keyword1` - 关键词1
- `keyword2` - 关键词2
- `keyword3` - 关键词3
- `is_active` - 是否活跃
- `created_at` - 创建时间
- `updated_at` - 更新时间

### push_logs 表
存储推送日志
- `id` - 主键
- `user_id` - 用户ID
- `chat_id` - 聊天ID
- `post_id` - 帖子ID
- `sub_id` - 订阅ID
- `push_status` - 推送状态
- `error_message` - 错误信息
- `created_at` - 创建时间

## 环境变量配置

确保在Cloudflare Worker中配置以下环境变量：

- `BOT_TOKEN` - Telegram Bot Token（从@BotFather获取）
- `DB` - D1数据库绑定

## API端点

如果需要程序化访问，可以使用以下API：

- `GET /setup/check` - 检查Bot Token状态
- `POST /setup/webhook` - 设置Webhook
- `POST /setup/database` - 检查和创建数据库表

## 故障排除

### Bot Token错误
- 确保`BOT_TOKEN`环境变量已正确设置
- 检查Token格式是否正确
- 确认机器人未被删除或禁用

### Webhook设置失败
- 检查域名是否可访问
- 确认HTTPS证书有效
- 检查Telegram API限制

### 数据库错误
- 确认D1数据库已创建并绑定
- 检查数据库权限设置
- 查看详细错误信息

## 完成设置

当所有步骤显示为绿色✅时，系统设置完成，机器人即可正常使用。

用户可以：
- 向机器人发送`/start`命令开始使用
- 使用`/add`命令添加关键词订阅
- 查看`/help`获取更多帮助信息 