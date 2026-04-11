"""
FastAPI service for WhatsApp Agent orchestration
Handles summarization, mention detection, and alert generation
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

# Import orchestrator modules
from python.orchestrator import initialize_orchestrator
from python.models.summarizer import summarize_text
from python.models.mention_detector import detect_mentions_and_tasks

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class SummarizeRequest(BaseModel):
    text: str
    max_length: int = 150
    min_length: int = 30

class SummarizeResponse(BaseModel):
    summary: str
    original_length: int
    summary_length: int

class MentionDetectionRequest(BaseModel):
    message_text: str
    sender: str
    group_id: str

class MentionDetectionResponse(BaseModel):
    mentions: list[str]
    action_items: list[str]
    urgency: str  # 'low', 'medium', 'high'

class AlertGenerationRequest(BaseModel):
    message_text: str
    sender: str
    group_id: str
    mentions: list[str] = []

class AlertGenerationResponse(BaseModel):
    alert_text: str
    mentioned_action: str = None
    should_alert: bool

class HealthResponse(BaseModel):
    status: str
    version: str = "1.0.0"
    models_loaded: dict

# ============================================================================
# GLOBAL STATE
# ============================================================================

models_state = {
    'summarizer': None,
    'mention_detector': None,
    'initialized': False,
}

# ============================================================================
# LIFESPAN CONTEXT
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown logic
    """
    # Startup
    logger.info('🚀 FastAPI service starting...')
    try:
        logger.info('📦 Initializing orchestrator and loading models...')
        initialize_orchestrator()
        models_state['initialized'] = True
        logger.info('✅ Orchestrator initialized successfully')
    except Exception as e:
        logger.error(f'❌ Failed to initialize orchestrator: {str(e)}')
        models_state['initialized'] = False
    
    yield
    
    # Shutdown
    logger.info('⏹️ Shutting down FastAPI service...')

# ============================================================================
# APP INITIALIZATION
# ============================================================================

app = FastAPI(
    title='WhatsApp Agent Orchestrator',
    description='Orchestration service for WhatsApp AI Agent (Phase 1-3)',
    version='1.0.0',
    lifespan=lifespan
)

# ============================================================================
# ROUTES
# ============================================================================

@app.get('/health', response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    """
    return HealthResponse(
        status='ok' if models_state['initialized'] else 'degraded',
        models_loaded={
            'summarizer': models_state['summarizer'] is not None,
            'mention_detector': models_state['mention_detector'] is not None,
        }
    )

@app.post('/summarize', response_model=SummarizeResponse)
async def summarize(request: SummarizeRequest):
    """
    Summarize a long text using DistilBART
    
    Args:
        text: Long text to summarize
        max_length: Maximum length of summary
        min_length: Minimum length of summary
    
    Returns:
        Summarized text with metadata
    """
    try:
        if len(request.text.strip()) < 100:
            raise HTTPException(
                status_code=400,
                detail='Text too short for summarization (minimum 100 characters)'
            )

        logger.debug(f'Summarizing text ({len(request.text)} chars)...')
        summary = summarize_text(
            request.text,
            max_length=request.max_length,
            min_length=request.min_length
        )

        logger.info(f'✅ Summarization complete ({len(summary)} chars)')
        return SummarizeResponse(
            summary=summary,
            original_length=len(request.text),
            summary_length=len(summary)
        )

    except Exception as e:
        logger.error(f'Error during summarization: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/detect-mentions', response_model=MentionDetectionResponse)
async def detect_mentions(request: MentionDetectionRequest):
    """
    Detect mentions and extract actionable tasks from a message
    
    Args:
        message_text: The message content
        sender: JID of message sender
        group_id: JID of group chat
    
    Returns:
        Detected mentions, action items, and urgency level
    """
    try:
        logger.debug(f'Detecting mentions in message from {request.sender}')
        
        mentions, actions, urgency = detect_mentions_and_tasks(request.message_text)

        logger.info(f'✅ Mentions detected: {len(mentions)}, Tasks: {len(actions)}, Urgency: {urgency}')
        return MentionDetectionResponse(
            mentions=mentions,
            action_items=actions,
            urgency=urgency
        )

    except Exception as e:
        logger.error(f'Error during mention detection: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/generate-alert', response_model=AlertGenerationResponse)
async def generate_alert(request: AlertGenerationRequest):
    """
    Generate an alert message for the user
    
    Args:
        message_text: Original message content
        sender: Sender JID
        group_id: Group JID
        mentions: List of mentions detected
    
    Returns:
        Formatted alert message and metadata
    """
    try:
        logger.debug(f'Generating alert for {request.group_id}')
        
        # Detect mentions and tasks
        mentions, actions, urgency = detect_mentions_and_tasks(request.message_text)

        # Format alert
        alert_parts = []
        
        if mentions:
            alert_parts.append(f'📌 *You were mentioned* by {request.sender.split("@")[0]}')
        
        if actions:
            alert_parts.append(f'\n✅ *Action items*:')
            for action in actions:
                alert_parts.append(f'  • {action}')
        
        if urgency == 'high':
            alert_parts.insert(0, '🔴 *HIGH PRIORITY*\n')

        alert_text = '\n'.join(alert_parts) if alert_parts else f'Message from {request.sender.split("@")[0]} in {request.group_id}'
        
        logger.info(f'✅ Alert generated (urgency: {urgency})')
        return AlertGenerationResponse(
            alert_text=alert_text,
            mentioned_action=actions[0] if actions else None,
            should_alert=len(mentions) > 0 or urgency in ['high', 'medium']
        )

    except Exception as e:
        logger.error(f'Error during alert generation: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/process-message')
async def process_message(request: dict):
    """
    Process a complete message (orchestrate all steps)
    
    Args:
        request: Message object with all fields
    
    Returns:
        Complete processing result
    """
    try:
        message_text = request.get('text', '')
        
        results = {
            'message_id': request.get('messageId'),
            'processed_at': str(__import__('datetime').datetime.now()),
            'summary': None,
            'mentions': [],
            'action_items': [],
            'alert': None,
        }

        # Summarize if long
        if len(message_text) > 500:
            summary = summarize_text(message_text)
            results['summary'] = summary

        # Detect mentions
        mentions, actions, urgency = detect_mentions_and_tasks(message_text)
        results['mentions'] = mentions
        results['action_items'] = actions

        # Generate alert if needed
        if mentions or urgency in ['high', 'medium']:
            alert_parts = []
            if mentions:
                alert_parts.append(f'You were mentioned: {", ".join(mentions)}')
            if actions:
                alert_parts.append(f'Action items: {", ".join(actions)}')
            results['alert'] = ' | '.join(alert_parts)

        logger.info(f'✅ Message processed: {results}')
        return results

    except Exception as e:
        logger.error(f'Error processing message: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# STARTUP EVENT (LEGACY - kept for compatibility)
# ============================================================================

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(
        app,
        host='0.0.0.0',
        port=int(os.getenv('PYTHON_PORT', 8000)),
        log_level='info'
    )
