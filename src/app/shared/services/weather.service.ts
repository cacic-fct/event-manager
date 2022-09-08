import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { format } from 'date-fns';
import { catchError, first, map, Observable, retry, throwError } from 'rxjs';
import { add } from 'date-fns';

@Injectable()
export class WeatherService {
  public static weatherCodes = {
    0: { icon: 'sunny', text: 'Céu limpo' },
    1: { icon: 'sunny', text: 'Céu predominantemente limpo' },
    2: { icon: 'partly-sunny', text: 'Predominantemente nublado' },
    3: { icon: 'cloudy', text: 'Nublado' },
    45: { icon: 'cloudy', text: 'Neblina' },
    48: { icon: 'cloudy', text: 'Neblina' },
    51: { icon: 'rainy', text: 'Garoa leve' },
    53: { icon: 'rainy', text: 'Garoa' },
    55: { icon: 'rainy', text: 'Garoa intensa' },
    56: { icon: 'rainy', text: 'Garoa congelante leve' },
    57: { icon: 'rainy', text: 'Garoa congelante' },
    61: { icon: 'rainy', text: 'Chuva leve' },
    63: { icon: 'rainy', text: 'Chuva' },
    65: { icon: 'rainy', text: 'Chuva intensa' },
    66: { icon: 'rainy', text: 'Chuva congelante leve' },
    67: { icon: 'rainy', text: 'Chuva congelante' },
    71: { icon: 'snow', text: 'Neve leve' },
    73: { icon: 'snow', text: 'Neve' },
    75: { icon: 'snow', text: 'Neve intensa' },
    77: { icon: 'snow', text: 'Neve granular' },
    80: { icon: 'rainy', text: 'Pancada de chuva leve' },
    81: { icon: 'rainy', text: 'Pancada de chuva' },
    82: { icon: 'rainy', text: 'Pancada de chuva intensa' },
    85: { icon: 'snow', text: 'Pancada de neve' },
    86: { icon: 'snow', text: 'Pancada de neve intensa' },
    95: { icon: 'thunderstorm', text: 'Trovoada' },
    96: { icon: 'thunderstorm', text: 'Trovoada' },
    99: { icon: 'thunderstorm', text: 'Trovoada' },
  };

  constructor(private http: HttpClient) {}

  getWeather(date: Date, lat: number, lon: number) {
    if (date > add(new Date(), { days: 7 })) {
      return new Observable<never>();
    }

    const eventDateStringFormat = format(date, 'yyyy-MM-dd');
    const req = this.http.get<WeatherApiResponse>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode&timezone=America%2FSao_Paulo&start_date=${eventDateStringFormat}&end_date=${eventDateStringFormat}`,
      { responseType: 'json' }
    );

    return req.pipe(
      first(),
      retry(3),
      catchError((err) => {
        return this.handleError(err);
      }),

      map((data) => {
        const eventDateHour = date.getHours();
        const temperature = Math.floor(data.hourly.temperature_2m[eventDateHour]);
        const weather = this.getWeatherInfo(data.hourly.weathercode[eventDateHour]);

        return { temperature: temperature, icon: weather.icon, text: weather.text };
      })
    );
  }

  private getWeatherInfo(weatherCode: string | number) {
    return WeatherService.weatherCodes[weatherCode];
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    if (error.status === 0) {
      // A client-side or network error occurred.
      return throwError(() => new Error(`An error occurred while retrieving weather data: ${error.error}`));
    } else {
      // The backend returned an unsuccessful response code.
      return throwError(() => new Error(`Backend returned code ${error.status} for weather request`));
    }
  }
}

export interface WeatherApiResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    weathercode: number[];
  };
}

export interface WeatherInfo {
  temperature?: number;
  icon?: string;
  text?: string;
  error?: boolean;
}
