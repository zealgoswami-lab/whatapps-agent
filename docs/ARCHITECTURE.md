# Architecture & Design

## System Overview

The WhatsApp AI Agent is a **multi-language event-driven system** that integrates:

1. **Bailey** (Node.js) - WhatsApp message capture & real-time event handling
2. **Agno-like Orchestrator** (Python) - Multi-step workflow management
3. **Lightweight LLMs** (DistilBART, Keyword NER) - Summarization & analysis

## Data Flow

```
User's WhatsApp
      │
      │ (QR Code Auth)
      ▼
┌─────────────────────────────────────┐
│  Bailey WhatsApp Socket             │
│  (Node.js, Port 3000)               │
│                                     │
│  ├─ on('connection.update')        │
│  ├─ on('messages.upsert')          │
│  └─ sendMessage()                  │
└────────────┬────────────────────────┘
             │
             │ Socket Discovery
             │ (message event)
             ▼
┌─────────────────────────────────────┐
│  Message Listener                   │
│  (message-listener.js)              │
│                                     │
│  ├─ Validate message                │
│  ├─ Extract metadata                │
│  ├─ Detect mentions                 │
│  └─ Enqueue for processing          │
└────────────┬────────────────────────┘
             │
             │ Prepared Message Object
             │ {jid, sender, text, mentions}
             ▼
┌─────────────────────────────────────┐
│  Orchestrator Queue                 │
│  (orchestrator.js)                  │
│                                     │
│  ├─ Rate limiting (200ms)           │
│  ├─ Retry logic (3 attempts)        │
│  └─ Dequeue & process               │
└────────────┬────────────────────────┘
             │
             │ HTTP POST with timeout
             │ (30 seconds)
             ▼
┌───────────────────────────────────────┐
│  Python FastAPI Service               │
│  (Port 8000)                          │
│                                       │
│  ├─ POST /process-message             │
│  ├─ POST /summarize                   │
│  ├─ POST /detect-mentions             │
│  └─ POST /generate-alert              │
└────────────┬────────────────────────┬─┘
             │                        │
             ▼                        ▼
    ┌──────────────────┐    ┌──────────────────┐
    │  Summarizer      │    │ Mention Detector │
    │  (DistilBART)    │    │  (Keyword NER)   │
    │                  │    │                  │
    │  • Tokenize      │    │  • @mention regex│
    │  • Generate sum. │    │  • Keyword match │
    │  • Return text   │    │  • Urgency class │
    └────────┬─────────┘    └────────┬─────────┘
             │                       │
             └───────────┬───────────┘
                         │
                         │ Results with alerts
                         ▼
        ┌────────────────────────────────┐
        │  Alert Aggregation             │
        │  (Python orchestrator)         │
        │                                │
        │  ├─ Format alert text          │
        │  ├─ Determine priority         │
        │  └─ Return to Node.js          │
        └────────────┬───────────────────┘
                     │
                     │ JSON Response
                     │ {summary, mentions, alert}
                     ▼
        ┌────────────────────────────────┐
        │  Alert Sender                  │
        │  (alert-sender.js)             │
        │                                │
        │  ├─ Rate limit check           │
        │  ├─ Format message             │
        │  └─ Send via Bailey socket     │
        └────────────┬───────────────────┘
                     │
                     │ Private DM to user
                     ▼
               User receives alert
```

## Component Breakdown

### 1. Node.js Layer (Message Capture)

**Files**: `src/index.js`, `src/whatsapp-session.js`, `src/message-listener.js`

**Responsibilities**:
- Maintain Bailey WebSocket connection
- Handle QR code authentication
- Listen for real-time message events
- Filter & preprocess messages
- Queue messages for orchestrator
- Send private alerts back to users

**Technologies**: Express, Bailey (@whiskeysockets), Winston logging

### 2. Python Layer (Orchestration & NLP)

**Files**: `python/main.py`, `python/orchestrator.py`

**Responsibilities**:
- Expose FastAPI endpoints for Node.js to call
- Initialize Agno-like agent workflows
- Route requests to appropriate ML models
- Aggregate results
- Return structured responses

**Technologies**: FastAPI, Pydantic, Agno (TBD)

### 3. ML/NLP Pipeline

**Summarizer** (`python/models/summarizer.py`):
- Uses `facebook/bart-large-cnn` via Hugging Face
- Runs in-process (no external API)
- Handles token length limits
- Graceful fallback on errors

**Mention Detector** (`python/models/mention_detector.py`):
- Regex-based @mention extraction
- Keyword-based action item detection
- Urgency classification (low/medium/high)
- Thread-safe batch processing

## Key Design Decisions

### 1. Multi-Language Architecture

**Why Node.js + Python?**
- Bailey (WhatsApp integration) is Node.js-only
- Agno (orchestration) is Python-only
- Separation of concerns: message handling vs. ML processing

**Trade-off**: Slightly higher complexity, but clean architecture boundaries

### 2. Event-Driven Message Processing

**Why not polling?**
- Polling = unnecessary latency and overhead
- Event listening = real-time, responsive system
- Bailey's native socket events perfectly suited

**Implementation**: Bailey emits `messages.upsert` → Node.js handler → Python service

### 3. Asynchronous Queuing

**Why queue instead of processing synchronously?**
- WhatsApp rate limits (100-500ms per message)
- Python service may have variable latency (models, external APIs)
- Need to prevent message loss on service downtime

**Implementation**: In-memory queue with periodic dequeue, retry logic with exponential backoff

### 4. In-Memory State (Phase 1)

**Why not database yet?**
- Faster development & simpler deployment
- Sufficient for MVP/testing
- Data loss on restart is acceptable for development

**Future**: Migrate to SQLite (local), PostgreSQL (cloud)

### 5. Synchronous API Calls (Python)

**Why not async?**
- Simpler implementation
- Sufficient throughput for typical group chat volume
- Avoids asyncio complexity in Phase 1

**Future**: Upgrade to async FastAPI handlers if needed

## Rate Limiting & Backpressure

```
WhatsApp → Bailey (event)
    │
    └─→ Message Listener (immediate)
           │
           └─→ Orchestrator Queue
                  │
                  └─→ Rate Limiter (100-500ms between items)
                         │
                         └─→ Python Service Call (30s timeout)
                                │
                                ├─→ Success: Alert Sender
                                └─→ Timeout: Retry (max 3x)
                                   │
                                   └─→ Fail: Drop & log
```

## Error Handling

### At Each Stage

1. **Message Listener**: Skip invalid/empty messages silently
2. **Orchestrator Queue**: Retry 3x with exponential backoff
3. **Python Service**: HTTP error responses with status codes
4. **Alert Sender**: Rate limiting prevents spam, logs failures

### Graceful Degradation

- Missing summarization → still send mention alerts
- Missing model → return original text/empty
- Python service down → queue messages until recovery
- Network failure → exponential backoff with jitter

## Security Considerations

### Phase 1 (Current)

- ✅ Credentials stored locally in `auth_info_baileys/`
- ✅ No database = no data persistence concerns
- ✅ Local-only APIs (no public exposure yet)

### Phase 3 (Future)

- [ ] Encrypt stored credentials
- [ ] Use environment variables for secrets
- [ ] Add authentication to Python service (API key / JWT)
- [ ] Implement rate limiting per user/group
- [ ] Add data retention policies

## Performance Characteristics

### Latency

- **Message capture**: < 100ms (Bailey event processing)
- **Summarization**: 500ms - 2s (model inference)
- **Mention detection**: 50ms (regex/keyword matching)
- **Alert sending**: 200ms (Bailey socket)
- **Total E2E**: 1-3 seconds typical

### Throughput

- **Messages/second**: ~5-10 (single Python process)
- **Concurrent groups**: Unlimited (event-driven)
- **Queue depth**: Tested up to 100 messages

### Resource Usage

- **Node.js**: ~50-100MB RAM
- **Python (with models)**: ~1-2GB RAM (first load), ~500MB after
- **Disk**: ~2GB for downloaded models
- **Network**: <1Mbps typical traffic

## Deployment Topology

### Local Development (Current)
```
├─ Terminal 1: node src/index.js (Port 3000)
├─ Terminal 2: uvicorn python.main:app (Port 8000)
└─ Browser: http://localhost:3000/stats
```

### Docker Compose (Phase 2)
```yaml
services:
  node:
    image: node:18-alpine
    ports: [3000:3000]
  python:
    image: python:3.10-slim
    ports: [8000:8000]
  redis:  # For persistent queue
    image: redis:7-alpine
```

### Cloud / Kubernetes (Phase 3)
```
whatsapp-agent-node:
  replicas: 1  # Only one can maintain session
  port: 3000
  
whatsapp-agent-python:
  replicas: 2-3  # Scale horizontally
  port: 8000
  
whatsapp-agent-redis:
  replicas: 1  # Shared message queue
  
whatsapp-agent-postgres:
  replicas: 1  # Persisted state
```

## Future Enhancements

1. **Distributed Queue** (Redis/RabbitMQ)
   - Handle multiple Node.js instances
   - Persist queue across restarts

2. **Caching** (Redis)
   - Cache model responses
   - Cache recently summarized conversations

3. **Database** (PostgreSQL)
   - Store message history
   - Track user preferences
   - Audit logs

4. **Real-time Notifications**
   - WebSocket push to dashboard
   - Server-sent events for alerting

5. **Analytics**
   - Track which types of messages -> alerts
   - Measure summarization accuracy
   - User engagement metrics

---

**Last Updated**: April 2026
**Status**: Phase 1 ✅ | Phase 2 🔄 | Phase 3 📋
