"""
Summarization model for WhatsApp Agent
Uses DistilBART via Hugging Face transformers
"""

import logging
import os

logger = logging.getLogger(__name__)

# Lazy-load the transformer model
_summarizer = None

def get_summarizer():
    """
    Lazily load and cache the summarization model
    """
    global _summarizer
    
    if _summarizer is None:
        try:
            logger.info('📦 Loading DistilBART summarization model...')
            
            # Import here to avoid loading transformer at module level
            try:
                from transformers import pipeline
            except ImportError:
                logger.error('❌ transformers library not found. Install: pip install transformers torch')
                raise
            
            # Load DistilBART model
            # Using the smaller Xenova/distilbart-cnn-6-6 for faster inference
            _summarizer = pipeline(
                'summarization',
                model='facebook/bart-large-cnn',
                device=0 if os.getenv('USE_GPU', '0') == '1' else -1  # -1 for CPU
            )
            
            logger.info('✅ DistilBART model loaded successfully')
        
        except Exception as e:
            logger.error(f'❌ Failed to load summarizer: {str(e)}')
            raise
    
    return _summarizer

def summarize_text(text: str, max_length: int = 150, min_length: int = 30) -> str:
    """
    Summarize long text using DistilBART
    
    Args:
        text: Text to summarize
        max_length: Maximum length of summary in tokens
        min_length: Minimum length of summary in tokens
    
    Returns:
        Summarized text
    
    Raises:
        ValueError: If text is too short or other validation errors
    """
    try:
        # Validate input
        text = text.strip()
        if not text:
            raise ValueError('Empty text provided')
        
        if len(text) < 100:
            logger.warn('Text too short for effective summarization, returning as-is')
            return text
        
        # Get summarizer model
        summarizer = get_summarizer()
        
        # Preprocess: split very long texts into chunks
        # BART has token limit of 1024
        words = text.split()
        
        if len(words) > 200:  # Approximate token limit
            logger.debug(f'Text too long ({len(words)} words), splitting into chunks')
            # Take first N words as representative chunk
            text_chunk = ' '.join(words[:200])
        else:
            text_chunk = text
        
        # Generate summary
        logger.debug(f'Summarizing text ({len(text_chunk)} chars)...')
        
        result = summarizer(
            text_chunk,
            max_length=max_length,
            min_length=min_length,
            do_sample=False
        )
        
        if not result or len(result) == 0:
            logger.warn('Summarizer returned empty result')
            return text[:max_length]
        
        summary = result[0]['summary_text']
        
        logger.info(f'✅ Summary generated ({len(summary)} chars)')
        return summary
    
    except Exception as e:
        logger.error(f'Error during summarization: {str(e)}')
        # Fallback: return first N characters of text
        logger.warn(f'Returning truncated text as fallback')
        return text[:max_length]

def batch_summarize(texts: list, max_length: int = 150, min_length: int = 30) -> list:
    """
    Summarize multiple texts efficiently
    
    Args:
        texts: List of texts to summarize
        max_length: Maximum length per summary
        min_length: Minimum length per summary
    
    Returns:
        List of summaries
    """
    try:
        summarizer = get_summarizer()
        summaries = []
        
        logger.info(f'Batch summarizing {len(texts)} texts...')
        
        # Process in batches for efficiency
        batch_size = 4
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            
            results = summarizer(
                batch,
                max_length=max_length,
                min_length=min_length,
                do_sample=False,
                batch_size=batch_size
            )
            
            summaries.extend([r['summary_text'] for r in results])
        
        logger.info(f'✅ Batch summarization complete ({len(summaries)} summaries)')
        return summaries
    
    except Exception as e:
        logger.error(f'Error during batch summarization: {str(e)}')
        # Fallback: return original texts
        return texts
