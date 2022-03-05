export interface EventItem {
  name: string;
  icon: string;
  course: number;
  date: string;
  location: {
    lat: number;
    lng: number;
  };
  description: string;
  shortDescription: string;
  youtubeCode: string;
}
