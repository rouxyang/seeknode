import { Hono } from 'hono'

// 创建RSS应用实例
const rss = new Hono()

// RSS帖子接口类型
interface RSSPost {
  id: string
  title: string
  description: string
  pubDate: string
  category: string
  creator: string
}

// 解析RSS XML数据
function parseRSSXML(xmlText: string): RSSPost[] {
  try {
    // 在Cloudflare Workers环境中使用HTMLRewriter的替代方案
    // 或者简单的正则表达式解析
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

// RSS获取和解析接口
rss.get('/posts', async (c) => {
  try {
    console.log('开始获取RSS源...')
    
    // 获取RSS数据
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
    
    console.log(`RSS请求状态: ${response.status}`)
    console.log(`响应头:`, response.headers)
    
    if (!response.ok) {
      // 尝试读取错误响应内容
      let errorText = ''
      try {
        errorText = await response.text()
      } catch (e) {
        errorText = '无法读取错误响应内容'
      }
      
      throw new Error(`HTTP错误: ${response.status} - ${response.statusText}. 响应内容: ${errorText}`)
    }
    
    const xmlText = await response.text()
    console.log('RSS数据获取成功，数据长度:', xmlText.length)
    console.log('RSS数据前500字符:', xmlText.substring(0, 500))
    
    // 解析RSS数据
    const posts = parseRSSXML(xmlText)
    
    return c.json({
      success: true,
      message: '获取RSS数据成功',
      count: posts.length,
      data: posts,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('获取RSS数据失败:', error)
    return c.json({
      success: false,
      message: '获取RSS数据失败',
      error: String(error),
      timestamp: new Date().toISOString()
    }, 500)
  }
  })

  // 测试直接访问RSS源的接口
  rss.get('/test', async (c) => {
    try {
      console.log('测试RSS访问...')
      
      // 尝试多种不同的请求方式
      const methods: Array<{name: string, options: RequestInit}> = [
        {
          name: '标准浏览器请求',
          options: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              'Referer': 'https://www.nodeseek.com/'
            }
          }
        },
        {
          name: '简单RSS请求',
          options: {
            headers: {
              'User-Agent': 'RSS Reader Bot',
              'Accept': 'application/rss+xml,application/xml,text/xml'
            }
          }
        },
        {
          name: '基础请求',
          options: {
            headers: {
              'User-Agent': 'curl/7.68.0'
            }
          }
        }
      ]
      
      const results: any[] = []
      
      for (const method of methods) {
        try {
          console.log(`尝试方法: ${method.name}`)
          const response = await fetch('https://rss.nodeseek.com/', method.options)
          
          const result = {
            method: method.name,
            status: response.status,
            statusText: response.statusText,
            success: response.ok,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length')
          }
          
          if (response.ok) {
            const text = await response.text()
            Object.assign(result, { contentPreview: text.substring(0, 200) })
            results.push(result)
            break // 成功了就停止尝试其他方法
          } else {
            results.push(result)
          }
          
        } catch (error) {
          results.push({
            method: method.name,
            error: String(error),
            success: false
          })
        }
      }
      
      return c.json({
        message: 'RSS访问测试结果',
        results,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      return c.json({
        message: '测试失败',
        error: String(error),
        timestamp: new Date().toISOString()
      }, 500)
    }
  })
  
  // RSS接口状态检查
rss.get('/status', (c) => {
  return c.json({
    service: 'NodeSeek RSS Parser',
    status: 'running',
    version: '1.0.0',
    endpoints: [
      'GET /rss/posts - 获取所有帖子',
      'GET /rss/status - 服务状态'
    ],
    timestamp: new Date().toISOString()
  })
})

export default rss 