import { Bot, Context } from 'grammy'

interface BotEnv {
  BOT_TOKEN: string
  DB: D1Database
}

// 用户信息接口
interface User {
  id: number
  chat_id: number
  username?: string
  first_name?: string
  last_name?: string
  max_sub: number
  is_active: number
}

// 关键词订阅接口
interface KeywordSub {
  id: number
  user_id: number
  keywords_count: number
  keyword1: string
  keyword2?: string
  keyword3?: string
  is_active: number
}

// 创建或获取用户
async function getOrCreateUser(db: D1Database, ctx: Context): Promise<User | null> {
  try {
    const chatId = ctx.chat?.id
    const user = ctx.from
    
    if (!chatId || !user) {
      return null
    }
    
    // 尝试获取现有用户
    let existingUser = await db.prepare('SELECT * FROM users WHERE chat_id = ?')
      .bind(chatId)
      .first() as User | null
    
    if (existingUser) {
      // 更新用户信息
      await db.prepare(`
        UPDATE users SET 
          username = ?, 
          first_name = ?, 
          last_name = ?, 
          updated_at = CURRENT_TIMESTAMP
        WHERE chat_id = ?
      `).bind(
        user.username || null,
        user.first_name || null,
        user.last_name || null,
        chatId
      ).run()
      
      return existingUser
    } else {
      // 创建新用户
      const result = await db.prepare(`
        INSERT INTO users (chat_id, username, first_name, last_name)
        VALUES (?, ?, ?, ?)
      `).bind(
        chatId,
        user.username || null,
        user.first_name || null,
        user.last_name || null
      ).run()
      
      if (result.success) {
        return await db.prepare('SELECT * FROM users WHERE chat_id = ?')
          .bind(chatId)
          .first() as User
      }
    }
    
    return null
  } catch (error) {
    console.error('获取或创建用户失败:', error)
    return null
  }
}

// 获取用户的关键词订阅
async function getUserSubscriptions(db: D1Database, userId: number): Promise<KeywordSub[]> {
  try {
    const result = await db.prepare('SELECT * FROM keywords_sub WHERE user_id = ? AND is_active = 1')
      .bind(userId)
      .all()
    return result.results as unknown as KeywordSub[]
  } catch (error) {
    console.error('获取用户订阅失败:', error)
    return []
  }
}

// 添加关键词订阅
async function addKeywordSubscription(db: D1Database, userId: number, keywords: string[]): Promise<boolean> {
  try {
    if (keywords.length === 0 || keywords.length > 3) {
      return false
    }
    
    const result = await db.prepare(`
      INSERT INTO keywords_sub (user_id, keywords_count, keyword1, keyword2, keyword3)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      userId,
      keywords.length,
      keywords[0] || null,
      keywords[1] || null,
      keywords[2] || null
    ).run()
    
    return result.success
  } catch (error) {
    console.error('添加关键词订阅失败:', error)
    return false
  }
}

// 删除关键词订阅
async function removeKeywordSubscription(db: D1Database, userId: number, subId: number): Promise<boolean> {
  try {
    const result = await db.prepare(`
      UPDATE keywords_sub SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(subId, userId).run()
    
    return result.success
  } catch (error) {
    console.error('删除关键词订阅失败:', error)
    return false
  }
}

// 创建Bot处理函数
export function createBotWithCommands(token: string, db: D1Database) {
  const bot = new Bot(token)

  // /start 命令
  bot.command('start', async (ctx) => {
    const user = await getOrCreateUser(db, ctx)
    if (!user) {
      return ctx.reply('❌ 用户注册失败，请稍后重试。')
    }
    
    return ctx.reply(
      `🤖 欢迎使用RSS关键词监控机器人！\n\n` +
      `📝 **功能说明：**\n` +
      `• 监控NodeSeek RSS源\n` +
      `• 关键词匹配提醒\n` +
      `• 支持最多3个关键词组合匹配\n\n` +
      `🔧 **可用命令：**\n` +
      `/help - 显示帮助信息\n` +
      `/info - 显示用户信息\n` +
      `/list - 查看我的订阅\n` +
      `/add - 添加关键词订阅\n` +
      `/del - 删除订阅\n` +
      `/status - 查看服务状态\n\n` +
      `💡 使用 /add 关键词1 关键词2 关键词3 来添加订阅`
    )
  })

  // /help 命令
  bot.command('help', (ctx) => {
    return ctx.reply(
      `📖 **帮助信息**\n\n` +
      `🔧 **命令列表：**\n` +
      `/start - 开始使用机器人\n` +
      `/help - 显示此帮助信息\n` +
      `/info - 显示用户和订阅信息\n` +
      `/list - 查看我的关键词订阅\n` +
      `/add 关键词1 [关键词2] [关键词3] - 添加关键词订阅\n` +
      `/del 订阅ID - 删除指定订阅\n` +
      `/status - 查看服务运行状态\n\n` +
      `📋 **使用示例：**\n` +
      `• \`/add 服务器\` - 监控包含"服务器"的帖子\n` +
      `• \`/add VPS 优惠\` - 监控同时包含"VPS"和"优惠"的帖子\n` +
      `• \`/add 服务器 免费 教程\` - 监控同时包含这三个关键词的帖子\n\n` +
      `⚠️ **注意事项：**\n` +
      `• 每个用户最多5个订阅\n` +
      `• 关键词匹配不区分大小写\n` +
      `• 每1分钟检查一次新帖子`
    )
  })

  // /info 命令
  bot.command('info', async (ctx) => {
    const user = await getOrCreateUser(db, ctx)
    if (!user) {
      return ctx.reply('❌ 获取用户信息失败')
    }
    
    const subscriptions = await getUserSubscriptions(db, user.id)
    
    return ctx.reply(
      `👤 **用户信息**\n\n` +
      `🆔 用户ID: ${user.id}\n` +
      `💬 聊天ID: ${user.chat_id}\n` +
      `👤 用户名: ${user.username || '未设置'}\n` +
      `📝 姓名: ${user.first_name || ''} ${user.last_name || ''}\n` +
      `📊 最大订阅数: ${user.max_sub}\n` +
      `📈 当前订阅数: ${subscriptions.length}\n` +
      `✅ 账户状态: ${user.is_active ? '活跃' : '禁用'}\n` +
      `📅 注册时间: ${new Date().toISOString()}`
    )
  })

  // /list 命令
  bot.command('list', async (ctx) => {
    const user = await getOrCreateUser(db, ctx)
    if (!user) {
      return ctx.reply('❌ 获取用户信息失败')
    }
    
    const subscriptions = await getUserSubscriptions(db, user.id)
    
    if (subscriptions.length === 0) {
      return ctx.reply(
        `📝 **我的订阅**\n\n` +
        `暂无关键词订阅。\n\n` +
        `使用 /add 关键词 来添加订阅。`
      )
    }
    
    let message = `📝 **我的订阅** (${subscriptions.length}/${user.max_sub})\n\n`
    
    subscriptions.forEach((sub, index) => {
      const keywords = [sub.keyword1, sub.keyword2, sub.keyword3]
        .filter(Boolean)
        .join(' + ')
      
      message += `${index + 1}. **ID: ${sub.id}**\n`
      message += `   🔍 关键词: ${keywords}\n`
      message += `   📊 匹配数: ${sub.keywords_count}\n\n`
    })
    
    message += `💡 使用 /del 订阅ID 来删除订阅`
    
    return ctx.reply(message)
  })

  // /add 命令
  bot.command('add', async (ctx) => {
    const user = await getOrCreateUser(db, ctx)
    if (!user) {
      return ctx.reply('❌ 获取用户信息失败')
    }
    
    // 检查当前订阅数
    const currentSubs = await getUserSubscriptions(db, user.id)
    if (currentSubs.length >= user.max_sub) {
      return ctx.reply(`❌ 订阅数已达上限 (${user.max_sub})，请先删除部分订阅`)
    }
    
    // 解析关键词
    const text = ctx.message?.text || ''
    const parts = text.split(' ').slice(1) // 去掉命令部分
    
    if (parts.length === 0 || parts.length > 3) {
      return ctx.reply(
        `❌ 关键词数量不正确！\n\n` +
        `请提供1-3个关键词，用空格分隔。\n` +
        `示例: /add 服务器 优惠`
      )
    }
    
    // 过滤空关键词
    const keywords = parts.filter(k => k.trim().length > 0)
    
    if (keywords.length === 0) {
      return ctx.reply('❌ 请提供有效的关键词')
    }
    
    // 添加订阅
    const success = await addKeywordSubscription(db, user.id, keywords)
    
    if (success) {
      return ctx.reply(
        `✅ **订阅添加成功！**\n\n` +
        `🔍 关键词: ${keywords.join(' + ')}\n` +
        `📊 匹配模式: ${keywords.length === 1 ? '单关键词' : '多关键词组合'}\n\n` +
        `🤖 系统将每1分钟检查一次新帖子，匹配时会自动通知您。`
      )
    } else {
      return ctx.reply('❌ 添加订阅失败，请稍后重试')
    }
  })

  // /del 命令
  bot.command('del', async (ctx) => {
    const user = await getOrCreateUser(db, ctx)
    if (!user) {
      return ctx.reply('❌ 获取用户信息失败')
    }
    
    // 解析订阅ID
    const text = ctx.message?.text || ''
    const parts = text.split(' ')
    
    if (parts.length !== 2) {
      return ctx.reply(
        `❌ 请提供订阅ID！\n\n` +
        `使用方法: /del 订阅ID\n` +
        `使用 /list 命令查看订阅ID`
      )
    }
    
    const subId = parseInt(parts[1])
    if (isNaN(subId)) {
      return ctx.reply('❌ 订阅ID必须是数字')
    }
    
    // 检查订阅是否存在且属于该用户
    const subscriptions = await getUserSubscriptions(db, user.id)
    const targetSub = subscriptions.find(sub => sub.id === subId)
    
    if (!targetSub) {
      return ctx.reply('❌ 未找到指定的订阅ID，请使用 /list 查看有效的订阅')
    }
    
    // 删除订阅
    const success = await removeKeywordSubscription(db, user.id, subId)
    
    if (success) {
      const keywords = [targetSub.keyword1, targetSub.keyword2, targetSub.keyword3]
        .filter(Boolean)
        .join(' + ')
      
      return ctx.reply(
        `✅ **订阅删除成功！**\n\n` +
        `🗑️ 已删除订阅: ${keywords}`
      )
    } else {
      return ctx.reply('❌ 删除订阅失败，请稍后重试')
    }
  })

  // /status 命令
  bot.command('status', (ctx) => {
    return ctx.reply(
      `📊 **服务状态**\n\n` +
      `✅ 机器人状态: 正常运行\n` +
      `🔄 监控频率: 每1分钟\n` +
      `📡 RSS源: NodeSeek\n` +
      `💾 数据库: 正常连接\n` +
      `⏰ 当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n` +
      `🔗 RSS源地址: https://rss.nodeseek.com/`
    )
  })

  // 处理普通文本消息
  bot.on('message:text', (ctx) => {
    const userMessage = ctx.message.text
    // 跳过命令消息，避免重复处理
    if (userMessage.startsWith('/')) {
      return
    }
    return ctx.reply(
      `💬 收到消息: "${userMessage}"\n\n` +
      `使用 /help 查看可用命令，或 /add 关键词 来添加监控。`
    )
  })

  return bot
} 