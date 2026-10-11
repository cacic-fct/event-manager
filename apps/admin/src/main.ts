import { bootstrapApplication } from '@angular/platform-browser';

// Load application setup separately from the core Angular entry point.
Promise.all([import('./app/app.config'), import('./app/app')])
  .then(([{ appConfig }, { App }]) => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
