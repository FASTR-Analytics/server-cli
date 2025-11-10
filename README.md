# wb-fastr-cli

Server-side management tool for FASTR server instances running on Docker.

**Important**: This tool is designed to run **on the server** where your Docker containers, nginx, and SSL certificates are managed. It is not a local development tool.

## Features

- **Server Lifecycle Management**: Start, stop, and restart Docker-based server instances
- **Configuration Management**: JSON-based server configuration with tagging support
- **Infrastructure Automation**: Automated nginx configuration and SSL certificate management
- **Docker Integration**: Network management, image pulling, and container orchestration
- **Multi-Instance Support**: Run multiple server instances with different configurations

## Prerequisites

**On the server:**
- [Deno](https://deno.land/) runtime
- Docker
- nginx
- certbot (for SSL certificates)
- Access to `/mnt/volume_data` (or your configured mount path)
- Access to `/etc/nginx/sites-available` and `/etc/nginx/sites-enabled`

## Installation

### Deploy to Server

```bash
# On your local machine, build the binary
git clone https://github.com/timroberton/wb-fastr-cli.git
cd wb-fastr-cli

deno compile \
  --allow-env \
  --allow-run \
  --allow-read \
  --allow-write \
  --target x86_64-unknown-linux-gnu \
  -o wb \
  main.ts

# Copy to server
scp wb your-server:/root/bin/wb

# On the server, make it executable
ssh your-server
chmod +x /root/bin/wb
```

### Configure on Server

```bash
# Create configuration directory
mkdir -p /root/config

# Create .env file
nano /root/config/.env
```

Add your environment variables (see Configuration section below)

```bash
# Create servers.json file
nano /root/config/servers.json
```

Add your server configurations (see Configuration section below)

```bash
# Set env var to point to config
export SERVERS_FILE_PATH=/root/config/servers.json

# Or use --env-file flag when running
wb --env-file=/root/config/.env c list
```

## Configuration

### Environment Variables

Create a `.env` file on the server at `/root/config/.env` (or your preferred location):

```bash
# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_xxx    # Get from https://dashboard.clerk.com
CLERK_SECRET_KEY=sk_test_xxx

# Domain Configuration
DOMAIN=example.com                    # Base domain for server instances

# File Paths
SERVERS_FILE_PATH=/root/config/servers.json

# Docker and nginx Paths
MOUNT_PATH=/mnt/volume_data          # Where Docker volumes are stored
SITES_AVAILABLE_PATH=/etc/nginx/sites-available
SITES_ENABLED_PATH=/etc/nginx/sites-enabled

# Database Passwords
POSTGRES_PASSWORD=your_secure_password
PG_PASSWORD=your_pg_password

# Anthropic AI (Required)
ANTHROPIC_API_URL=https://api.anthropic.com/v1/messages
ANTHROPIC_API_KEY=sk-ant-xxx
```

**Note**: All environment variables are required. The tool will exit if any are missing.

### Server Configuration

Create a `servers.json` file on the server at `/root/config/servers.json`:

```json
[
  {
    "id": "demo",
    "label": "Demo Server",
    "port": 9100,
    "serverVersion": "1.6.7",
    "french": false,
    "ethiopian": false,
    "openAccess": true,
    "tags": ["development"]
  }
]
```

See `servers.json.example` in the repository for more examples.

**Server Fields:**
- `id`: Unique identifier (lowercase alphanumeric with hyphens)
- `label`: Display name
- `port`: HTTP port (1000-65535)
- `serverVersion`: Docker image version
- `adminVersion`: Optional admin interface version
- `french`: Enable French language interface
- `ethiopian`: Enable Ethiopian calendar
- `openAccess`: Allow public access without authentication
- `instanceDir`: Custom data directory name (defaults to `id`)
- `tags`: Array of tags for bulk operations

## Usage

### Config Commands

Manage server configurations:

```bash
# List all servers
wb c list
wb c list --json
wb c list --tag production

# Show server details
wb c show demo
wb c show demo --json

# Add new server
wb c add nigeria

# Update server configuration
wb c update demo --label "Demo Server"
wb c update demo --french true
wb c update demo --server 1.7.0
wb c update @production --server 2.0.0  # Bulk update by tag

# Remove server
wb c remove demo

# Tagging
wb c tag demo production west-africa
wb c untag demo development

# Validation and backup
wb c validate
wb c backup
wb c restore servers.json.backup.2025-01-01T10-00-00-000Z
```

### Infrastructure Commands

Set up server infrastructure:

```bash
# Initialize directories
wb init-dirs demo

# Initialize nginx configuration
wb init-nginx demo

# Initialize SSL certificate
wb init-ssl demo

# Remove infrastructure
wb remove-dirs demo
wb remove-nginx demo
wb remove-ssl demo

# List configurations
wb list-nginx
wb list-ssl
```

### Docker Commands

Manage running containers:

```bash
# Start servers
wb run demo
wb start demo guinea haiti          # Multiple servers
wb start @production                # All servers with tag
wb start server=1.6.7              # All servers with version
wb start all                        # All configured servers

# Stop servers
wb stop demo
wb stop @staging

# Restart servers
wb restart demo

# Docker management
wb pull                             # Pull latest images
wb prune                            # Clean up unused networks

# Check status
docker ps                           # See running containers
```

### Special Selectors

Use special selectors for bulk operations:

- `all` - All configured servers
- `@tag` - All servers with specific tag (e.g., `@production`)
- `server=VERSION` - All servers with specific version (e.g., `server=1.6.7`)

## Development

### Project Structure

```
wb-fastr-cli/
├── src/
│   ├── commands/       # Command implementations
│   │   ├── config/     # Configuration management
│   │   ├── docker/     # Docker operations
│   │   ├── dirs.ts     # Directory management
│   │   ├── nginx.ts    # Nginx configuration
│   │   ├── ssl.ts      # SSL certificate management
│   │   └── list.ts     # List commands
│   ├── core/           # Core functionality
│   │   ├── cli.ts      # CLI argument parsing
│   │   ├── config.ts   # Environment configuration
│   │   ├── server-store.ts  # Server CRUD operations
│   │   ├── validation.ts    # Server validation
│   │   └── types.ts    # TypeScript types
│   └── utils/          # Utility functions
├── main.ts             # Entry point
├── build               # Build script
└── deno.json           # Deno configuration
```

### Building and Deploying

```bash
# Check TypeScript
deno check main.ts

# Build for Linux and deploy to server
./build
```

The `build` script compiles for Linux, commits changes, and uploads to the server.

### Testing Changes

Before deploying to production:

1. Verify TypeScript: `deno check main.ts`
2. Test on server: `wb c list`, `wb c validate`
3. Test with a non-production server instance first

## Troubleshooting

### Common Issues

All troubleshooting commands should be run **on the server** where the tool is installed.

**Port conflicts:**

```bash
# Check if port is in use
lsof -i :9100

# List all configured ports to avoid conflicts
wb c list
```

**Docker network errors:**

```bash
# Clean up unused networks
wb prune

# Check Docker networks
docker network ls
```

**Permission issues:**

```bash
# Ensure sandbox directory has correct permissions
chmod 777 /mnt/volume_data/demo/sandbox

# Check mount path permissions
ls -la /mnt/volume_data
```

**SSL certificate issues:**

```bash
# List SSL certificates managed by certbot
wb list-ssl

# Check certbot status
sudo certbot certificates
```

**Environment variable issues:**

```bash
# Verify all required variables are set
wb c list

# If missing variables, check your .env file
cat /root/config/.env
```

## License

Copyright (c) 2025 The World Bank, Global Financing Facility for Women, Children and Adolescents (GFF), Frequent Assessments and System Tools for Resilience (FASTR) Initiative. All rights reserved.

This software is proprietary and made publicly available for transparency and reference purposes only. Viewing and reviewing the source code is permitted. See [LICENSE](LICENSE) for full terms.

## Support

For issues and questions, please open an issue on GitHub.
