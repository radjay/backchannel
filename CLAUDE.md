# Matrix AI Server - Development Rules

## Project Context
AI-enabled Matrix server with message summarization, chat with message history, content analysis, and enhanced user interactions.

## Development Commands

### Setup
```bash
# Install dependencies
npm install

# Setup configuration
cp config.example.yaml config.yaml
# Edit config.yaml with your settings
```

### Development
```bash
# Start development server
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Type check
npm run typecheck
```

### Database
```bash
# Run migrations
npm run migrate

# Seed development data
npm run seed
```

### AI Components
```bash
# Download/update AI models
npm run models:download

# Test AI functionality
npm run ai:test
```

## Development Rules

### Code Standards
- Follow existing code patterns and conventions
- Use TypeScript for type safety where applicable
- Write tests for new functionality
- Document AI model requirements and configurations

### Security Requirements
- Never commit secrets or API keys to repository
- Use environment variables for all sensitive configuration
- Validate all user inputs, especially for AI processing
- Follow Matrix security best practices for federation

### AI Implementation Guidelines
- Prefer local models when possible for privacy
- Implement proper error handling for AI operations
- Cache AI results appropriately to reduce processing costs
- Respect user privacy in message analysis

### Testing Standards
- Write unit tests for core functionality
- Integration tests for AI components
- Performance tests for message processing
- Security tests for API endpoints