import logger from './logger.js'

/**
 * Sanitize and prepare message data for processing
 * @param {Object} message - Raw message object from Bailey
 * @returns {Object|null} Processed message or null if should be filtered
 */
function prepareMessagePayload(message) {
  try {
    const key = message.key || {}
    const conversation = message.conversation || message.extendedTextMessage?.text || ''
    
    if (!conversation || conversation.trim().length === 0) {
      return null // Skip empty messages
    }

    return {
      jid: key.remoteJid, // Chat JID (group or individual)
      sender: key.participant || key.remoteJid, // Sender JID
      messageId: key.id,
      timestamp: message.messageTimestamp ? new Date(parseInt(message.messageTimestamp) * 1000) : new Date(),
      text: conversation.trim(),
      isGroup: key.remoteJid?.endsWith('@g.us') || false,
      messageType: message.type || 'text',
      mentions: extractMentions(conversation),
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
 * Set up message listener on Bailey socket
 * @param {Object} socket - Bailey socket instance
 * @param {Function} messageCallback - Callback to handle processed messages
 */
export function setupMessageListener(socket, messageCallback) {
  socket.ev.on('messages.upsert', ({ messages, type }) => {
    for (const message of messages) {
      // Skip if message is from us or older than 1 minute
      if (message.key.fromMe) {
        logger.debug('Skipping own message')
        continue
      }

      const prepared = prepareMessagePayload(message)
      
      if (!prepared) {
        logger.debug('Skipped invalid/empty message')
        continue
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
    }
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
