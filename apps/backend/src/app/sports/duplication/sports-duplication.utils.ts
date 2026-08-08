export function sportsDuplicationEmoji(sport: string): string {
  const icons: Record<string, string> = {
    SOCCER: '⚽',
    FUTSAL: '⚽',
    TENNIS: '🎾',
    BASKETBALL: '🏀',
    ESPORTS: '🎮',
    CHESS: '♟️',
    VOLLEYBALL: '🏐',
    SWIMMING: '🏊',
    TABLE_TENNIS: '🏓',
    HANDBALL: '🤾',
  };
  return icons[sport] ?? '🏅';
}
