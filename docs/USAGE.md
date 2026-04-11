# Usage Guide & Examples

## Table of Contents

1. [Quick Start](#quick-start)
2. [Example Workflows](#example-workflows)
3. [API Reference](#api-reference)
4. [Advanced Configuration](#advanced-configuration)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Initial Setup

```bash
# Clone repo (if not already done)
git clone <repo-url>
cd whatsapp-agent

# Install dependencies
npm install
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
```

### 2. Start Services

**Terminal 1 - Node.js**:
```bash
npm run dev
```

Expected output:
```
✅ Express server running on http://localhost:3000
🎯 WhatsApp Agent is ready!
📱 QR Code received - scan with WhatsApp to authenticate
```

**Terminal 2 - Python**:
```bash
source venv/bin/activate
python -m uvicorn python.main:app --reload --port 8000
```

Expected output:
```
ℹ️ Uvicorn running on http://0.0.0.0:8000
ℹ️ Application startup complete
```

### 3. Authenticate WhatsApp

When you see the QR code in Terminal 1:
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Scan the QR code
4. Confirm the authentication

You should see in Terminal 1:
```
✅ Successfully connected to WhatsApp
```

---

## Example Workflows

### Example 1: Long Message Summarization

**Scenario**: Your group is discussing a project deadline. Someone sends a long message.

**Message**:
```
Hey team! Just wanted to update everyone on the project status. 
We've completed the backend API endpoints, database schema is 
finalized, and frontend is 60% done. The mobile app needs another 
2 weeks. We're keeping the original deadline of May 15th. 
Please let me know if anyone has blockers. John, can you test 
the API endpoints? Sarah, we need the UI/UX mockups by EOW. 
Thanks!
```

**What Happens**:

1. **Message Captured**: `message-listener.js` detects the message
2. **Enqueued**: Added to processing queue
3. **Summarization Triggered**: Text > 500 chars
4. **Python Service Called**: 
   ```json
   POST http://localhost:8000/summarize
   {
     "text": "Hey team! Just wanted...",
     "max_length": 150,
     "min_length": 30
   }
   ```
5. **Response**:
   ```json
   {
     "summary": "Project status update: backend API complete, database finalized, 
                 frontend 60% done, mobile 2 weeks remaining. Deadline May 15th. 
                 John to test API, Sarah provides UI mockups by EOW.",
     "original_length": 423,
     "summary_length": 127
   }
   ```
6. **Stored**: Summary kept in memory for later digest

---

### Example 2: Mention Detection & Alert

**Scenario**: Someone mentions you specifically with an action item.

**Message**:
```
@John please confirm the deadline for the project review. 
It's very urgent! We need your approval ASAP by tomorrow EOD.
```

**What Happens**:

1. **Message Captured**: Listener extracts mentions: `["John"]`
2. **Enqueued**: Marked with mentions flag
3. **Mention Detection Called**:
   ```json
   POST http://localhost:8000/detect-mentions
   {
     "message_text": "@John please confirm...",
     "sender": "1122334455@s.whatsapp.net",
     "group_id": "120982309-1209@g.us"
   }
   ```
4. **Response**:
   ```json
   {
     "mentions": ["John"],
     "action_items": [
       "confirm the deadline for the project review",
       "approval needed by tomorrow EOD"
     ],
     "urgency": "high"
   }
   ```
5. **Alert Generated**:
   ```
   🔔 *You have a new alert*
   ⏰ *Time*: 3:45 PM
   👤 *From*: Team Lead
   💬 *Group*: Project Planning
   
   ━━━━━━━━━━━━━━━━━━━
   🔴 *HIGH PRIORITY*
   
   📌 *You were mentioned* by Team Lead
   
   ✅ *Action items*:
     • confirm the deadline for the project review
     • approval needed by tomorrow EOD
   ```
6. **Alert Sent**: Private DM to John with formatted alert
7. **Rate Limited**: John not alerted again for 5 minutes (configurable)

---

### Example 3: Keyword-Based Task Extraction

**Scenario**: Group discusses multiple tasks without explicit mentions.

**Message**:
```
Guys, we need to:
1. Review the budget spreadsheet - due Friday
2. Send invites for the standup meeting tomorrow
3. Confirm attendance for the conference next month (ASAP please)
This is critical for the Q2 planning.
```

**What Happens**:

1. **No @mentions**, but keywords detected: "critical", "ASAP", "due Friday"
2. **Detection Response**:
   ```json
   {
     "mentions": [],
     "action_items": [
       "Review the budget spreadsheet - due Friday",
       "Send invites for the standup meeting tomorrow",
       "Confirm attendance for the conference next month"
     ],
     "urgency": "high"
   }
   ```
3. **Alert Generated** to group admin/moderator with task list
4. **Optional**: Could integrate with Notion to store tasks (Phase 3)

---

### Example 4: End-to-End Message Processing

**Scenario**: Complex message requiring full pipeline.

**API Call**:
```bash
curl -X POST http://localhost:3000/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "@Alice and @Bob please review the new API design. Its quite comprehensive and covers all our requirements. The documentation is attached. Deadline is Friday EOD. This is critical for the release sprint. Let me know any concerns.",
    "sender": "5551234567@s.whatsapp.net",
    "group": "120982309-1209@g.us"
  }'
```

**Pipeline**:

```
1. Message Listener
   ├─ Mentions: ["Alice", "Bob"]
   └─ Text length: 321 chars

2. Orchestrator Queue
   ├─ Rate limit: OK
   └─ Enqueue for processing

3. Orchestrator Processing
   ├─ Summarization skip (< 500 chars)
   └─ Forward to mention detection

4. Python Service - Detect Mentions
   ├─ Extract: ["Alice", "Bob"]
   ├─ Actions: ["review the new API design", "EOD Friday"]
   └─ Urgency: "high"

5. Alert Generation
   ├─ Format alert with emoji
   ├─ Include action items
   └─ Send to Alice & Bob

6. Result
   ├─ Status: "processed"
   ├─ 2 alerts sent
   └─ Log entry created
```

**Logs**:
```
[INFO] 📨 Message received from 5551234567, mentions: ['Alice', 'Bob']
[DEBUG] Processing message: test-1712904123456
[INFO] Calling Python service: POST http://localhost:8000/detect-mentions
[INFO] Detection complete: 2 mentions, 2 actions, urgency=high
[INFO] ✅ Alert sent to alice@s.whatsapp.net
[INFO] ✅ Alert sent to bob@s.whatsapp.net
[INFO] ✅ Message processed successfully
```

---

## API Reference

### Node.js Endpoints

#### `/health` - Health Check

```bash
curl http://localhost:3000/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-04-11T15:30:45.123Z",
  "uptime": 1234.567
}
```

#### `/stats` - Queue Statistics

```bash
curl http://localhost:3000/stats
```

**Response**:
```json
{
  "queueSize": 5,
  "isProcessing": true,
  "pythonServiceUrl": "http://localhost:8000",
  "timestamp": "2024-04-11T15:30:45.123Z"
}
```

#### `/test-message` - Send Test Message

```bash
curl -X POST http://localhost:3000/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your message here",
    "sender": "1234567890@s.whatsapp.net",
    "group": "120982309-1209@g.us"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "Test message queued for processing",
  "messageId": "test-1712904123456"
}
```

### Python Endpoints

#### `GET /health` - Service Health

```bash
curl http://localhost:8000/health
```

**Response**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "models_loaded": {
    "summarizer": true,
    "mention_detector": true
  }
}
```

#### `POST /summarize` - Summarize Text

```bash
curl -X POST http://localhost:8000/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your long text here...",
    "max_length": 150,
    "min_length": 30
  }'
```

**Response**:
```json
{
  "summary": "Summarized version of text",
  "original_length": 500,
  "summary_length": 75
}
```

#### `POST /detect-mentions` - Detect Mentions & Tasks

```bash
curl -X POST http://localhost:8000/detect-mentions \
  -H "Content-Type: application/json" \
  -d '{
    "message_text": "@John please review this",
    "sender": "1234567890@s.whatsapp.net",
    "group_id": "120982309-1209@g.us"
  }'
```

**Response**:
```json
{
  "mentions": ["John"],
  "action_items": ["review this"],
  "urgency": "low"
}
```

#### `POST /generate-alert` - Generate Formatted Alert

```bash
curl -X POST http://localhost:8000/generate-alert \
  -H "Content-Type: application/json" \
  -d '{
    "message_text": "@John urgent: confirm deadline",
    "sender": "1234567890@s.whatsapp.net",
    "group_id": "120982309-1209@g.us",
    "mentions": ["John"]
  }'
```

**Response**:
```json
{
  "alert_text": "🔔 *You have a new alert*\n...",
  "mentioned_action": "confirm deadline",
  "should_alert": true
}
```

#### Interactive API Docs

Visit `http://localhost:8000/docs` for Swagger UI with interactive testing.

---

## Advanced Configuration

### 1. Adjusting Rate Limits

**File**: `.env`
```env
BAILEY_RATE_LIMIT_MS=100
MESSAGE_QUEUE_PROCESSING_DELAY=100
```

**Effect**: Controls how fast messages are processed. Lower = faster but more resource-intensive.

### 2. Custom Summarization Parameters

**File**: `.env`
```env
SUMMARIZATION_MIN_LENGTH=50
SUMMARIZATION_MAX_LENGTH=200
```

**API Override**:
```bash
curl -X POST http://localhost:8000/summarize \
  -d '{
    "text": "...",
    "max_length": 200,
    "min_length": 50
  }'
```

###  3. Alert Cooldown Management

**File**: `.env`
```env
ALERT_COOLDOWN_MINUTES=5
```

**Manual Clear** (admin):
```bash
# Via API (to be added)
POST http://localhost:3000/admin/clear-alert-history
{
  "user_jid": "john@s.whatsapp.net"
}
```

### 4. GPU Acceleration

If you have NVIDIA GPU:

```env
USE_GPU=1
```

This speeds up summarization ~3-5x but requires CUDA & PyTorch GPU support.

### 5. Custom Model Selection

**File**: `.env`
```env
SUMMARIZER_MODEL=facebook/bart-large-cnn
# Or use distilbart for faster inference:
# facebook/bart-large-cnn-12-6
```

**Supported Models**:
- `facebook/bart-large-cnn` (default, best quality)
- `facebook/bart-large-cnn-12-6` (faster, smaller)
- `google/pegasus-cnn_dailymail` (alternative, slower)

---

## Troubleshooting

### Problem: QR Code Not Showing

**Symptoms**: No QR code appears, stuck at "Initializing..."

**Solution**:
```bash
# Clear Bailey cache
rm -rf auth_info_baileys/

# Restart Node.js
npm run dev
```

### Problem: Python Service Connection Refused

**Symptoms**: 
```
❌ Python service is unavailable (connection refused)
```

**Solution**:
```bash
# Check Python service is running on port 8000
curl http://localhost:8000/health

# If not running, start it:
python -m uvicorn python.main:app --reload --port 8000

# If already running, check port conflict:
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows
```

### Problem: Messages Not Being Processed

**Symptoms**: Messages arrive but no logs, no summaries

**Solution**:
1. Check Node.js health:
   ```bash
   curl http://localhost:3000/health
   ```

2. Check queue status:
   ```bash
   curl http://localhost:3000/stats
   ```

3. Look at logs:
   ```bash
   tail -f logs/combined.log | grep -i error
   ```

4. Ensure both services are connected:
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:8000/health
   ```

### Problem: High CPU Usage

**Symptoms**: Node.js or Python process using 100%+ CPU

**Solution**:
- Increase `MESSAGE_QUEUE_PROCESSING_DELAY` in `.env` (default 100ms)
- Reduce model batch size in Python service
- Disable GPU if running on unsupported hardware

### Problem: Out of Memory

**Symptoms**: Process crashes with "ENOMEM" or "MemoryError"

**Solution**:
- Lower model: Use distilbert instead of bart-large-cnn
- Increase node heap: `node --max-old-space-size=4096 src/index.js`
- Restart periodically: Use process manager like PM2

### Problem: Alert Not Sending

**Symptoms**: Alert generated but not received in WhatsApp

**Solution**:
1. Verify WhatsApp connection:
   ```bash
   # Send test message manually
   curl -X POST http://localhost:3000/test-message \
     -d '{"text":"test","sender":"admin@s.whatsapp.net"}'
   ```

2. Check alert rate limiting:
   ```bash
   # Query alert status (to be implemented)
   curl http://localhost:3000/admin/alert-status?user=john@s.whatsapp.net
   ```

3. Review logs:
   ```bash
   tail -f logs/combined.log | grep -i alert
   ```

---

## Next Steps

- **Phase 2**: Full summarization pipeline, scheduled digests
- **Phase 3**: Google Calendar, Notion, Trello integrations
- **Advanced**: Deploy to cloud, add web dashboard

For detailed architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

**Last Updated**: April 2024
**Status**: Phase 1 ✅ Production Ready
