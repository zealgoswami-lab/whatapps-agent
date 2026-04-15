import { Client } from 'whatsapp-web.js'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'
import logger from './logger.js'

let socket = null
let isConnectedFlag = false
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5
const BASE_RECONNECT_DELAY = 3000 // 3 seconds
const QR_CODES_DIR = 'qr_codes'

// Create QR codes directory if it doesn't exist
if (!fs.existsSync(QR_CODES_DIR)) {
  fs.mkdirSync(QR_CODES_DIR, { recursive: true })
}

/**
 * Initialize WhatsApp Web session with QR code handling
 * @returns {Promise<Object>} whatsapp-web.js client object
 */
export async function initializeWhatsAppSession() {
  try {
    socket = new Client({
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }
    })

    // Handle QR code for authentication
    socket.on('qr', async (qr) => {
      reconnectAttempts = 0 // Reset counter on new QR
      logger.info('📱 QR Code received - generating QR code image...')
      
      try {
        // Generate QR code as PNG image
        const timestamp = Date.now()
        const qrFilePath = path.join(QR_CODES_DIR, `whatsapp-qr-${timestamp}.png`)
        
        await QRCode.toFile(qrFilePath, qr, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          quality: 0.95,
          margin: 1,
          width: 300,
        })
        
        logger.info(`✅ QR Code saved: ${qrFilePath}`)
        logger.info('📱 Scan this QR code with WhatsApp on your phone to authenticate')
        
        // Also generate terminal version
        try {
          const qrcodeTerminal = (await import('qrcode-terminal')).default
          qrcodeTerminal.generate(qr, { small: true }, (qr_ascii) => {
            logger.info('\n' + qr_ascii + '\n')
          })
        } catch (err) {
          logger.debug('qrcode-terminal not available, showing file path instead')
        }
      } catch (error) {
        logger.error('Failed to generate QR code:', error)
      }
    })

    // Handle connection updates
    socket.on('ready', () => {
      isConnectedFlag = true
      reconnectAttempts = 0 // Reset counter on successful connection
      logger.info('✅ Successfully connected to WhatsApp')
    })

    // Handle disconnection
    socket.on('disconnected', (reason) => {
      isConnectedFlag = false
      logger.warn(`⚠️ Disconnected: ${reason}`)
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++
        const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1) // Exponential backoff
        logger.info(`🔄 Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s...`)
      } else {
        logger.error(`❌ Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please restart.`)
        reconnectAttempts = 0
      }
    })

    // Handle authentication failures
    socket.on('auth_failure', (msg) => {
      isConnectedFlag = false
      logger.error(`❌ Authentication failure: ${msg}`)
      logger.warn('⚠️ Please try these steps:')
      logger.warn('1. Delete the auth_info_whatsapp/ directory')
      logger.warn('2. Restart the application')
      logger.warn('3. Scan the new QR code with your phone\'s WhatsApp')
      logger.warn('4. Make sure your phone has internet connection')
    })

    // Handle general errors
    socket.on('error', (error) => {
      isConnectedFlag = false
      logger.error(`❌ Socket error: ${error.message}`)
      logger.debug('Error details:', error)
    })

    // Initialize the client
    await socket.initialize()

    return socket
  } catch (error) {
    logger.error('Failed to initialize WhatsApp session:', error)
    throw error
  }
}

/**
 * Get the current socket instance
 * @returns {Object} whatsapp-web.js client object
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
  return isConnectedFlag && socket !== null
}

/**
 * Wait for socket to be ready
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<boolean>} True if connected, false if timeout
 */
export async function waitForReady(timeoutMs = 30000) {
  const startTime = Date.now()
  while (!isConnected()) {
    if (Date.now() - startTime > timeoutMs) {
      logger.error('Timeout waiting for WhatsApp connection')
      return false
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return true
}
