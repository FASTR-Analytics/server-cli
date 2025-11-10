import { colors } from "./colors.ts";

export function showHelp() {
  console.log(`
${colors.bold("wb-fastr-cli")} - Server management tool

${colors.bold("CONFIG COMMANDS")} ${colors.dim("(c) - modify servers.json only")}
  ${colors.cyan("wb c list")}                       List all configured servers
  ${colors.cyan("wb c list --json")}                List servers in JSON format
  ${colors.cyan("wb c list --tag <tag>")}           List servers with specific tag
  ${colors.cyan("wb c show <id>")}                  Show details for a server
  ${colors.cyan("wb c show <id> --json")}           Show server details in JSON
  ${colors.cyan("wb c add <id>")}                   Add new server configuration
  ${colors.cyan("wb c update <id> [options]")}      Update server configuration
  ${colors.cyan("wb c remove <id>")}                Remove server configuration
  ${colors.cyan("wb c tag <id> <tags...>")}         Add tags to a server
  ${colors.cyan("wb c untag <id> <tags...>")}       Remove tags from a server
  ${colors.cyan("wb c validate")}                   Validate servers.json
  ${colors.cyan("wb c backup")}                     Create backup of servers.json
  ${colors.cyan("wb c restore <file>")}             Restore from backup

${colors.bold("UPDATE OPTIONS")}
  ${colors.dim("--label <text>")}           Change display label
  ${colors.dim("--french <true|false>")}    Enable/disable French language
  ${colors.dim("--ethiopian <true|false>")} Enable/disable Ethiopian calendar
  ${colors.dim("--open-access <true|false>")} Enable/disable open access
  ${colors.dim("--server <ver>")}           Set server version
  ${colors.dim("--admin <ver>")}            Set admin version
  ${colors.dim("--instance-dir <name>")}    Set custom instance directory name

${colors.bold("INITIALIZATION COMMANDS")} ${colors.dim("(setup server infrastructure)")}
  ${colors.cyan("wb init-dirs <id>")}            Create directories for server
  ${colors.cyan("wb init-nginx <id>")}           Setup nginx configuration
  ${colors.cyan("wb init-ssl <id>")}             Setup SSL certificate with certbot
  ${colors.cyan("wb remove-dirs <id>")}          Remove server directories (requires confirmation)
  ${colors.cyan("wb remove-nginx <id>")}         Remove nginx configuration
  ${colors.cyan("wb remove-ssl <id>")}           Revoke and remove SSL certificate
  ${colors.cyan("wb list-nginx")}                List all nginx configurations
  ${colors.cyan("wb list-ssl")}                  List all SSL certificates

${colors.bold("DOCKER COMMANDS")} ${colors.dim("(manage running containers)")}
  ${colors.cyan("wb run <id...>")}     ${colors.dim("(start)")}  Run one or more containers
  ${colors.cyan("wb stop <id...>")}              Stop one or more containers
  ${colors.cyan("wb restart <id...>")}           Restart one or more containers
  ${colors.cyan("wb pull")}                      Pull docker images
  ${colors.cyan("wb prune")}                     Prune unused docker networks

  ${colors.dim("Special IDs:")}
  ${colors.dim("  all           - All configured servers")}
  ${colors.dim("  @<tag>        - All servers with specific tag")}
  ${colors.dim("  server=<ver>  - All servers with specific version")}
  ${colors.dim("  admin         - Admin container only")}

${colors.bold("OTHER")}
  ${colors.cyan("wb help")}                      Show this help
  ${colors.cyan("docker ps")}                   Show running containers

${colors.dim("Examples:")}
  ${colors.dim("wb c add nigeria")}
  ${colors.dim("wb c tag nigeria production west-africa")}
  ${colors.dim("wb c update nigeria --french true")}
  ${colors.dim("wb c update @production --server 2.0.0")}
  ${colors.dim("wb c update server=1.2.10 --label \"Version 1.2.10\"")}
  ${colors.dim("wb c list --tag west-africa")}
  ${colors.dim("wb init-dirs nigeria")}
  ${colors.dim("wb start nigeria guinea haiti")}
  ${colors.dim("wb run @staging")}
  ${colors.dim("wb stop all")}
  ${colors.dim("wb restart admin")}
`);
}