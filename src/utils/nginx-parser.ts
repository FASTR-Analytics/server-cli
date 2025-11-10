export async function extractPortFromNginxFile(filePath: string): Promise<number | null> {
  try {
    const content = await Deno.readTextFile(filePath);
    const match = content.match(/proxy_pass\s+http:\/\/localhost:(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}