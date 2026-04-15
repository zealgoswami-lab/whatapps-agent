import winston from 'winston'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const logLevel = process.env.LOG_LEVEL || 'info'

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'whatsapp-agent' },
  transports: [
    // File transport for all logs
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Console transport with simpler format
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let metaStr = ''
          if (Object.keys(meta).length > 0) {
            metaStr = ` ${JSON.stringify(meta)}`
          }
          return `${timestamp} [${level}] ${message}${metaStr}`
        })
      ),
    }),
  ],
})

// Create logs directory if it doesn't exist
import fs from 'fs'
const logsDir = path.join(__dirname, '../logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Add trace method as alias to debug (required for Baileys library compatibility)
logger.trace = logger.debug

export default logger
