import { Hono } from 'hono'
import { Bot } from 'grammy'

// CF Worker 类型定义
interface ScheduledEvent {
  cron: string
  scheduledTime: number
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void
  passThroughOnException(): void
}

// 定义环境变量类型
interface Env {
  BOT_TOKEN: string
  DB: D1Database
}

// RSS帖子接口类型
interface RSSPost {
  id: string
  title: string
  description: string
  pubDate: string
  category: string
  creator: string
}

// 数据库中的帖子类型
interface DBPost {
  id: number
  post_id: number
  title: string
  content: string
  pub_date: string
  category: string
  creator: string
  is_push: number
  created_at: string
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

// 创建监控应用实例
const monitor = new Hono<{ Bindings: Env }>()

// 解析RSS XML数据
function parseRSSXML(xmlText: string): RSSPost[] {
  try {
    const posts: RSSPost[] = []
    
    // 使用正则表达式提取RSS项目
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    const items = xmlText.match(itemRegex) || []
    
    items.forEach((item, index) => {
      // 提取各个字段
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/)
      const linkMatch = item.match(/<link>(.*?)<\/link>/)
      const descriptionMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/)
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/)
      const categoryMatch = item.match(/<category><!\[CDATA\[(.*?)\]\]><\/category>/) || item.match(/<category>(.*?)<\/category>/)
      const creatorMatch = item.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>/) || item.match(/<dc:creator>(.*?)<\/dc:creator>/)
      
      // 从链接中提取ID
      const link = linkMatch ? linkMatch[1] : ''
      const idMatch = link.match(/post-(\d+)-/)
      
      const post: RSSPost = {
        id: idMatch ? idMatch[1] : `item-${index}`,
        title: titleMatch ? titleMatch[1].trim() : '无标题',
        description: descriptionMatch ? descriptionMatch[1].trim() : '',
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
        category: categoryMatch ? categoryMatch[1].trim() : '未分类',
        creator: creatorMatch ? creatorMatch[1].trim() : '未知作者'
      }
      
      posts.push(post)
    })
    
    return posts
  } catch (error) {
    console.error('解析RSS失败:', error)
    return []
  }
}

// 获取RSS数据
async function fetchRSSData(): Promise<RSSPost[]> {
  try {
    const response = await fetch('https://rss.nodeseek.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.nodeseek.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status} - ${response.statusText}`)
    }
    
    const xmlText = await response.text()
    return parseRSSXML(xmlText)
  } catch (error) {
    console.error('获取RSS数据失败:', error)
    return []
  }
}

// 获取所有活跃用户
async function getActiveUsers(db: D1Database): Promise<User[]> {
  try {
    const result = await db.prepare('SELECT * FROM users WHERE is_active = 1').all()
    return result.results as unknown as User[]
  } catch (error) {
    console.error('获取用户失败:', error)
    return []
  }
}

// 获取用户的关键词订阅
async function getUserKeywords(db: D1Database, userId: number): Promise<KeywordSub[]> {
  try {
    const result = await db.prepare('SELECT * FROM keywords_sub WHERE user_id = ? AND is_active = 1')
      .bind(userId)
      .all()
    return result.results as unknown as KeywordSub[]
  } catch (error) {
    console.error('获取用户关键词失败:', error)
    return []
  }
}

// 保存RSS帖子到数据库
async function savePostsToDatabase(db: D1Database, posts: RSSPost[]): Promise<number> {
  let savedCount = 0
  
  try {
    for (const post of posts) {
      // 检查帖子是否已存在
      const existing = await db.prepare('SELECT id FROM posts WHERE post_id = ?')
        .bind(parseInt(post.id))
        .first()
      
      if (!existing) {
        // 插入新帖子
        await db.prepare(`
          INSERT INTO posts (post_id, title, content, pub_date, category, creator, is_push)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `).bind(
          parseInt(post.id),
          post.title,
          post.description,
          post.pubDate,
          post.category,
          post.creator
        ).run()
        
        savedCount++
        console.log(`保存新帖子: ${post.title} (ID: ${post.id})`)
      }
    }
  } catch (error) {
    console.error('保存帖子到数据库失败:', error)
  }
  
  return savedCount
}

// 从数据库获取待推送的帖子
async function getUnpushedPosts(db: D1Database, limit: number = 50): Promise<DBPost[]> {
  try {
    const result = await db.prepare(`
      SELECT * FROM posts 
      WHERE is_push = 0 
      ORDER BY created_at DESC 
      LIMIT ?
    `).bind(limit).all()
    
    return result.results as unknown as DBPost[]
  } catch (error) {
    console.error('获取待推送帖子失败:', error)
    return []
  }
}

// 标记帖子为已推送
async function markPostAsPushed(db: D1Database, postId: number): Promise<void> {
  try {
    await db.prepare('UPDATE posts SET is_push = 1 WHERE post_id = ?')
      .bind(postId)
      .run()
  } catch (error) {
    console.error('标记帖子为已推送失败:', error)
  }
}

// 关键词匹配函数
function matchKeywords(post: DBPost, keywords: KeywordSub): boolean {
  const searchText = `${post.title} ${post.content} ${post.category} ${post.creator}`.toLowerCase()
  
  const keyword1 = keywords.keyword1?.toLowerCase()
  const keyword2 = keywords.keyword2?.toLowerCase()
  const keyword3 = keywords.keyword3?.toLowerCase()
  
  // 检查第一个关键词（必须匹配）
  if (!keyword1 || !searchText.includes(keyword1)) {
    return false
  }
  
  // 如果只有一个关键词，直接返回true
  if (keywords.keywords_count === 1) {
    return true
  }
  
  // 检查第二个关键词
  if (keywords.keywords_count === 2) {
    return keyword2 ? searchText.includes(keyword2) : false
  }
  
  // 检查第三个关键词
  if (keywords.keywords_count === 3) {
    return keyword2 && keyword3 ? 
      searchText.includes(keyword2) && searchText.includes(keyword3) : false
  }
  
  return false
}

// 发送Telegram消息
async function sendTelegramMessage(botToken: string, chatId: number, post: DBPost, matchedKeywords: string[]): Promise<{ success: boolean; error?: string; userBlocked?: boolean }> {
  try {
    const bot = new Bot(botToken)
    
    // 构建帖子链接
    const postUrl = `https://www.nodeseek.com/post-${post.post_id}-1`
    
    const message = `🎯 ${matchedKeywords.join(', ')}\n\n` +
      `[${post.title}](${postUrl})`
    
    await bot.api.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    } as any)
    
    return { success: true }
  } catch (error: any) {
    console.error('发送Telegram消息失败:', error)
    
    // 检查是否是用户屏蔽机器人的错误
    const errorMessage = error?.message || error?.description || String(error)
    
    // Telegram API常见的用户屏蔽错误码和消息
    const blockedErrors = [
      'Forbidden: bot was blocked by the user',
      'Forbidden: user is deactivated',
      'Forbidden: bot was kicked from the group chat',
      'Forbidden: bot was kicked from the supergroup chat',
      'Bad Request: chat not found'
    ]
    
    const userBlocked = blockedErrors.some(blockedError => 
      errorMessage.toLowerCase().includes(blockedError.toLowerCase())
    )
    
    if (userBlocked) {
      console.log(`🚫 用户 ${chatId} 已屏蔽机器人或聊天不存在`)
    }
    
    return { 
      success: false, 
      error: errorMessage,
      userBlocked
    }
  }
}

// RSS监控任务：只负责抓取RSS并创建推送记录
async function rssMonitorTask(env: Env): Promise<{ success: boolean; message: string; stats: any }> {
  try {
    console.log('开始RSS监控任务...')
    
    // 步骤1：获取RSS数据并保存到数据库
    const rssPosts = await fetchRSSData()
    if (rssPosts.length === 0) {
      return { success: true, message: '未获取到新的RSS数据', stats: { rssPostsCount: 0 } }
    }
    
    const savedCount = await savePostsToDatabase(env.DB, rssPosts)
    console.log(`保存了 ${savedCount} 个新帖子到数据库`)
    
    // 步骤2：处理未匹配关键词的帖子，创建push_logs记录
    const unpushedPosts = await getUnpushedPosts(env.DB)
    let keywordMatchStats = { totalLogs: 0, createdLogs: 0 }
    
    if (unpushedPosts.length > 0) {
      keywordMatchStats = await createPushLogs(env, unpushedPosts)
      console.log(`为 ${unpushedPosts.length} 个帖子匹配关键词，创建了 ${keywordMatchStats.createdLogs} 个推送记录`)
    }
    
    const stats = {
      rssPostsCount: rssPosts.length,
      savedNewPosts: savedCount,
      unpushedPosts: unpushedPosts.length,
      keywordMatches: keywordMatchStats.totalLogs,
      createdPushLogs: keywordMatchStats.createdLogs
    }
    
    return {
      success: true,
      message: `RSS监控完成：保存 ${savedCount} 个新帖子，创建 ${keywordMatchStats.createdLogs} 个推送记录`,
      stats
    }
    
  } catch (error) {
    console.error('RSS监控任务失败:', error)
    return {
      success: false,
      message: `RSS监控任务失败: ${error}`,
      stats: {}
    }
  }
}

// 推送任务：只负责发送待推送的记录
async function pushTask(env: Env): Promise<{ success: boolean; message: string; stats: any }> {
  try {
    console.log('开始推送任务...')
    
    // 获取待发送的推送记录（只处理未发送的记录）
    const pendingLogs = await env.DB.prepare(`
      SELECT pl.*, p.title, p.content, p.category, p.creator, p.post_id,
             ks.keyword1, ks.keyword2, ks.keyword3,
             u.chat_id
      FROM push_logs pl
      JOIN posts p ON pl.post_id = p.post_id
      JOIN keywords_sub ks ON pl.sub_id = ks.id
      JOIN users u ON pl.user_id = u.id
      WHERE pl.push_status = 0 
      ORDER BY pl.created_at ASC
      LIMIT 100
    `).all()
    
    if (pendingLogs.results.length === 0) {
      return { 
        success: true, 
        message: '没有待推送的记录', 
        stats: { pushAttempts: 0, successfulPushes: 0, failedPushes: 0 } 
      }
    }
    
    let successful = 0
    let failed = 0
    
    for (const logRecord of pendingLogs.results) {
      const log = logRecord as any
      
      try {
        // 构建匹配的关键词列表
        const matchedKeywords = [
          log.keyword1,
          log.keyword2, 
          log.keyword3
        ].filter(Boolean) as string[]
        
        // 构建帖子对象
        const post: DBPost = {
          id: Number(log.id),
          post_id: Number(log.post_id),
          title: String(log.title),
          content: String(log.content),
          pub_date: '',
          category: String(log.category),
          creator: String(log.creator),
          is_push: 1,
          created_at: ''
        }
        
        // 发送Telegram消息
        const sent = await sendTelegramMessage(env.BOT_TOKEN, Number(log.chat_id), post, matchedKeywords)
        
        if (sent.success) {
          // 发送成功
          await env.DB.prepare(`
            UPDATE push_logs 
            SET push_status = 1, error_message = NULL
            WHERE id = ?
          `).bind(log.id).run()
          
          successful++
          console.log(`✅ 成功发送推送到用户 ${log.chat_id}，帖子 ${log.post_id}`)
        } else {
          // 发送失败，也标记为已处理（不重试）
          await env.DB.prepare(`
            UPDATE push_logs 
            SET push_status = 1, error_message = ?
            WHERE id = ?
          `).bind(sent.error, log.id).run()
          
          failed++
          console.log(`❌ 发送失败，用户 ${log.chat_id}，帖子 ${log.post_id}，原因: ${sent.error}`)
          
          // 如果用户屏蔽了机器人，更新用户状态
          if (sent.userBlocked) {
            await deactivateUser(env.DB, Number(log.chat_id))
          }
        }
        
      } catch (error) {
        // 处理单个发送任务时的错误，也标记为已处理
        await env.DB.prepare(`
          UPDATE push_logs 
          SET push_status = 1, error_message = ?
          WHERE id = ?
        `).bind(String(error), log.id).run()
        
        failed++
        console.error(`❌ 处理推送记录 ${log.id} 时出错:`, error)
      }
    }
    
    const stats = {
      pushAttempts: pendingLogs.results.length,
      successfulPushes: successful,
      failedPushes: failed
    }
    
    return {
      success: true,
      message: `推送任务完成：处理 ${pendingLogs.results.length} 条记录，成功 ${successful} 条，失败 ${failed} 条`,
      stats
    }
    
  } catch (error) {
    console.error('推送任务失败:', error)
    return {
      success: false,
      message: `推送任务失败: ${error}`,
      stats: {}
    }
  }
}

// 步骤2：为帖子匹配关键词并创建push_logs记录
async function createPushLogs(env: Env, posts: DBPost[]): Promise<{ totalLogs: number; createdLogs: number }> {
  let totalLogs = 0
  let createdLogs = 0
  
  try {
    // 获取所有活跃用户
    const users = await getActiveUsers(env.DB)
    
    for (const post of posts) {
      for (const user of users) {
        // 获取用户的关键词订阅
        const keywordSubs = await getUserKeywords(env.DB, user.id)
        
        for (const keywords of keywordSubs) {
          if (matchKeywords(post, keywords)) {
            totalLogs++
            
            // 检查是否已经创建过push_logs记录
            const existing = await env.DB.prepare(
              'SELECT id FROM push_logs WHERE user_id = ? AND post_id = ? AND sub_id = ?'
            ).bind(user.id, post.post_id, keywords.id).first()
            
            if (!existing) {
              // 创建新的push_logs记录，初始状态为待发送(0)
              await env.DB.prepare(`
                INSERT INTO push_logs (user_id, chat_id, post_id, sub_id, push_status, error_message)
                VALUES (?, ?, ?, ?, 0, NULL)
              `).bind(user.id, user.chat_id, post.post_id, keywords.id).run()
              
              createdLogs++
              console.log(`📝 为用户 ${user.chat_id} 创建帖子 ${post.post_id} 的推送记录`)
            }
            
            // 每个用户对每个帖子只创建一个push_logs记录，即使匹配多个关键词
            break
          }
        }
      }
      
      // 标记帖子为已匹配完成
      await markPostAsPushed(env.DB, post.post_id)
      console.log(`✅ 标记帖子 ${post.post_id} 为已匹配完成`)
    }
    
  } catch (error) {
    console.error('创建推送记录失败:', error)
  }
  
  return { totalLogs, createdLogs }
}

// 更新用户状态为非活跃
async function deactivateUser(db: D1Database, chatId: number): Promise<void> {
  try {
    await db.prepare('UPDATE users SET is_active = 0 WHERE chat_id = ?')
      .bind(chatId)
      .run()
    console.log(`🔒 已将用户 ${chatId} 标记为非活跃状态`)
  } catch (error) {
    console.error('更新用户状态失败:', error)
  }
}

// HTTP触发监控
monitor.post('/check', async (c) => {
  const result = await rssMonitorTask(c.env)
  return c.json(result)
})

// 手动触发监控（GET请求）
monitor.get('/check', async (c) => {
  const result = await rssMonitorTask(c.env)
  return c.json(result)
})

// HTTP触发推送任务
monitor.post('/push', async (c) => {
  const result = await pushTask(c.env)
  return c.json(result)
})

// 手动触发推送任务（GET请求）
monitor.get('/push', async (c) => {
  const result = await pushTask(c.env)
  return c.json(result)
})

// 监控状态检查
monitor.get('/status', (c) => {
  return c.json({
    service: 'RSS Monitor Service',
    status: 'running',
    version: '2.0.0',
    endpoints: [
      'POST /monitor/check - RSS监控任务（抓取RSS，创建推送记录）',
      'GET /monitor/check - RSS监控任务（GET方式）',
      'POST /monitor/push - 推送任务（发送待推送记录）',
      'GET /monitor/push - 推送任务（GET方式）',
      'GET /monitor/status - 服务状态'
    ],
    architecture: {
      rssTask: '负责抓取RSS数据并创建推送记录',
      pushTask: '负责发送待推送的消息记录',
      separation: '两个任务可以独立调度和监控'
    },
    timestamp: new Date().toISOString()
  })
})

// CF Worker 定时任务入口函数
export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  console.log('🕐 定时任务触发:', event.cron)

  try {
    // 先执行RSS监控任务（抓取新内容并创建推送记录）
    console.log('📡 执行RSS监控任务...')
    const rssResult = await rssMonitorTask(env)
    console.log('✅ RSS监控任务完成:', rssResult)

    // 再执行推送任务（处理待推送的记录）
    console.log('📤 执行推送任务...')
    const pushResult = await pushTask(env)
    console.log('✅ 推送任务完成:', pushResult)
    
    
  } catch (error) {
    console.error(`❌ 定时任务执行失败:`, error)
  }
}

// 兼容性：保留原有的手动触发函数
export async function handleScheduled(env: Env): Promise<void> {
  console.log('🕐 手动触发RSS监控...')
  const result = await rssMonitorTask(env)
  console.log('✅ RSS监控完成:', result)
}

export default monitor 