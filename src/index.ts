import { Hono } from 'hono'
import { webhookCallback } from 'grammy'
import rss from './rss'
import monitor, { scheduled as monitorScheduled } from './monitor'
import setup from './setup'
import { createBotWithCommands } from './bot-commands'

// CF Worker 类型定义
interface ScheduledEvent {
  cron: string
  scheduledTime: number
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void
  passThroughOnException(): void
}

// 创建 Hono 应用
const app = new Hono<{
  Bindings: {
    BOT_TOKEN: string
    DB: D1Database // D1数据库绑定
  }
}>()

// 挂载RSS路由
app.route('/rss', rss)

// 挂载监控路由
app.route('/monitor', monitor)

// 挂载Setup路由
app.route('/setup', setup)

// 健康检查端点
app.get('/', (c) => {
  return c.json({ 
    status: 'ok', 
    message: 'RSS监控机器人正在运行！',
    services: [
      'Telegram Bot',
      'RSS监控',
      '关键词匹配',
      '定时任务'
    ],
    endpoints: {
      setup: '/setup - 系统初始化页面',
      rss_api: '/rss - RSS相关API',
      monitor_api: '/monitor - 监控相关API',
      webhook: '/webhook - Telegram Bot Webhook',
      debug: '/debug - 调试信息'
    },
    timestamp: new Date().toISOString()
  })
})

// 调试端点
app.get('/debug', (c) => {
  const botToken = c.env.BOT_TOKEN
  return c.json({
    bot_token_configured: !!botToken,
    bot_token_prefix: botToken ? botToken.substring(0, 10) + '...' : 'not set',
    database_configured: !!c.env.DB,
    timestamp: new Date().toISOString()
  })
})

// Telegram Bot webhook 端点
app.post('/webhook', async (c) => {
  try {
    const botToken = c.env.BOT_TOKEN
    
    if (!botToken) {
      console.error('BOT_TOKEN not configured')
      return c.json({ error: 'BOT_TOKEN not configured' }, 500)
    }

    if (!c.env.DB) {
      console.error('Database not configured')
      return c.json({ error: 'Database not configured' }, 500)
    }

    // 创建带有完整命令的 Bot 实例
    const bot = createBotWithCommands(botToken, c.env.DB)

    // 使用 webhookCallback 处理请求
    const callback = webhookCallback(bot, 'hono')
    return await callback(c)
    
  } catch (error) {
    console.error('Bot error:', error)
    return c.json({ error: 'Internal server error', details: String(error) }, 500)
  }
})

// 导出默认的 Hono 应用
export default {
  fetch: app.fetch,
  // 定时任务处理器
  scheduled: async (event: ScheduledEvent, env: any, ctx: ExecutionContext) => {
    console.log('定时任务触发:', event.cron)
    await monitorScheduled(event, env, ctx)
  }
}
