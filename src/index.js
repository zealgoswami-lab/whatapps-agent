import 'dotenv/config'
import express from 'express'
import logger from './logger.js'
import { initializeWhatsAppSession, getSocket } from './whatsapp-session.js'
import { setupMessageListener } from './message-listener.js'
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
