// Apartment / gallery photos are bundled under ./photos as "<cleanKey>.jpg"
// where cleanKey = id.replace(/[^a-z0-9]/gi, '_'). Build a lookup map at build
// time via Vite's import.meta.glob so every referenced photo resolves locally
// (fully offline). Unknown ids fall back to the live Unsplash URL.
const mods = import.meta.glob('./photos/*.jpg', { eager: true, import: 'default' });

const photos: Record<string, string> = {};
for (const p in mods) {
  const key = p.split('/').pop()!.replace(/\.jpg$/, '');
  photos[key] = mods[p] as string;
}

export function imgU(id: string): string {
  // Já é uma URL pronta (foto vinda do painel/API: http(s) ou /uploads/..) → usa direto.
  if (/^https?:\/\//.test(id) || id.startsWith('/')) return id;
  const key = id.replace(/[^a-z0-9]/gi, '_');
  return (
    photos[key] ??
    `https://images.unsplash.com/photo-${id}?w=1400&q=72&auto=format&fit=crop`
  );
}
