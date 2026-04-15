import logger from './logger.js'

/**
 * Sanitize and prepare message data for processing
 * @param {Object} message - Raw message object from whatsapp-web.js
 * @returns {Object|null} Processed message or null if should be filtered
 */
function prepareMessagePayload(message) {
  try {
    const text = message.body || ''
    
    if (!text || text.trim().length === 0) {
      return null // Skip empty messages
    }

    return {
      jid: message.from, // Chat JID (group or individual)
      sender: message.author || message.from, // Sender JID
      messageId: message.id.id,
      timestamp: new Date(message.timestamp * 1000),
      text: text.trim(),
      isGroup: message.isGroupMsg,
      messageType: message.type || 'text',
      mentions: extractMentions(text),
    }
  } catch (error) {
    logger.error('Error preparing message payload:', error)
    return null
  }
}

/**
 * Extract @mentions from message text
 * @param {string} text - Message text
 * @returns {Array<string>} Array of mentioned usernames
 */
function extractMentions(text) {
  const mentionRegex = /@[\w.]+/g
  const matches = text.match(mentionRegex) || []
  return matches.map(m => m.substring(1)) // Remove @ symbol
}

/**
 * Set up message listener on whatsapp-web.js socket
 * @param {Object} socket - whatsapp-web.js client instance
 * @param {Function} messageCallback - Callback to handle processed messages
 */
export function setupMessageListener(socket, messageCallback) {
  socket.on('message', (message) => {
    // Skip if message is from us
    if (message.fromMe) {
      logger.debug('Skipping own message')
      return
    }

    const prepared = prepareMessagePayload(message)
    
    if (!prepared) {
      logger.debug('Skipped invalid/empty message')
      return
    }

    logger.info(
      `📨 Message received`,
      {
        from: prepared.sender,
        group: prepared.isGroup ? prepared.jid : 'DM',
        text: prepared.text.substring(0, 100) + (prepared.text.length > 100 ? '...' : ''),
        mentions: prepared.mentions,
      }
    )

    // Invoke the callback with prepared message
    messageCallback(prepared)
  })

  logger.info('✅ Message listener setup complete')
}

/**
 * Handle message processing task (enqueue for orchestrator)
 * @param {Object} message - Prepared message object
 * @param {Array} queue - Message processing queue
 */
export function enqueueMessage(message, queue) {
  queue.push({
    ...message,
    status: 'pending',
    retries: 0,
    maxRetries: 3,
  })
  logger.debug(`Message enqueued. Queue size: ${queue.length}`)
}
