import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface Track {
  id: string;
  title: string;
  artist: string;
  filename: string;
}

export interface SiteContent {
  background: string;
  banner: string;
  playlist: Track[];
  sitePassword?: string;
}

const CONTENT_PATH = join(process.cwd(), "content", "site.json");

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const content = await readFile(CONTENT_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      background: "default-bg.jpg",
      banner: "default-banner.png",
      playlist: [],
    };
  }
}

export async function updateSiteContent(content: Partial<SiteContent>): Promise<void> {
  const current = await getSiteContent();
  const updated = { ...current, ...content };
  await writeFile(CONTENT_PATH, JSON.stringify(updated, null, 2));
}

export async function addTrack(track: Omit<Track, "id">): Promise<Track> {
  const content = await getSiteContent();
  const newTrack: Track = {
    ...track,
    id: Date.now().toString(),
  };
  content.playlist.push(newTrack);
  await updateSiteContent(content);
  return newTrack;
}

export async function removeTrack(id: string): Promise<void> {
  const content = await getSiteContent();
  content.playlist = content.playlist.filter((t) => t.id !== id);
  await updateSiteContent(content);
}

export async function updateTrack(id: string, updates: Partial<Track>): Promise<void> {
  const content = await getSiteContent();
  content.playlist = content.playlist.map((t) =>
    t.id === id ? { ...t, ...updates } : t
  );
  await updateSiteContent(content);
}

export async function getSitePassword(): Promise<string> {
  const content = await getSiteContent();
  // Use stored password if set, otherwise fall back to env var
  return content.sitePassword || process.env.SITE_PASSWORD || "";
}

export async function updateSitePassword(password: string): Promise<void> {
  await updateSiteContent({ sitePassword: password });
}
