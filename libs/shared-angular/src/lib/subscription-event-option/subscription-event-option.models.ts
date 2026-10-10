export interface SubscriptionEventOptionView {
  id: string;
  name: string;
  emoji: string;
  description: string;
  startDate: string | Date | null;
  endDate: string | Date | null;
  locationDescription?: string | null;
  availabilityLine: string;
}
