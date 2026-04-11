import makeWASocket, { useMultiFileAuthState, Browsers, DisconnectReason } from '@whiskeysockets/baileys'
import logger from './logger.js'

let socket = null

/**
 * Initialize Bailey WhatsApp session with QR code handling
 * @returns {Promise<Object>} Bailey socket object
 */
export async function initializeWhatsAppSession() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')

    socket = makeWASocket({
      auth: state,
      browser: Browsers.ubuntu('WhatsApp Agent'),
      printQRInTerminal: true,
      logger: logger,
      generateHighQualityLinkPreview: true,
    })

    // Save credentials when they update
    socket.ev.on('creds.update', saveCreds)

    // Handle connection updates
    socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        logger.info('📱 QR Code received - scan with WhatsApp to authenticate')
      }

      if (connection === 'open') {
        logger.info('✅ Successfully connected to WhatsApp')
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = reason !== DisconnectReason.loggedOut

        if (shouldReconnect) {
          logger.warn(`⚠️ Connection closed: ${reason}. Attempting to reconnect...`)
          // Reconnect logic handled by main app
        } else {
          logger.error(`❌ Connection closed: logged out (status code ${reason})`)
        }
      }
    })

    // Log connection attempts
    socket.ev.on('connection.update', ({ connection }) => {
      if (connection) {
        logger.debug(`Connection status: ${connection}`)
      }
    })

    return socket
  } catch (error) {
    logger.error('Failed to initialize WhatsApp session:', error)
    throw error
  }
}

/**
 * Get the current socket instance
 * @returns {Object} Bailey socket object
 */
export function getSocket() {
  if (!socket) {
    throw new Error('WhatsApp socket not initialized. Call initializeWhatsAppSession() first.')
  }
  return socket
}

/**
 * Check if socket is connected
 * @returns {boolean}
 */
export function isConnected() {
  return socket?.ws?.readyState === 1 // WebSocket OPEN state
}
