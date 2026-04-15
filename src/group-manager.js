import logger from './logger.js'

/**
 * Helper function to get chat with retry logic
 * @param {Object} socket - WhatsApp client instance
 * @param {string} chatId - Chat ID to retrieve
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<Object>} Chat object
 */
async function getChatWithRetry(socket, chatId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Getting chat ${chatId} (attempt ${attempt}/${maxRetries})`)
      const chat = await socket.getChatById(chatId)
      if (chat) {
        return chat
      }
    } catch (error) {
      logger.warn(`Attempt ${attempt} failed: ${error.message}`)
      if (attempt < maxRetries) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      } else {
        throw new Error(`Failed to get chat after ${maxRetries} attempts: ${error.message}`)
      }
    }
  }
}

/**
 * Helper function to get all chats with error handling
 * @param {Object} socket - WhatsApp client instance
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<Array>} Array of chat objects
 */
async function getAllChatsWithRetry(socket, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Getting all chats (attempt ${attempt}/${maxRetries})`)
      const chats = await socket.getChats()
      if (chats && chats.length >= 0) {
        return chats
      }
    } catch (error) {
      logger.warn(`Attempt ${attempt} failed: ${error.message}`)
      if (attempt < maxRetries) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      } else {
        throw new Error(`Failed to get chats after ${maxRetries} attempts: ${error.message}`)
      }
    }
  }
}

/**
 * Helper function to fetch messages with error handling
 * @param {Object} chat - Chat object
 * @param {number} limit - Number of messages to fetch
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<Array>} Array of message objects
 */
async function fetchMessagesWithRetry(chat, limit, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Fetching ${limit} messages (attempt ${attempt}/${maxRetries})`)
      const messages = await chat.fetchMessages({ limit })
      return messages || []
    } catch (error) {
      logger.warn(`Message fetch attempt ${attempt} failed: ${error.message}`)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 300 * attempt))
      } else {
        throw new Error(`Failed to fetch messages after ${maxRetries} attempts: ${error.message}`)
      }
    }
  }
}

/**
 * Get all chats (both groups and personal)
 * @param {Object} socket - WhatsApp client instance
 * @returns {Promise<Object>} Object containing groups and personal chats
 */
export async function getAllChats(socket) {
  try {
    logger.info('📋 Fetching all chats...')
    
    const chats = await getAllChatsWithRetry(socket)
    
    const groups = chats.filter(chat => chat.isGroup).map(group => ({
      id: group.id._serialized,
      name: group.name || 'Unknown Group',
      type: 'group',
      participantCount: group.participants?.length || 0,
      isArchived: group.archived,
      isPinned: group.pinned,
      unreadCount: group.unreadCount,
      lastMessage: group.lastMessage?.body || 'No messages',
      timestamp: group.timestamp ? new Date(group.timestamp * 1000) : null,
    }))
    
    const personal = chats.filter(chat => !chat.isGroup).map(chat => ({
      id: chat.id._serialized,
      name: chat.name || extractNameFromJid(chat.id._serialized),
      type: 'personal',
      phone: chat.id._serialized.replace('@c.us', '').replace('@s.whatsapp.net', ''),
      isArchived: chat.archived,
      isPinned: chat.pinned,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage?.body || 'No messages',
      timestamp: chat.timestamp ? new Date(chat.timestamp * 1000) : null,
    }))
    
    logger.info(`✅ Found ${groups.length} groups and ${personal.length} personal chats`)
    return { groups, personal, total: chats.length }
  } catch (error) {
    logger.error('Failed to fetch chats:', error)
    throw error
  }
}

/**
 * Get all groups the user is part of
 * @param {Object} socket - WhatsApp client instance
 * @returns {Promise<Array>} Array of group objects
 */
export async function getAllGroups(socket) {
  try {
    logger.info('📋 Fetching all groups...')
    
    const chats = await getAllChatsWithRetry(socket)
    const groups = chats.filter(chat => chat.isGroup)
    
    const groupList = groups.map(group => ({
      id: group.id._serialized,
      name: group.name || 'Unknown Group',
      participantCount: group.participants?.length || 0,
      isArchived: group.archived,
      isPinned: group.pinned,
      unreadCount: group.unreadCount,
      lastMessage: group.lastMessage?.body || 'No messages',
      timestamp: group.timestamp ? new Date(group.timestamp * 1000) : null,
    }))
    
    logger.info(`✅ Found ${groupList.length} groups`)
    return groupList
  } catch (error) {
    logger.error('Failed to fetch groups:', error)
    throw error
  }
}

/**
 * Get all messages from a specific group
 * @param {Object} socket - WhatsApp client instance
 * @param {string} groupId - Group ID
 * @param {number} limit - Maximum number of messages to fetch (default 100)
 * @returns {Promise<Array>} Array of message objects
 */
export async function getGroupMessages(socket, groupId, limit = 100) {
  try {
    logger.info(`📨 Fetching messages from group ${groupId}...`)
    
    const chat = await getChatWithRetry(socket, groupId)
    const messages = await fetchMessagesWithRetry(chat, limit)
    
    const messageList = messages.map(msg => ({
      id: msg.id.id,
      sender: msg.author || msg.from,
      senderName: msg.from ? extractNameFromJid(msg.from) : 'Unknown',
      text: msg.body,
      timestamp: new Date(msg.timestamp * 1000),
      isGroupMsg: msg.isGroupMsg,
      isFromMe: msg.fromMe,
      type: msg.type,
      hasQuotedMsg: msg.hasQuotedMsg,
      reactions: msg.reactions?.length || 0,
    }))
    
    logger.info(`✅ Fetched ${messageList.length} messages from group`)
    return messageList
  } catch (error) {
    logger.error('Failed to fetch group messages:', error)
    throw error
  }
}

/**
 * Get all messages from all groups
 * @param {Object} socket - WhatsApp client instance
 * @param {number} messagesPerGroup - Messages to fetch per group (default 50)
 * @returns {Promise<Object>} Object with groups as keys and messages as values
 */
export async function getAllGroupMessages(socket, messagesPerGroup = 50) {
  try {
    logger.info('📨 Fetching messages from all groups...')
    
    const groups = await getAllGroups(socket)
    const allMessages = {}
    
    for (const group of groups) {
      try {
        const messages = await getGroupMessages(socket, group.id, messagesPerGroup)
        allMessages[group.name] = {
          groupId: group.id,
          groupName: group.name,
          participantCount: group.participantCount,
          messageCount: messages.length,
          messages: messages,
        }
        logger.info(`✅ Loaded ${messages.length} messages from "${group.name}"`)
      } catch (error) {
        logger.warn(`⚠️ Failed to fetch messages from "${group.name}":`, error.message)
        allMessages[group.name] = {
          groupId: group.id,
          groupName: group.name,
          error: error.message,
        }
      }
    }
    
    logger.info(`✅ Fetched messages from ${Object.keys(allMessages).length} groups`)
    return allMessages
  } catch (error) {
    logger.error('Failed to fetch all group messages:', error)
    throw error
  }
}

/**
 * Get all personal chats (direct messages)
 * @param {Object} socket - WhatsApp client instance
 * @returns {Promise<Array>} Array of personal chat objects
 */
export async function getAllPersonalChats(socket) {
  try {
    logger.info('📋 Fetching all personal chats...')
    
    const chats = await getAllChatsWithRetry(socket)
    const personal = chats.filter(chat => !chat.isGroup)
    
    const personalList = personal.map(chat => ({
      id: chat.id._serialized,
      name: chat.name || extractNameFromJid(chat.id._serialized),
      phone: chat.id._serialized.replace('@c.us', '').replace('@s.whatsapp.net', ''),
      isArchived: chat.archived,
      isPinned: chat.pinned,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage?.body || 'No messages',
      timestamp: chat.timestamp ? new Date(chat.timestamp * 1000) : null,
    }))
    
    logger.info(`✅ Found ${personalList.length} personal chats`)
    return personalList
  } catch (error) {
    logger.error('Failed to fetch personal chats:', error)
    throw error
  }
}

/**
 * Get messages from a personal chat
 * @param {Object} socket - WhatsApp client instance
 * @param {string} contactId - Contact ID or phone number
 * @param {number} limit - Maximum number of messages to fetch
 * @returns {Promise<Array>} Array of message objects
 */
export async function getPersonalMessages(socket, contactId, limit = 100) {
  try {
    logger.info(`📨 Fetching personal messages with ${contactId}...`)
    
    // Ensure proper chat ID format
    let chatId = contactId
    if (!chatId.includes('@')) {
      chatId = `${contactId}@c.us`
    }
    
    const chat = await getChatWithRetry(socket, chatId)
    const messages = await fetchMessagesWithRetry(chat, limit)
    
    const messageList = messages.map(msg => ({
      id: msg.id.id,
      sender: msg.author || msg.from,
      senderName: msg.from ? extractNameFromJid(msg.from) : 'Unknown',
      senderPhone: msg.from ? msg.from.replace('@c.us', '').replace('@s.whatsapp.net', '') : 'Unknown',
      text: msg.body,
      timestamp: new Date(msg.timestamp * 1000),
      isFromMe: msg.fromMe,
      type: msg.type,
      hasMedia: msg.hasMedia,
      mediaType: msg.type === 'chat' ? null : msg.type,
      hasQuotedMsg: msg.hasQuotedMsg,
      reactions: msg.reactions?.length || 0,
    }))
    
    logger.info(`✅ Fetched ${messageList.length} messages from personal chat`)
    return messageList
  } catch (error) {
    logger.error('Failed to fetch personal messages:', error)
    throw error
  }
}

/**
 * Get messages from all personal chats
 * @param {Object} socket - WhatsApp client instance
 * @param {number} messagesPerChat - Messages to fetch per chat
 * @returns {Promise<Object>} Object with contact names as keys and messages as values
 */
export async function getAllPersonalMessages(socket, messagesPerChat = 50) {
  try {
    logger.info('📨 Fetching messages from all personal chats...')
    
    const personalChats = await getAllPersonalChats(socket)
    const allMessages = {}
    
    for (const chat of personalChats) {
      try {
        const messages = await getPersonalMessages(socket, chat.id, messagesPerChat)
        allMessages[chat.name] = {
          contactId: chat.id,
          contactName: chat.name,
          phone: chat.phone,
          messageCount: messages.length,
          messages: messages,
        }
        logger.info(`✅ Loaded ${messages.length} messages from "${chat.name}"`)
      } catch (error) {
        logger.warn(`⚠️ Failed to fetch messages from "${chat.name}":`, error.message)
        allMessages[chat.name] = {
          contactId: chat.id,
          contactName: chat.name,
          error: error.message,
        }
      }
    }
    
    logger.info(`✅ Fetched messages from ${Object.keys(allMessages).length} personal chats`)
    return allMessages
  } catch (error) {
    logger.error('Failed to fetch all personal messages:', error)
    throw error
  }
}

/**
 * Search messages in a personal chat
 * @param {Object} socket - WhatsApp client instance
 * @param {string} contactId - Contact ID or phone number
 * @param {string} searchText - Text to search for
 * @param {number} limit - Maximum messages to search through
 * @returns {Promise<Array>} Filtered messages matching search
 */
export async function searchPersonalMessages(socket, contactId, searchText, limit = 200) {
  try {
    logger.info(`🔍 Searching for "${searchText}" in personal chat with ${contactId}...`)
    
    const messages = await getPersonalMessages(socket, contactId, limit)
    const filtered = messages.filter(msg => 
      msg.text.toLowerCase().includes(searchText.toLowerCase())
    )
    
    logger.info(`✅ Found ${filtered.length} messages matching "${searchText}"`)
    return filtered
  } catch (error) {
    logger.error('Failed to search personal messages:', error)
    throw error
  }
}

/**
 * Get all messages (both groups and personal) combined
 * @param {Object} socket - WhatsApp client instance
 * @param {number} limit - Messages to fetch per chat
 * @returns {Promise<Object>} Combined groups and personal messages
 */
export async function getAllMessages(socket, limit = 50) {
  try {
    logger.info('📨 Fetching all messages (groups + personal)...')
    
    const groupMessages = await getAllGroupMessages(socket, limit)
    const personalMessages = await getAllPersonalMessages(socket, limit)
    
    return {
      groups: groupMessages,
      personal: personalMessages,
    }
  } catch (error) {
    logger.error('Failed to fetch all messages:', error)
    throw error
  }
}

/**
 * Get detailed information about a specific group
 * @param {Object} socket - WhatsApp client instance
 * @param {string} groupId - Group ID
 * @returns {Promise<Object>} Detailed group information
 */
export async function getGroupInfo(socket, groupId) {
  try {
    logger.info(`📋 Fetching group info for ${groupId}...`)
    
    const chat = await getChatWithRetry(socket, groupId)
    const groupMetadata = await chat.getGroupInviteLink().catch(() => null)
    
    const participants = chat.participants?.map(p => ({
      id: p.id._serialized,
      name: p.name || extractNameFromJid(p.id._serialized),
      isAdmin: p.isAdmin,
      isSuperAdmin: p.isSuperAdmin,
    })) || []
    
    const groupInfo = {
      id: chat.id._serialized,
      name: chat.name || 'Unknown Group',
      description: chat.description || 'No description',
      participantCount: participants.length,
      participants: participants,
      createdAt: chat.createdAt ? new Date(chat.createdAt * 1000) : null,
      inviteLink: groupMetadata || null,
      archived: chat.archived,
      pinned: chat.pinned,
      muteExpiration: chat.muteExpiration,
    }
    
    logger.info(`✅ Fetched info for group: ${groupInfo.name}`)
    return groupInfo
  } catch (error) {
    logger.error('Failed to fetch group info:', error)
    throw error
  }
}

/**
 * Search messages in a group
 * @param {Object} socket - WhatsApp client instance
 * @param {string} groupId - Group ID
 * @param {string} searchText - Text to search for
 * @param {number} limit - Maximum messages to search through
 * @returns {Promise<Array>} Filtered messages matching search
 */
export async function searchGroupMessages(socket, groupId, searchText, limit = 200) {
  try {
    logger.info(`🔍 Searching for "${searchText}" in group ${groupId}...`)
    
    const messages = await getGroupMessages(socket, groupId, limit)
    const filtered = messages.filter(msg => 
      msg.text.toLowerCase().includes(searchText.toLowerCase())
    )
    
    logger.info(`✅ Found ${filtered.length} messages matching "${searchText}"`)
    return filtered
  } catch (error) {
    logger.error('Failed to search group messages:', error)
    throw error
  }
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
  
  // For user JIDs, remove @s.whatsapp.net or @c.us
  return jid.replace(/@[a-z.]+$/, '')
}

/**
 * Format group info for display
 * @param {Array} groups - Array of group objects
 * @returns {string} Formatted string
 */
export function formatGroupsForDisplay(groups) {
  let output = '📋 YOUR WHATSAPP GROUPS\n'
  output += '═'.repeat(70) + '\n\n'
  
  groups.forEach((group, index) => {
    output += `${index + 1}. 👥 ${group.name}\n`
    output += `   ├─ ID: ${group.id}\n`
    output += `   ├─ Members: ${group.participantCount}\n`
    output += `   ├─ Unread: ${group.unreadCount} new messages\n`
    output += `   ├─ Last Update: ${group.timestamp?.toLocaleString() || 'N/A'}\n`
    output += `   └─ Status: ${group.isArchived ? '📦 Archived' : '✅ Active'}\n\n`
  })
  
  return output
}

/**
 * Format messages for display with better structure
 * @param {Array} messages - Array of message objects
 * @param {string} title - Optional title for the message group
 * @returns {string} Formatted string
 */
export function formatMessagesForDisplay(messages, title = '💬 Messages') {
  let output = title + '\n'
  output += '═'.repeat(70) + '\n\n'
  
  if (!messages || messages.length === 0) {
    output += 'No messages found.\n'
    return output
  }
  
  messages.forEach((msg, idx) => {
    const time = new Date(msg.timestamp).toLocaleTimeString()
    const date = new Date(msg.timestamp).toLocaleDateString()
    const sender = msg.senderName || msg.sender || 'Unknown'
    const marker = msg.isFromMe ? '📤' : '📥'
    
    output += `[${date} ${time}] ${marker} ${sender}\n`
    output += '─'.repeat(70) + '\n'
    output += `${msg.text}\n\n`
  })
  
  return output
}

/**
 * Format personal chats for display
 * @param {Array} chats - Array of personal chat objects
 * @returns {string} Formatted string
 */
export function formatPersonalChatsForDisplay(chats) {
  let output = '💬 YOUR PERSONAL CHATS\n'
  output += '═'.repeat(70) + '\n\n'
  
  if (!chats || chats.length === 0) {
    output += 'No personal chats found.\n'
    return output
  }
  
  chats.forEach((chat, index) => {
    output += `${index + 1}. 👤 ${chat.name}\n`
    output += `   ├─ Phone: ${chat.phone}\n`
    output += `   ├─ ID: ${chat.id}\n`
    output += `   ├─ Unread: ${chat.unreadCount} new messages\n`
    output += `   ├─ Last Message: ${chat.lastMessage?.substring(0, 40) || 'No messages'}${chat.lastMessage?.length > 40 ? '...' : ''}\n`
    output += `   ├─ Last Update: ${chat.timestamp?.toLocaleString() || 'N/A'}\n`
    output += `   └─ Status: ${chat.isArchived ? '📦 Archived' : '✅ Active'}\n\n`
  })
  
  return output
}

/**
 * Format group conversation (messages with sender context)
 * @param {string} groupName - Name of the group
 * @param {Array} messages - Array of message objects
 * @returns {string} Formatted conversation
 */
export function formatGroupConversation(groupName, messages) {
  let output = `👥 GROUP: ${groupName}\n`
  output += '═'.repeat(70) + '\n\n'
  
  if (!messages || messages.length === 0) {
    output += 'No messages in this group.\n'
    return output
  }
  
  messages.forEach((msg) => {
    const time = new Date(msg.timestamp).toLocaleTimeString()
    const date = new Date(msg.timestamp).toLocaleDateString()
    const sender = msg.senderName || msg.sender || 'Unknown'
    
    output += `[${date} ${time}]\n`
    output += `👤 ${sender}:\n`
    output += `   ${msg.text}\n`
    output += '─'.repeat(70) + '\n'
  })
  
  return output
}

/**
 * Format personal chat conversation
 * @param {string} contactName - Name of the contact
 * @param {Array} messages - Array of message objects
 * @returns {string} Formatted conversation
 */
export function formatPersonalConversation(contactName, messages) {
  let output = `💬 CHAT WITH: ${contactName}\n`
  output += '═'.repeat(70) + '\n\n'
  
  if (!messages || messages.length === 0) {
    output += 'No messages with this contact.\n'
    return output
  }
  
  messages.forEach((msg) => {
    const time = new Date(msg.timestamp).toLocaleTimeString()
    const date = new Date(msg.timestamp).toLocaleDateString()
    const marker = msg.isFromMe ? '📤 You' : `📥 ${msg.senderName || 'Them'}`
    
    output += `[${date} ${time}] ${marker}\n`
    output += `   ${msg.text}\n`
    output += '─'.repeat(70) + '\n'
  })
  
  return output
}

/**
 * Format search results
 * @param {string} searchQuery - The search query
 * @param {Array} results - Array of matching messages
 * @param {string} context - 'group' or 'personal'
 * @returns {string} Formatted search results
 */
export function formatSearchResults(searchQuery, results, context = 'group') {
  let output = `🔍 SEARCH RESULTS FOR: "${searchQuery}"\n`
  output += '═'.repeat(70) + '\n\n'
  output += `Found ${results.length} matching messages in ${context} chat(s)\n\n`
  
  if (!results || results.length === 0) {
    output += 'No messages found matching your search.\n'
    return output
  }
  
  results.forEach((msg, idx) => {
    const time = new Date(msg.timestamp).toLocaleTimeString()
    const date = new Date(msg.timestamp).toLocaleDateString()
    const sender = msg.senderName || msg.sender || 'Unknown'
    
    output += `${idx + 1}. [${date} ${time}] ${sender}\n`
    output += `   "${msg.text}"\n`
    output += '─'.repeat(70) + '\n'
  })
  
  return output
}
