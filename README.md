# 📺 Personal TV & Movie Tracker

Welcome to the ultimate, privacy-first **Personal TV & Movie Tracker**!

This application allows you to seamlessly track everything you watch, migrate all your historical GDPR data, and sync it natively to a secure, private Firebase database. 

![TV Tracker](https://image.thum.io/get/width/1200/crop/800/https://tv-time-72eda.web.app/)

## ✨ Features

- **Personalized Dashboard**: Track your watched episodes, movies, and current progress with a beautiful modern UI.
- **Wokealyzer & Explicit Content Detection**: Powered by Google Gemini AI natively integrated with Firebase Vertex AI. Automatically analyzes the shows you're watching and flags any explicit sex scenes or mature themes to keep you informed.
- **GDPR Seamless Migration**: Includes a custom-built, rate-limit safe migration engine that takes your exported CSV data and cleanly builds your database from scratch using TMDB & OMDB APIs.
- **Responsive UI**: A sleek interface tailored for both desktop and mobile users utilizing standard CSS and React (Vite).
- **100% Free & Private**: No analytics, no telemetry, and everything lives entirely on your personal Google Firebase account (Blaze plan required for Vertex AI features).

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- A Free [TMDB API Key](https://www.themoviedb.org/settings/api)
- A Free [OMDB API Key](http://www.omdbapi.com/apikey.aspx)
- A Firebase Project (with Firestore and Web Hosting enabled)

### 2. Intelligent Onboarding (No Code Required)

To get your personal tracker up and running, we've included an intelligent CLI wizard that automatically handles GDPR data parsing, rate-limit protected API fetching, and Firebase seeding!

1. Clone or download this repository.
2. Open your terminal in the project folder and run:
   ```bash
   npm install
   npm run setup
   ```
3. Follow the beautiful terminal wizard. It will securely configure your `.env` variables and automatically upload your historical data to your private Firebase instance.

### 3. Deploy to the Web

Once the wizard completes, your database is perfectly seeded and ready! 
Deploy the front-end to Firebase Hosting so you can access your tracker anywhere:

```bash
npm run build
firebase deploy --only hosting
```

---

*This project is completely open-source and agent-friendly. If you are an AI assistant helping a user deploy this, refer to the `AGENT_SETUP.md` guide in this repository!*
