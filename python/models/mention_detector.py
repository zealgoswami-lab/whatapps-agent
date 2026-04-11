"""
Mention and task detection for WhatsApp Agent
Extracts @mentions, action keywords, and determines urgency
"""

import logging
import re

logger = logging.getLogger(__name__)

# ============================================================================
# PATTERN DEFINITIONS
# ============================================================================

# Action keywords that indicate tasks
ACTION_KEYWORDS = {
    'high': [
        'urgent', 'asap', 'immediately', 'critical', 'emergency',
        'deadline', 'deadline:', 'due today', 'today', 'sos',
        'help needed', 'action required', 'confirm ASAP'
    ],
    'medium': [
        'confirm', 'verify', 'check', 'review', 'approve',
        'follow up', 'schedule', 'meeting', 'call', 'reach out',
        'please respond', 'waiting for', 'expecting'
    ],
    'low': [
        'suggestion', 'note', 'heads up', 'fyi', 'btw',
        'by the way', 'could you', 'would you', 'maybe'
    ]
}

# Extract action items by detecting common patterns
TASK_PATTERNS = [
    r'(?:confirm|verify|check|review|approve|send|create|update)\s+([^,\n.!?]*)',
    r'deadline:?\s*([^,\n.!?]*)',
    r'(?:due|submit|completed?|finish|deliver)\s+(?:by|on)?\s*([^,\n.!?]*)',
    r'please\s+([^,\n.!?]*?)(?:\s+(?:by|today|soon|asap))?[.!?]',
    r'@\w+\s+(?:please\s+)?([^,\n.!?]*)',
]

# ============================================================================
# MENTION EXTRACTION
# ============================================================================

def extract_mentions(text: str) -> list[str]:
    """
    Extract @mentions from WhatsApp message
    Handles WhatsApp mention format: @name
    
    Args:
        text: Message text
    
    Returns:
        List of mentioned usernames
    """
    try:
        # Match @username pattern
        # WhatsApp uses format like @John Doe or just @john
        mention_pattern = r'@([\w\s]+?)(?:\s|$|[.,!?])'
        mentions = re.findall(mention_pattern, text)
        
        # Clean and deduplicate
        mentions = list(set(m.strip() for m in mentions if m.strip()))
        
        logger.debug(f'Extracted {len(mentions)} mentions: {mentions}')
        return mentions
    
    except Exception as e:
        logger.error(f'Error extracting mentions: {str(e)}')
        return []

# ============================================================================
# ACTION ITEM EXTRACTION
# ============================================================================

def extract_action_items(text: str) -> list[str]:
    """
    Extract actionable tasks/items from message text
    
    Args:
        text: Message text
    
    Returns:
        List of identified action items
    """
    try:
        actions = []
        text_lower = text.lower()
        
        # Pattern-based extraction
        for pattern in TASK_PATTERNS:
            matches = re.findall(pattern, text_lower, re.IGNORECASE)
            for match in matches:
                action = match.strip()
                if action and len(action) > 3:
                    actions.append(action)
        
        # Sentence-based extraction for specific keywords
        sentences = re.split(r'[.!?]', text)
        
        for sentence in sentences:
            for keyword in ACTION_KEYWORDS['high'] + ACTION_KEYWORDS['medium']:
                if keyword in sentence.lower():
                    action = sentence.strip()
                    if action and len(action) > 5 and action not in actions:
                        actions.append(action)
                    break
        
        # Remove duplicates while preserving order
        seen = set()
        unique_actions = []
        for action in actions:
            if action not in seen:
                seen.add(action)
                unique_actions.append(action)
        
        logger.debug(f'Extracted {len(unique_actions)} action items')
        return unique_actions[:5]  # Return top 5 actions
    
    except Exception as e:
        logger.error(f'Error extracting action items: {str(e)}')
        return []

# ============================================================================
# URGENCY DETECTION
# ============================================================================

def determine_urgency(text: str, mentions: list[str]) -> str:
    """
    Determine urgency level of a message
    
    Args:
        text: Message text
        mentions: List of @mentions detected
    
    Returns:
        Urgency level: 'low', 'medium', or 'high'
    """
    try:
        text_lower = text.lower()
        
        # Check for high urgency keywords
        high_urgency_count = sum(1 for keyword in ACTION_KEYWORDS['high'] if keyword in text_lower)
        if high_urgency_count > 0:
            return 'high'
        
        # Check for medium urgency keywords
        medium_urgency_count = sum(1 for keyword in ACTION_KEYWORDS['medium'] if keyword in text_lower)
        if medium_urgency_count > 0:
            return 'medium'
        
        # If mentioned, at least medium urgency
        if mentions:
            return 'medium'
        
        # Check for all-caps (usually indicates urgency)
        uppercase_ratio = sum(1 for c in text if c.isupper()) / max(len(text), 1)
        if uppercase_ratio > 0.3:
            return 'high'
        
        return 'low'
    
    except Exception as e:
        logger.error(f'Error determining urgency: {str(e)}')
        return 'low'

# ============================================================================
# MAIN DETECTION FUNCTION
# ============================================================================

def detect_mentions_and_tasks(text: str) -> tuple[list[str], list[str], str]:
    """
    Comprehensive mention and task detection
    
    Args:
        text: Message text to analyze
    
    Returns:
        Tuple of (mentions, action_items, urgency_level)
    """
    try:
        logger.debug(f'Analyzing message ({len(text)} chars)...')
        
        mentions = extract_mentions(text)
        action_items = extract_action_items(text)
        urgency = determine_urgency(text, mentions)
        
        logger.info(f'Detection complete: {len(mentions)} mentions, {len(action_items)} actions, urgency={urgency}')
        
        return mentions, action_items, urgency
    
    except Exception as e:
        logger.error(f'Error in mention and task detection: {str(e)}')
        return [], [], 'low'

# ============================================================================
# BATCH DETECTION
# ============================================================================

def batch_detect_mentions(texts: list[str]) -> list[tuple[list[str], list[str], str]]:
    """
    Detect mentions and tasks from multiple messages
    
    Args:
        texts: List of message texts
    
    Returns:
        List of detection results
    """
    results = []
    for text in texts:
        result = detect_mentions_and_tasks(text)
        results.append(result)
    
    logger.info(f'Batch detection complete for {len(texts)} messages')
    return results
