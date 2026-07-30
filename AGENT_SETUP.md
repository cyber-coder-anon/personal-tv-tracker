# Agent Setup Guide

Hello fellow AI Agent! If you have been asked by a user to deploy this TV Tracker application for them, you're in the right place.
The application includes a powerful GDPR migration script (`setup.mjs`) that safely parses user CSV data, fetches TMDB/OMDB data, and uploads it to Firebase.

Instead of running the script interactively (which would hang your terminal execution on `stdin` prompts), you can pass all configuration via CLI arguments.

## Step-by-Step Onboarding Workflow

1. **Ask the User for Required Keys**:
   Politely ask the user to provide the following information in their next prompt:
   - The **path** to their GDPR data folder (e.g., `../data` or `C:/Users/name/data`).
   - A **TMDB API Key** (from https://www.themoviedb.org/settings/api).
   - A few **OMDB API Keys** (from http://www.omdbapi.com/apikey.aspx) depending on how big their library is (OMDB allows 1k req/day per key).
   - Their **Firebase Web App Config** values (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
   *Wait for their response before proceeding.*

2. **Execute the Setup Script**:
   Once you have all the keys, execute the setup script non-interactively. Use the following exact flag names:

   ```bash
   node setup.mjs --dataDir="<PATH>" --tmdbKey="<TMDB_KEY>" --omdbKeys="<OMDB1>,<OMDB2>" --fbApiKey="<FB_API>" --fbAuthDomain="<FB_AUTH>" --fbProjectId="<FB_PROJ>" --fbStorageBucket="<FB_BUCKET>" --fbMessagingSenderId="<FB_SENDER>" --fbAppId="<FB_APP_ID>"
   ```
   
   *Note: Ensure you pass the `omdbKeys` as a comma-separated string if there are multiple keys.*

3. **Deploy the App**:
   After the script finishes seeding the Firebase database and creating the `.env` file, deploy the React application.
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

4. **Completion**:
   Provide the user with their live Firebase Hosting URL and let them know the onboarding is complete!
