import axios from 'axios'
import logger from './logger.js'

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
const MESSAGE_PROCESSING_TIMEOUT = 30000 // 30 seconds
const RATE_LIMIT_DELAY = 200 // ms between processing requests

let lastProcessTime = 0
let processingQueue = []
let isProcessing = false

/**
 * Initialize orchestrator and start message processing queue
 */
export function initializeOrchestrator() {
  logger.info(`🔧 Orchestrator initialized (Python service: ${PYTHON_SERVICE_URL})`)
  
  // Start queue processor
  processQueuePeriodically()
}

/**
 * Process queued messages periodically to respect rate limits
 */
async function processQueuePeriodically() {
  setInterval(async () => {
    if (processingQueue.length === 0 || isProcessing) {
      return
    }

    const message = processingQueue.shift()
    isProcessing = true
    console.log('⏳ [DEBUG] Processing queue item:', message.messageId)

    try {
      // Respect rate limit
      const timeSinceLastProcess = Date.now() - lastProcessTime
      if (timeSinceLastProcess < RATE_LIMIT_DELAY) {
        await new Promise(resolve =>
          setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastProcess)
        )
      }

      await processMessage(message)
      lastProcessTime = Date.now()
    } catch (error) {
      console.log('❌ [DEBUG] Error processing queued message:', error.message)
      logger.error('Error processing queued message:', error.message)

      if (message.retries < message.maxRetries) {
        message.retries++
        processingQueue.push(message)
        logger.warn(`Message re-queued (attempt ${message.retries}/${message.maxRetries})`)
      } else {
        logger.error('Message dropped after max retries')
      }
    } finally {
      isProcessing = false
    }
  }, 100) // Check queue every 100ms
}

/**
 * Enqueue a message for processing
 * @param {Object} message - Prepared message object
 */
export function enqueueForProcessing(message) {
  processingQueue.push({
    ...message,
    status: 'pending',
    retries: 0,
    maxRetries: 3,
  })
  console.log('✅ [DEBUG] Message enqueued:', message.text.substring(0, 50), `Queue size: ${processingQueue.length}`)
  logger.info(`📥 Message enqueued for processing. Queue size: ${processingQueue.length}`)
}

/**
 * Process a single message with Python orchestrator
 * @param {Object} message - Message to process
 */
async function processMessage(message) {
  try {
    console.log('🔄 [DEBUG] Processing message:', message.messageId, message.text.substring(0, 50))
    logger.info(`📤 Processing message: ${message.text.substring(0, 50)}...`)

    // 1. Check if message requires immediate alert (mentions detected)
    if (message.mentions.length > 0) {
      console.log('🔔 [DEBUG] Mention detected:', message.mentions)
      logger.info(`🔔 Mention detected: ${message.mentions.join(', ')}`)
      
      const alertResponse = await callPythonService('/generate-alert', {
        message_text: message.text,
        sender: message.sender,
        group_id: message.jid,
        mentions: message.mentions,
      })

      if (alertResponse.alert_text) {
        message.alert = alertResponse.alert_text
        message.needsAlert = true
        logger.info('Alert generated, ready to send to user')
      }
    }

    // 2. For longer messages, request summarization
    if (message.text.length > 500) {
      console.log('📝 [DEBUG] Message exceeds 500 chars, requesting summarization')
      logger.debug('Message exceeds 500 chars, requesting summarization')

      const summaryResponse = await callPythonService('/summarize', {
        text: message.text,
        max_length: 150,
        min_length: 30,
      })

      if (summaryResponse.summary) {
        message.summary = summaryResponse.summary
        logger.info('Summary generated')
      }
    }

    message.status = 'processed'
    console.log('✅ [DEBUG] Message processed successfully')
    logger.info(`✅ Message processed successfully`)

  } catch (error) {
    console.log('❌ [DEBUG] Error processing message:', error.message)
    logger.error(`Failed to process message ${message.messageId}:`, error.message)
    throw error
  }
}

/**
 * Call Python FastAPI service
 * @param {string} endpoint - API endpoint (e.g., '/summarize')
 * @param {Object} payload - Request payload
 * @returns {Promise<Object>} Response from Python service
 */
async function callPythonService(endpoint, payload) {
  try {
    const url = `${PYTHON_SERVICE_URL}${endpoint}`
    
    console.log(`📤 [NODE] Calling Python service: POST ${url}`)
    console.log(`   Payload: ${JSON.stringify(payload, null, 2)}`)
    logger.debug(`Calling Python service: POST ${url}`)

    const response = await axios.post(url, payload, {
      timeout: MESSAGE_PROCESSING_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    console.log(`✅ [NODE] Python response received (${response.status})`)
    console.log(`   Data: ${JSON.stringify(response.data, null, 2)}`)
    logger.debug(`Python service response: ${response.status}`)
    return response.data

  } catch (error) {
    if (error.response) {
      console.log(`❌ [NODE] Python service error: ${error.response.status}`)
      console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`)
      logger.error(`Python service error: ${error.response.status} - ${error.response.statusText}`, {
        data: error.response.data,
      })
      throw new Error(`Service error: ${error.response.status}`)
    } else if (error.code === 'ECONNREFUSED') {
      console.log(`❌ [NODE] Python service is unavailable (connection refused)`)
      logger.error('Python service is unavailable (connection refused)')
      throw new Error('Python service unavailable')
    } else {
      console.log(`❌ [NODE] Network error: ${error.message}`)
      logger.error('Network error calling Python service:', error.message)
      throw error
    }
  }
}

/**
 * Health check for Python service
 * @returns {Promise<boolean>} True if service is healthy
 */
export async function checkPythonServiceHealth() {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, {
      timeout: 5000,
    })
    return response.status === 200
  } catch (error) {
    logger.warn('Python service health check failed:', error.message)
    return false
  }
}

/**
 * Get current queue stats
 * @returns {Object} Queue statistics
 */
export function getQueueStats() {
  return {
    queueSize: processingQueue.length,
    isProcessing,
    pythonServiceUrl: PYTHON_SERVICE_URL,
  }
}
