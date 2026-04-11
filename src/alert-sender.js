import logger from './logger.js'

const ALERT_COOLDOWN = 5 * 60 * 1000 // 5 minutes per user
const userAlertTimestamps = new Map() // Track last alert sent per user

/**
 * Send a private alert message to user via WhatsApp
 * @param {Object} socket - Bailey socket instance
 * @param {Object} alertData - Alert data containing message, sender, group, etc.
 * @param {string} botNumber - Bot's WhatsApp number (JID format: 1234567890@s.whatsapp.net)
 * @returns {Promise<void>}
 */
export async function sendPrivateAlert(socket, alertData, botNumber) {
  try {
    // Extract data
    const { sender, group_id, alert_text, mentioned_action } = alertData
    const userJid = normalizeJid(sender)

    // Check rate limit
    if (isAlertRateLimited(userJid)) {
      logger.warn(`⏱️ Alert rate limited for ${userJid}. Skipping.`)
      return
    }

    // Format alert message
    const formattedAlert = formatAlertMessage({
      alertText: alert_text,
      action: mentioned_action,
      sender,
      groupId: group_id,
    })

    // Send to user
    await socket.sendMessage(userJid, {
      text: formattedAlert,
    })

    recordAlertSent(userJid)
    logger.info(`✅ Alert sent to ${userJid}`)

  } catch (error) {
    logger.error('Failed to send alert:', error.message)
    throw error
  }
}

/**
 * Format a nicely structured alert message
 * @param {Object} options - Alert options
 * @returns {string} Formatted alert text
 */
function formatAlertMessage({ alertText, action, sender, groupId }) {
  const timestamp = new Date().toLocaleTimeString()
  
  let message = `🔔 *You have a new alert*\n\n`
  message += `⏰ *Time*: ${timestamp}\n`
  message += `👤 *From*: ${extractNameFromJid(sender)}\n`
  message += `💬 *Group*: ${extractNameFromJid(groupId)}\n`
  message += `\n━━━━━━━━━━━━━━━━━━━\n`
  message += `${alertText}`
  
  if (action) {
    message += `\n\n✅ *Action Required*: ${action}`
  }

  return message
}

/**
 * Extract human-readable name from JID
 * @param {string} jid - JID string
 * @returns {string} Name or JID
 */
function extractNameFromJid(jid) {
  if (!jid) return 'Unknown'
  
  // For group JIDs, remove @g.us
  if (jid.includes('@g.us')) {
    return jid.replace('@g.us', '')
  }
  
  // For individual JIDs, just remove @s.whatsapp.net
  if (jid.includes('@s.whatsapp.net')) {
    return jid.replace('@s.whatsapp.net', '')
  }

  return jid
}

/**
 * Normalize JID to individual format (add @s.whatsapp.net if needed)
 * @param {string} jid - JID string
 * @returns {string} Normalized JID
 */
function normalizeJid(jid) {
  if (!jid.includes('@')) {
    return `${jid}@s.whatsapp.net`
  }
  
  if (jid.includes('@g.us')) {
    // Can't send to group JID, need individual number
    return jid.replace('@g.us', '@s.whatsapp.net')
  }

  return jid
}

/**
 * Check if user is rate-limited for alerts
 * @param {string} userJid - User JID
 * @returns {boolean}
 */
function isAlertRateLimited(userJid) {
  const lastAlertTime = userAlertTimestamps.get(userJid)
  
  if (!lastAlertTime) {
    return false // No previous alert
  }

  const timeSinceLastAlert = Date.now() - lastAlertTime
  return timeSinceLastAlert < ALERT_COOLDOWN
}

/**
 * Record that an alert was sent to a user
 * @param {string} userJid - User JID
 */
function recordAlertSent(userJid) {
  userAlertTimestamps.set(userJid, Date.now())
}

/**
 * Get alert cooldown status for user
 * @param {string} userJid - User JID
 * @returns {Object} Status object with remaining time
 */
export function getAlertStatus(userJid) {
  const lastAlertTime = userAlertTimestamps.get(userJid)
  
  if (!lastAlertTime) {
    return { rateLimited: false, nextAlertTime: null }
  }

  const timeSinceLastAlert = Date.now() - lastAlertTime
  const isLimited = timeSinceLastAlert < ALERT_COOLDOWN
  const remainingTime = ALERT_COOLDOWN - timeSinceLastAlert

  return {
    rateLimited: isLimited,
    nextAlertTime: isLimited ? new Date(Date.now() + remainingTime) : null,
    remainingMs: Math.max(0, remainingTime),
  }
}

/**
 * Clear alert history for a user (admin function)
 * @param {string} userJid - User JID
 */
export function clearAlertHistory(userJid) {
  userAlertTimestamps.delete(userJid)
  logger.info(`Alert history cleared for ${userJid}`)
}
