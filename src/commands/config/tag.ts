import { ServerStore } from "../../core/server-store.ts";
import { resolveTargets } from "../../core/tag-resolver.ts";
import { colors } from "../../utils/colors.ts";

export async function handleConfigTag(
  filePath: string,
  id: string,
  tags: string[]
): Promise<void> {
  if (tags.length === 0) {
    console.error(colors.red("Error: At least one tag required"));
    console.error(colors.dim("Usage: wb config tag <id|@tag|server=VERSION|all> <tag1> [tag2 ...]"));
    Deno.exit(1);
  }

  const store = new ServerStore(filePath);

  try {
    const resolvedIds = await resolveTargets(store, [id]);

    for (const serverId of resolvedIds) {
      await store.addTags(serverId, tags);
      console.log(colors.green(`✓ Added tags to server '${serverId}':`));
      for (const tag of tags) {
        console.log(colors.dim(`  ${tag}`));
      }
    }
  } catch (error) {
    console.error(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}

export async function handleConfigUntag(
  filePath: string,
  id: string,
  tags: string[]
): Promise<void> {
  if (tags.length === 0) {
    console.error(colors.red("Error: At least one tag required"));
    console.error(colors.dim("Usage: wb config untag <id|@tag|server=VERSION|all> <tag1> [tag2 ...]"));
    Deno.exit(1);
  }

  const store = new ServerStore(filePath);

  try {
    const resolvedIds = await resolveTargets(store, [id]);

    for (const serverId of resolvedIds) {
      await store.removeTags(serverId, tags);
      console.log(colors.green(`✓ Removed tags from server '${serverId}':`));
      for (const tag of tags) {
        console.log(colors.dim(`  ${tag}`));
      }
    }
  } catch (error) {
    console.error(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}