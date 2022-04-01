export interface EventItem {
  name: string;
  icon: string;
  course: string;
  date: string;
  location: {
    lat: number;
    lon: number;
    description: string;
  };
  description: string;
  shortDescription: string;
  youtubeCode: string;
  id: string;
  button: {
    text: string;
    url: string;
  };
}
