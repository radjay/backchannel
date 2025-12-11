# Matrix AI Server

A complete Matrix homeserver with WhatsApp bridge integration and planned AI-powered messaging features.

## Current Features ✅

### Matrix Homeserver
- 🏠 **Matrix Synapse** - Full Matrix homeserver with federation support
- 🌐 **Element Web Client** - Browser-based Matrix interface
- 🔒 **SSL/HTTPS** - Secure connections with Let's Encrypt certificates  
- 💾 **PostgreSQL Database** - Robust data storage and management
- 🔐 **User Registration** - Account creation and management

### WhatsApp Bridge
- 📱 **WhatsApp Integration** - Connect WhatsApp accounts to Matrix
- 💬 **Bidirectional Messaging** - Messages sync between WhatsApp and Matrix
- 👥 **Group Chat Support** - WhatsApp groups become Matrix rooms
- 📁 **Media Sharing** - Images, documents, voice messages supported
- 🔄 **Real-time Sync** - Instant message delivery across platforms

## Planned AI Features 🚧

- 🤖 **AI-Powered Chat** - Chat with your message history using natural language
- 📝 **Message Summarization** - Automatic summarization of long conversations  
- 🔍 **Intelligent Search** - AI-powered search through message history
- 📊 **Content Analysis** - Sentiment analysis and topic extraction
- 🏠 **Privacy-First AI** - Self-hosted with local AI model support

## Quick Deployment

### Automated Setup (Recommended)

Deploy complete Matrix server with WhatsApp bridge in minutes:

```bash
# 1. Clone repository
git clone <repository-url> /home/matrix-ai
cd /home/matrix-ai

# 2. Configure environment  
echo "MATRIX_DB_PASSWORD=$(openssl rand -base64 32)" > .env
# Edit setup.sh to set your domain and email

# 3. Run automated setup
sudo bash setup.sh
```

### What Gets Installed
- **Matrix Synapse** homeserver with PostgreSQL
- **Element Web** client accessible via browser
- **WhatsApp Bridge** for seamless WhatsApp integration  
- **nginx** reverse proxy with SSL termination
- **Automated SSL** certificate management

## Post-Installation

After setup completes:

1. **Create admin user**:
   ```bash
   cd /home/matrix-ai
   /opt/matrix/synapse-venv/bin/register_new_matrix_user -c services/matrix-synapse/config/homeserver.yaml https://your-domain.com
   ```

2. **Access Element Web**: Visit `https://your-domain.com`

3. **Connect WhatsApp**: 
   - Message `@whatsappbot:your-domain.com` 
   - Type `login` and scan QR code with WhatsApp app

## Architecture

```
Internet → nginx (SSL) → Matrix Synapse → PostgreSQL
             ↓                ↓
      Element Web Client  WhatsApp Bridge → WhatsApp Web API
                               ↓
                          Archiver → Supabase (external archive)
```

## Repository Structure

```
services/
├── archiver/          # Message archiver to Supabase (Python)
├── archiver-js/       # Message archiver to Supabase (Node/TS)
├── whatsapp-bridge/   # WhatsApp integration (Go binary)
├── matrix-synapse/    # Matrix server config
└── ai/                # Future AI services

web/                   # Next.js UI for orgs/rooms/messages
scripts/               # Service management scripts
logs/                  # Service logs - gitignored
data/                  # Runtime data (media) - gitignored
docs/                  # Documentation
```

## Running the TypeScript archiver

From `/home/matrix-ai/services/archiver-js`:

1) Set environment variables (service role key is required):
```
export MATRIX_HOMESERVER_URL=http://localhost:8008
export MATRIX_USER=@archiver:matrix.radx.dev
export MATRIX_PASSWORD=your-password
export SUPABASE_URL=https://your-supabase-url.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
export ROOM_REFRESH_INTERVAL_SECONDS=300
export SYNC_TIMEOUT_MS=30000
```
2) Install deps: `npm install`
3) Build: `npm run build`
4) Run: `npm run start`  (or `npm run dev` for ts-node)

## Running the web UI (Next.js)

From `/home/matrix-ai/web`:

1) Set environment variables (server-side only):
```
export SUPABASE_URL=https://your-supabase-url.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
2) Install deps: `npm install`
3) Dev server: `npm run dev` (defaults to http://localhost:3000)
4) Production: `npm run build && npm run start`

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide
- **[VPS-Setup.md](./docs/VPS-Setup.md)** - Server setup instructions  
- **[Architecture.md](./docs/Architecture.md)** - Technical architecture
- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines

## Project Status

- ✅ **Phase 1**: Matrix Server Implementation - **COMPLETE**
- ✅ **Phase 2**: WhatsApp Bridge Integration - **COMPLETE**  
- 🚧 **Phase 3**: AI Features Integration - **PLANNED**

## Prerequisites

- Ubuntu VPS (22.04 or 24.04) with root access
- Domain name pointing to server IP
- SSH key authentication configured
- Email address for SSL certificates

## Security Features

- **Firewall**: Only SSH (22) and HTTPS (443) ports open
- **SSL/TLS**: Strong encryption with HSTS enabled  
- **Database**: Secure PostgreSQL with encrypted passwords
- **Isolation**: Services run as non-root users with restricted permissions
- **Updates**: Automated security updates recommended

## Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Documentation**: See docs/ directory
- **Community**: Matrix room at `#matrix-ai:your-domain.com`

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details

---

**Ready to deploy?** Start with the [Quick Deployment](#quick-deployment) section above!