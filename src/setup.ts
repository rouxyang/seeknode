import { Hono } from 'hono'
import { Bot } from 'grammy'

const setup = new Hono<{
  Bindings: {
    BOT_TOKEN: string
    DB: D1Database
  }
}>()

// 数据库表创建SQL
const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pub_date DATETIME NOT NULL,
  category TEXT NOT NULL,
  creator TEXT NOT NULL,
  is_push INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_posts_post_id ON posts(post_id);
CREATE INDEX IF NOT EXISTS idx_posts_is_push ON posts(is_push);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL UNIQUE,
  username TEXT DEFAULT NULL,
  first_name TEXT DEFAULT NULL,
  last_name TEXT DEFAULT NULL,
  max_sub INTEGER DEFAULT 10,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users(chat_id);

CREATE TABLE IF NOT EXISTS keywords_sub (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  keywords_count INTEGER DEFAULT NULL,
  keyword1 TEXT NOT NULL,
  keyword2 TEXT DEFAULT NULL,
  keyword3 TEXT DEFAULT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_keywords_sub_user_id ON keywords_sub(user_id);

CREATE TABLE IF NOT EXISTS push_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  sub_id INTEGER NOT NULL,
  push_status INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_logs_user_chat ON push_logs(chat_id, post_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_user_id ON push_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_post_id ON push_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_push_status ON push_logs(push_status);
`

// 简单HTML页面
const SETUP_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>系统设置 - RSS监控机器人</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .step {
            margin: 20px 0;
            padding: 15px;
            border-left: 4px solid #ccc;
            background: #f9f9f9;
        }
        .step.success {
            border-left-color: #4CAF50;
            background: #f1f8e9;
        }
        .step.error {
            border-left-color: #f44336;
            background: #ffebee;
        }
        .step.loading {
            border-left-color: #2196F3;
            background: #e3f2fd;
        }
        .step-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .step-content {
            color: #666;
        }
        button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            display: block;
            margin: 20px auto;
        }
        button:hover {
            background: #45a049;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .success-message {
            text-align: center;
            color: #4CAF50;
            font-size: 18px;
            font-weight: bold;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 RSS监控机器人设置</h1>
        
        <div id="step1" class="step loading">
            <div class="step-title">1. 检查Bot Token</div>
            <div class="step-content">正在验证...</div>
        </div>
        
        <div id="step2" class="step">
            <div class="step-title">2. 设置Webhook</div>
            <div class="step-content">等待Bot验证完成</div>
        </div>
        
        <div id="step3" class="step">
            <div class="step-title">3. 检查数据库</div>
            <div class="step-content">等待前面步骤完成</div>
        </div>
        
        <div id="result" style="display: none;"></div>
        
        <button id="setupBtn" onclick="startSetup()" disabled>开始设置</button>
    </div>

    <script>
        let currentStep = 0;
        
        async function startSetup() {
            document.getElementById('setupBtn').disabled = true;
            document.getElementById('setupBtn').textContent = '设置中...';
            
            // 步骤1: 检查Bot Token
            await checkBotToken();
            
            // 步骤2: 设置Webhook
            await setupWebhook();
            
            // 步骤3: 检查数据库
            await checkDatabase();
            
            // 完成
            showSuccess();
        }
        
        async function checkBotToken() {
            updateStep('step1', 'loading', '正在验证Bot Token...');
            
            try {
                const response = await fetch('/setup/check');
                const data = await response.json();
                
                if (data.bot_valid) {
                    updateStep('step1', 'success', \`Bot验证成功: @\${data.bot_info.username}\`);
                } else {
                    updateStep('step1', 'error', \`Bot验证失败: \${data.bot_error}\`);
                    throw new Error('Bot Token无效');
                }
            } catch (error) {
                updateStep('step1', 'error', 'Bot Token验证失败');
                throw error;
            }
        }
        
        async function setupWebhook() {
            updateStep('step2', 'loading', '正在设置Webhook...');
            
            try {
                const response = await fetch('/setup/webhook', {method: 'POST'});
                const data = await response.json();
                
                if (data.success) {
                    updateStep('step2', 'success', \`Webhook设置成功: \${data.webhook_url}\`);
                } else {
                    updateStep('step2', 'error', \`Webhook设置失败: \${data.error}\`);
                    throw new Error('Webhook设置失败');
                }
            } catch (error) {
                updateStep('step2', 'error', 'Webhook设置失败');
                throw error;
            }
        }
        
        async function checkDatabase() {
            updateStep('step3', 'loading', '正在检查数据库...');
            
            try {
                const response = await fetch('/setup/database', {method: 'POST'});
                const data = await response.json();
                
                if (data.success) {
                    updateStep('step3', 'success', \`数据库就绪，共\${data.tables_count}个表\`);
                } else {
                    updateStep('step3', 'error', \`数据库设置失败: \${data.error}\`);
                    throw new Error('数据库设置失败');
                }
            } catch (error) {
                updateStep('step3', 'error', '数据库设置失败');
                throw error;
            }
        }
        
        function updateStep(stepId, status, message) {
            const step = document.getElementById(stepId);
            step.className = \`step \${status}\`;
            step.querySelector('.step-content').textContent = message;
        }
        
        function showSuccess() {
            document.getElementById('result').innerHTML = '<div class="success-message">🎉 系统设置完成！机器人已就绪。</div>';
            document.getElementById('result').style.display = 'block';
            document.getElementById('setupBtn').textContent = '重新设置';
            document.getElementById('setupBtn').disabled = false;
        }
        
        // 页面加载时启动设置
        window.onload = function() {
            document.getElementById('setupBtn').disabled = false;
            document.getElementById('setupBtn').textContent = '开始设置';
            startSetup();
        }
    </script>
</body>
</html>
`

// 主设置页面
setup.get('/', (c) => {
  return c.html(SETUP_HTML)
})

// 检查Bot Token和基本状态
setup.get('/check', async (c) => {
  try {
    const botToken = c.env.BOT_TOKEN
    
    if (!botToken) {
      return c.json({
        bot_valid: false,
        bot_error: 'BOT_TOKEN 未配置'
      })
    }

    // 验证Bot Token
    const bot = new Bot(botToken)
    const botInfo = await bot.api.getMe()
    
    return c.json({
      bot_valid: true,
      bot_info: {
        id: botInfo.id,
        username: botInfo.username,
        first_name: botInfo.first_name
      }
    })
  } catch (error) {
    return c.json({
      bot_valid: false,
      bot_error: String(error)
    })
  }
})

// 设置Webhook
setup.post('/webhook', async (c) => {
  try {
    const botToken = c.env.BOT_TOKEN
    if (!botToken) {
      return c.json({
        success: false,
        error: 'BOT_TOKEN 未配置'
      })
    }

    // 获取当前域名
    const url = new URL(c.req.url)
    const webhookUrl = `${url.protocol}//${url.host}/webhook`
    
    // 设置Webhook
    const bot = new Bot(botToken)
    await bot.api.setWebhook(webhookUrl)
    
    return c.json({
      success: true,
      webhook_url: webhookUrl
    })
  } catch (error) {
    return c.json({
      success: false,
      error: String(error)
    })
  }
})

// 检查和创建数据库表
setup.post('/database', async (c) => {
  try {
    const db = c.env.DB
    
    if (!db) {
      return c.json({
        success: false,
        error: '数据库未配置'
      })
    }

    // 检查现有表
    const tablesResult = await db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all()

    const existingTables = tablesResult.results.map((row: any) => row.name)
    const requiredTables = ['posts', 'users', 'keywords_sub', 'push_logs']
    const missingTables = requiredTables.filter(table => !existingTables.includes(table))

    // 如果有缺失的表，创建所有表
    if (missingTables.length > 0) {
      const statements = TABLES_SQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0)

      for (const statement of statements) {
        await db.prepare(statement).run()
      }
    }

    // 再次检查表状态
    const finalResult = await db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all()

    const finalTables = finalResult.results.map((row: any) => row.name)
    const allTablesExist = requiredTables.every(table => finalTables.includes(table))

    return c.json({
      success: allTablesExist,
      tables_count: finalTables.length,
      existing_tables: finalTables,
      created_tables: missingTables.length > 0 ? requiredTables : [],
      error: allTablesExist ? null : '部分表创建失败'
    })
  } catch (error) {
    return c.json({
      success: false,
      error: String(error)
    })
  }
})

export default setup