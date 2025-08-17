# PRD: Basic Matrix Server

## Objective
Deploy a simple Matrix homeserver on VPS using domain matrix.radx.dev with SSH access.

## Requirements

### Core Matrix Server
- **Synapse**: Official Matrix homeserver implementation
- **Domain**: matrix.radx.dev
- **Deployment**: Direct VPS installation (no Docker)
- **SSL**: Let's Encrypt certificates
- **Database**: PostgreSQL for development and production

### Features
- User registration and authentication
- Room creation and management
- Message sending/receiving
- File uploads and media sharing

### Infrastructure
- **VPS**: Ubuntu/Debian Linux
- **Ports**: 443 (HTTPS), 22 (SSH)
- **DNS**: A record for matrix.radx.dev
- **Client**: Element Web interface

## Implementation Plan

### Phase 1: Server Setup
- [ ] VPS provisioning and hardening
- [ ] Domain DNS configuration
- [ ] SSH key authentication setup
- [ ] Firewall configuration

### Phase 2: Matrix Installation
- [ ] Synapse installation
- [ ] Database setup
- [ ] Basic configuration
- [ ] SSL certificate setup

### Phase 3: Client & Testing
- [ ] Element Web deployment
- [ ] User registration testing
- [ ] Basic room functionality
- [ ] File upload testing

## Success Criteria
- Users can register accounts
- Messages send/receive reliably
- Element Web client accessible
- SSL certificates valid and auto-renewing
- File uploads work correctly