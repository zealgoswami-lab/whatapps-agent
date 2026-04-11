# 📱 WhatsApp AI Agent

An AI agent that connects to WhatsApp via **Bailey** (QR code login), orchestrates analysis with **Agno**, and uses lightweight open-source models to **summarize group discussions** and **alert you when you need to reply**. and agentic application

## 🚀 Features

- ✅ Connects to WhatsApp using QR code (Bailey)
- ✅ Captures group messages in real time
- ✅ Summarizes discussions into concise digests
- ✅ Detects mentions and implicit responsibilities
- ✅ Extracts actionable tasks (e.g., deadlines, confirmations)
- ✅ Sends private WhatsApp alerts when you need to respond
- ✅ Provides daily/weekly summaries of group chats
- ✅ Optional integrations with Google Calendar, Notion, Trello (Phase 3)
- ✅ Runs locally or on cloud (Node.js + Python service)

## 📂 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WhatsApp (Cloud)                         │
└────────────────────────┬────────────────────────────────────┘
                         │ (QR Code Authentication)
                         │
                         ▼
        ┌────────────────────────────────────┐
        │   Bailey WhatsApp Connector         │
        │   (Node.js, Port 3000)              │
        │                                     │
        │  • QR Code Login                    │
        │  • Message Listener                 │
        │  • Alert Sending                    │
        └────────┬──────────────────────────┬─┘
                 │ HTTP/REST                │
                 │ (Message Processing)     │
                 ▼                          ▼
    ┌────────────────────────┐   ┌─────────────────────┐
    │  Python FastAPI        │   │   Orchestrator      │
    │  (Port 8000)           │   │   (Agno-like)       │
    │                        │   │                     │
    │  • API Endpoints       │   │  • Workflows        │
    │  • Request Router      │   │  • Agent Management │
    └────────┬───────────────┘   └─────────┬───────────┘
             │                             │
             ▼                             ▼
    ┌─────────────────────────────────────────────────┐
    │             ML/NLP Pipeline                      │
    │                                                  │
    │  ┌──────────────┐  ┌──────────────────┐        │
    │  │ Summarizer   │  │ Mention Detector │        │
    │  │ (DistilBART) │  │  (Keyword NER)   │        │
    │  └──────────────┘  └──────────────────┘        │
    │        ↓                     ↓                   │
    │    Summary Output      Mentions + Tasks         │
    └─────────────────────────────────────────────────┘
```

## 🏗️ Project Structure

```
whatsapp-agent/
├── src/
│   ├── index.js                 # Application entry point
│   ├── whatsapp-session.js      # Bailey initialization & session mgmt
│   ├── message-listener.js      # Incoming message handler
│   ├── orchestrator.js          # Node.js ↔ Python bridge
│   ├── alert-sender.js          # Private alert dispatch
│   └── logger.js                # Logging utilities
├── config/
│   └── default.json             # Default configuration
├── python/
│   ├── main.py                  # FastAPI entry point
│   ├── orchestrator.py          # Agno-like orchestration setup
│   ├── models/
│   │   ├── summarizer.py        # DistilBART summarization
│   │   └── mention_detector.py  # @mention & task extraction
│   └── integrations/            # Optional integrations (Phase 3)
├── docs/
│   ├── ARCHITECTURE.md          # Detailed architecture
│   └── USAGE.md                 # Workflows & examples
├── logs/                        # Application logs (auto-created)
├── auth_info_baileys/           # Bailey session data (auto-created)
├── .env.example                 # Environment template
├── package.json                 # Node.js dependencies
├── requirements.txt             # Python dependencies
└── README.md                    # This file
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **npm** & **pip**

### 1. Clone & Setup

```bash
git clone https://github.com/zealgoswami-lab/whatapps-agent
cd whatsapp-agent

# Copy environment template
cp .env.example .env
```

### 2. Install Dependencies

```bash
# Node.js dependencies
npm install

# Python dependencies
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Run the Application

**Terminal 1 - Node.js (Message Capture & API)**
```bash
npm run dev
```

You'll see a QR code in the terminal. **Scan it with your WhatsApp phone.**

**Terminal 2 - Python (Orchestration & Models)**
```bash
source venv/bin/activate
python -m uvicorn python.main:app --reload --port 8000
```

### 4. Test It

Once both services are running, send a test message:

```bash
curl -X POST http://localhost:3000/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hey @john please confirm the deadline for the project. Its urgent! We need your feedback ASAP.",
    "sender": "1234567890@s.whatsapp.net",
    "group": "120982309-1209@g.us"
  }'
```

Check the logs for processing results. You'll see:
- ✅ Summarization output
- 👤 Detected mentions: `@john`
- ✅ Extracted tasks: `confirm deadline`, `provide feedback`
- 🔴 Urgency level: `high`

## 📖 Usage Examples

### Scenario 1: Group Discussion Summarization

A long WhatsApp group discussion happens (500+ characters). The agent:
1. Captures the conversation
2. Sends to Python service for summarization
3. Stores summary in-memory
4. Later provides as a digest

### Scenario 2: Mention & Alert Detection

Someone writes: *"@john @sarah please review the proposal by Friday. Urgent!"*

The agent:
1. Detects mentions: `["john", "sarah"]`
2. Extracts action: `"review proposal by Friday"`
3. Determines urgency: `"high"`
4. Sends private WhatsApp alert to john & sarah

### Scenario 3: Multi-Step Orchestration (Phase 2+)

A complex group message triggers:
1. **Summarizer workflow**: Generate digest
2. **Mention detector workflow**: Extract all mentions + tasks
3. **Alert generator workflow**: Create formatted alerts
4. **Response handler**: Send back to user

## 🔧 Configuration

Edit `.env` to customize:

```env
# Node.js Server
PORT=3000
LOG_LEVEL=info

# Python Service
PYTHON_SERVICE_URL=http://localhost:8000

# Alerts
ALERT_COOLDOWN_MINUTES=5
ALERT_ENABLED=true

# Models
USE_GPU=0  # Set to 1 if you have GPU
SUMMARIZER_MODEL=facebook/bart-large-cnn
```

See `.env.example` for all available options.

## 📊 API Endpoints

### Node.js Service (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/stats` | Queue & orchestrator stats |
| `POST` | `/test-message` | Send test message |

### Python Service (Port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/summarize` | Summarize long text |
| `POST` | `/detect-mentions` | Extract mentions & tasks |
| `POST` | `/generate-alert` | Create formatted alerts |
| `POST` | `/process-message` | End-to-end message processing |

Full API documentation available at `http://localhost:8000/docs` (Swagger UI).

## 🎯 Implementation Phases

### Phase 1: Core Infrastructure ✅ (Current)
- [x] Bailey WhatsApp connection via QR code
- [x] Real-time message capture
- [x] Node.js Express server
- [x] Python FastAPI orchestration skeleton
- [x] Basic logging & error handling

### Phase 2: Summarization & Alerting 🔄 (Next)
- [ ] Full DistilBART integration
- [ ] Mention detection with NER
- [ ] Task extraction from conversations
- [ ] Alert generation & sending
- [ ] Rate limiting & cooldown management

### Phase 3: Advanced Features 📋 (Future)
- [ ] Daily/weekly digest scheduling
- [ ] Google Calendar integration (auto-create events from deadlines)
- [ ] Notion database sync (store tasks)
- [ ] Trello card creation (assign tasks)
- [ ] Web dashboard (view summaries & stats)

## 🐛 Troubleshooting

### Issue: "Python service is unavailable"

**Solution**: Ensure the Python service is running in Terminal 2:
```bash
source venv/bin/activate
python -m uvicorn python.main:app --reload --port 8000
```

### Issue: QR Code not scanning

**Solution**: 
1. Ensure your phone's WhatsApp is updated
2. Make sure the QR terminal is fully visible
3. Try scanning the QR code again after 10 seconds

### Issue: Messages not being captured

**Solution**: Check logs for errors:
```bash
tail -f logs/combined.log
```

Verify connection status at `http://localhost:3000/health`

## 📚 Documentation

- [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) — Detailed design, data flow, decisions
- [**USAGE.md**](docs/USAGE.md) — Example workflows, advanced usage

## 🛠️ Development

### Adding New Features

1. **Node.js layer changes**: Edit `src/*.js` files
2. **Python layer changes**: Edit `python/*.py` files
3. **Configuration**: Update `config/default.json`
4. **Logging**: Use `logger` module for consistency

### Running Tests

```bash
# Node.js
npm test  # (To be added)

# Python
pytest python/tests/  # (To be added)
```

### Building for Production

```bash
# Node.js
npm run build

# Python: Run with Gunicorn
pip install gunicorn
gunicorn -w 4 python.main:app --bind 0.0.0.0:8000
```

## 📦 Deployment

### Local Development
See Quick Start section above.

### Docker (Coming Soon)
```bash
docker-compose up -d
```

### Cloud Deployment (Coming Soon)
- Heroku/Railway for Node.js + Python
- AWS Lambda for serverless
- DigitalOcean App Platform

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open a Pull Request

## 📝 License

MIT License — See LICENSE file for details

## 🙋 Support

- **Issues**: Open a GitHub issue
- **Discussions**: Start a GitHub discussion
- **Email**: contact@example.com

---

**⭐ If this project helps you, please consider giving it a star!**

Made with ❤️ for WhatsApp group managers everywhere.
