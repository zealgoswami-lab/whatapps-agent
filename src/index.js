import 'dotenv/config'
import express from 'express'
import logger from './logger.js'
import { initializeWhatsAppSession, getSocket, isConnected, waitForReady } from './whatsapp-session.js'
import { setupMessageListener } from './message-listener.js'
import {
  getAllGroups,
  getGroupMessages,
  getAllGroupMessages,
  getGroupInfo,
  searchGroupMessages,
  getAllPersonalChats,
  getPersonalMessages,
  getAllPersonalMessages,
  searchPersonalMessages,
  getAllMessages,
  formatGroupsForDisplay,
  formatMessagesForDisplay,
  formatPersonalChatsForDisplay,
  formatGroupConversation,
  formatPersonalConversation,
  formatSearchResults,
} from './group-manager.js'
import { 
  initializeOrchestrator, 
  enqueueForProcessing, 
  checkPythonServiceHealth,
  getQueueStats 
} from './orchestrator.js'

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json())

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if socket is ready and throw helpful error if not
 */
function checkSocketReady() {
  try {
    const socket = getSocket()
    if (!socket) {
      throw new Error('WhatsApp socket not initialized')
    }
    if (!isConnected()) {
      throw new Error('WhatsApp not connected. Please wait and try again or scan the QR code.')
    }
    return socket
  } catch (error) {
    throw {
      status: 503,
      message: error.message || 'WhatsApp service unavailable',
      hint: 'Make sure WhatsApp is authenticated with QR code scan'
    }
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

/**
 * Get queue and orchestrator stats
 */
app.get('/stats', (req, res) => {
  const stats = getQueueStats()
  res.json({
    ...stats,
    timestamp: new Date().toISOString(),
  })
})

/**
 * Manually process a test message
 */
app.post('/test-message', (req, res) => {
  const { text, sender, group } = req.body

  if (!text || !sender) {
    return res.status(400).json({
      error: 'Missing required fields: text, sender',
    })
  }

  const testMessage = {
    jid: group || 'test-group@g.us',
    sender: sender || '1234567890@s.whatsapp.net',
    messageId: `test-${Date.now()}`,
    timestamp: new Date(),
    text,
    isGroup: true,
    messageType: 'text',
    mentions: [],
  }

  logger.info('📥 Test message received via API')
  enqueueForProcessing(testMessage)

  res.json({
    success: true,
    message: 'Test message queued for processing',
    messageId: testMessage.messageId,
  })
})

/**
 * Get all groups user is part of
 */
app.get('/groups', async (req, res) => {
  try {
    const format = req.query.format || 'json' // 'json' or 'text'
    
    const socket = checkSocketReady()
    const groups = await getAllGroups(socket)
    
    if (format === 'text') {
      res.type('text/plain').send(formatGroupsForDisplay(groups))
    } else {
      res.json({
        success: true,
        count: groups.length,
        groups: groups,
        _hint: 'Add ?format=text to get readable format',
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    logger.error('Error fetching groups:', error)
    const status = error.status || 500
    res.status(status).json({
      success: false,
      error: error.message || error,
      hint: error.hint,
    })
  }
})

/**
 * Get messages from a specific group
 */
app.get('/groups/:groupId/messages', async (req, res) => {
  try {
    const { groupId } = req.params
    const limit = parseInt(req.query.limit) || 100
    const format = req.query.format || 'json' // 'json' or 'text'
    
    const socket = getSocket()
    const messages = await getGroupMessages(socket, groupId, limit)
    
    // Get group name for formatted output
    let groupName = groupId
    try {
      const chats = await socket.getChats()
      const groupChat = chats.find(c => c.id._serialized === groupId)
      if (groupChat) groupName = groupChat.name || groupId
    } catch (err) {
      logger.debug('Could not fetch group name for formatting')
    }
    
    if (format === 'text') {
      res.type('text/plain').send(formatGroupConversation(groupName, messages))
    } else {
      res.json({
        success: true,
        groupId: groupId,
        messageCount: messages.length,
        messages: messages,
        _hint: 'Add ?format=text to get readable format',
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    logger.error('Error fetching group messages:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Get messages from all groups
 */
app.get('/groups/messages/all', async (req, res) => {
  try {
    const messagesPerGroup = parseInt(req.query.limit) || 50
    
    const socket = getSocket()
    const allMessages = await getAllGroupMessages(socket, messagesPerGroup)
    
    res.json({
      success: true,
      groupCount: Object.keys(allMessages).length,
      groups: allMessages,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Error fetching all group messages:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Get detailed info about a specific group
 */
app.get('/groups/:groupId/info', async (req, res) => {
  try {
    const { groupId } = req.params
    
    const socket = getSocket()
    const groupInfo = await getGroupInfo(socket, groupId)
    
    res.json({
      success: true,
      groupInfo: groupInfo,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Error fetching group info:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Search messages in a group
 */
app.get('/groups/:groupId/search', async (req, res) => {
  try {
    const { groupId } = req.params
    const { q } = req.query
    const limit = parseInt(req.query.limit) || 200
    const format = req.query.format || 'json'
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Missing search query parameter: q',
      })
    }
    
    const socket = checkSocketReady()
    const results = await searchGroupMessages(socket, groupId, q, limit)
    
    if (format === 'text') {
      res.type('text/plain').send(formatSearchResults(q, results, 'group'))
    } else {
      res.json({
        success: true,
        groupId: groupId,
        searchQuery: q,
        resultCount: results.length,
        results: results,
        _hint: 'Add ?format=text to get readable format',
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    logger.error('Error searching group messages:', error)
    const status = error.status || 500
    res.status(status).json({
      success: false,
      error: error.message || error,
      hint: error.hint,
    })
  }
})

/**
 * Get all personal chats (direct messages)
 */
app.get('/personal-chats', async (req, res) => {
  try {
    const format = req.query.format || 'json' // 'json' or 'text'
    
    const socket = getSocket()
    const chats = await getAllPersonalChats(socket)
    
    if (format === 'text') {
      res.type('text/plain').send(formatPersonalChatsForDisplay(chats))
    } else {
      res.json({
        success: true,
        count: chats.length,
        chats: chats,
        _hint: 'Add ?format=text to get readable format',
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    logger.error('Error fetching personal chats:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Get messages from a specific personal chat
 */
app.get('/personal-chats/:contactId/messages', async (req, res) => {
  try {
    const { contactId } = req.params
    const limit = parseInt(req.query.limit) || 100
    const format = req.query.format || 'json' // 'json' or 'text'
    
    const socket = getSocket()
    const messages = await getPersonalMessages(socket, contactId, limit)
    
    // Get contact name for formatted output
    let contactName = contactId
    try {
      const chats = await socket.getChats()
      const contactChat = chats.find(c => c.id._serialized === contactId || c.id._serialized === `${contactId}@c.us`)
      if (contactChat) contactName = contactChat.name || contactId
    } catch (err) {
      logger.debug('Could not fetch contact name for formatting')
    }
    
    if (format === 'text') {
      res.type('text/plain').send(formatPersonalConversation(contactName, messages))
    } else {
      res.json({
        success: true,
        contactId: contactId,
        messageCount: messages.length,
        messages: messages,
        _hint: 'Add ?format=text to get readable format',
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    logger.error('Error fetching personal messages:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Get messages from all personal chats
 */
app.get('/personal-chats/messages/all', async (req, res) => {
  try {
    const messagesPerChat = parseInt(req.query.limit) || 50
    
    const socket = getSocket()
    const allMessages = await getAllPersonalMessages(socket, messagesPerChat)
    
    res.json({
      success: true,
      chatCount: Object.keys(allMessages).length,
      chats: allMessages,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Error fetching all personal messages:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Search messages in a personal chat
 */
app.get('/personal-chats/:contactId/search', async (req, res) => {
  try {
    const { contactId } = req.params
    const { q } = req.query
    const limit = parseInt(req.query.limit) || 200
    const format = req.query.format || 'json'
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Missing search query parameter: q',
      })
    }
    
    const socket = getSocket()
    const results = await searchPersonalMessages(socket, contactId, q, limit)
    
    if (format === 'text') {
      res.type('text/plain').send(formatSearchResults(q, results, 'personal'))
    } else {
      res.json({
        success: true,
        contactId: contactId,
        searchQuery: q,
        resultCount: results.length,
        results: results,
        _hint: 'Add ?format=text to get readable format',
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    logger.error('Error searching personal messages:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Get all messages combined (groups + personal)
 */
app.get('/messages/all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50
    
    const socket = getSocket()
    const allMessages = await getAllMessages(socket, limit)
    
    res.json({
      success: true,
      groupCount: Object.keys(allMessages.groups).length,
      personalChatCount: Object.keys(allMessages.personal).length,
      data: allMessages,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Error fetching all messages:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// ============================================================================
// INITIALIZATION
// ============================================================================

let socket = null

/**
 * Start the application
 */
async function startApp() {
  try {
    logger.info('🚀 WhatsApp Agent starting...')

    // Initialize Bailey WhatsApp session
    logger.info('📱 Initializing WhatsApp session...')
    socket = await initializeWhatsAppSession()

    // Setup message listener
    logger.info('👂 Setting up message listener...')
    setupMessageListener(socket, (message) => {
      enqueueForProcessing(message)
    })

    // Initialize orchestrator
    logger.info('🔧 Initializing orchestrator...')
    initializeOrchestrator()

    // Check Python service health
    logger.info('🔍 Checking Python service health...')
    const pythonHealthy = await checkPythonServiceHealth()
    if (!pythonHealthy) {
      logger.warn('⚠️ Python service is not available. Ensure it is running on http://localhost:8000')
    }

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`✅ Express server running on http://localhost:${PORT}`)
      logger.info('🎯 WhatsApp Agent is ready!')
      logger.info('')
      logger.info('Available endpoints:')
      logger.info(`  GET  http://localhost:${PORT}/health - Health check`)
      logger.info(`  GET  http://localhost:${PORT}/stats - Queue statistics`)
      logger.info('')
      logger.info('📋 GROUP ENDPOINTS:')
      logger.info(`  GET  http://localhost:${PORT}/groups - List all groups`)
      logger.info(`  GET  http://localhost:${PORT}/groups/messages/all - Get messages from all groups`)
      logger.info(`  GET  http://localhost:${PORT}/groups/:groupId/info - Get group details`)
      logger.info(`  GET  http://localhost:${PORT}/groups/:groupId/messages - Get group messages`)
      logger.info(`  GET  http://localhost:${PORT}/groups/:groupId/search?q=text - Search group messages`)
      logger.info('')
      logger.info('💬 PERSONAL MESSAGE ENDPOINTS:')
      logger.info(`  GET  http://localhost:${PORT}/personal-chats - List all personal chats`)
      logger.info(`  GET  http://localhost:${PORT}/personal-chats/messages/all - Get all personal messages`)
      logger.info(`  GET  http://localhost:${PORT}/personal-chats/:contactId/messages - Get personal messages`)
      logger.info(`  GET  http://localhost:${PORT}/personal-chats/:contactId/search?q=text - Search personal messages`)
      logger.info('')
      logger.info('📨 COMBINED ENDPOINTS:')
      logger.info(`  GET  http://localhost:${PORT}/messages/all - Get all messages (groups + personal)`)
      logger.info(`  POST http://localhost:${PORT}/test-message - Send test message`)
      logger.info('')
    })

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('⏹️ Shutting down gracefully...')
      process.exit(0)
    })

  } catch (error) {
    logger.error('Failed to start application:', error)
    process.exit(1)
  }
}

// Start the app
startApp()

export { app, socket }
