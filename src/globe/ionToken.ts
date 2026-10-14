export function resolveIonToken(raw: string | undefined): string | null {
  const token = raw?.trim();
  if (!token || token.startsWith('your_')) {
    return null;
  }
  return token;
}
