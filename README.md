# 📺 TV-Timeless

Welcome to the ultimate, privacy-first **TV-Timeless Tracker**! 

Built entirely from the ground up for **TV Time refugees** who want to own their data, this application allows you to seamlessly track everything you watch, migrate all your historical GDPR data, and sync it natively to a secure, private Firebase database. No telemetry. No trackers. Just you and your shows.

![TV Tracker Dashboard](screenshots/desktop_dashboard.jpg)

---

## 🌟 What can TV-Timeless do?

TV-Timeless isn't just a list—it's a comprehensive dashboard for your entire entertainment life. 

### 📊 Deep Visual Analytics
**Hey look, you can track your habits like a pro!**
Get a beautiful, bird's-eye view of your watching history. The dashboard features native integration with Recharts, generating stunning, responsive graphs that show you exactly how many episodes you've watched over time, your favorite genres, and your total runtime. 

### 🤖 AI-Powered Content Warnings (Wokealyzer)
**It also lets you know exactly what you're about to watch!**
Tired of surprise explicit scenes when watching with family? TV-Timeless integrates directly with Google Gemini (Firebase Vertex AI) to provide the **Wokealyzer**. Before you even start a show, the AI scans the metadata and instantly flags explicit sexual content, extreme gore, or mature themes so you're never caught off guard.

| Search & Discover | AI Insights & Warnings |
| :---: | :---: |
| ![Semantic Search](screenshots/desktop_search.jpg) | ![AI Details](screenshots/desktop_details.jpg) |

### 🚀 One-Click TV Time Migration
**You can do this without losing years of history!**
We know how painful it is to switch apps. That's why TV-Timeless comes with an intelligent, rate-limit-safe **Migration Wizard**. Just drop in your GDPR export from TV Time, and the CLI wizard automatically parses your history, fetches high-quality metadata from TMDB/OMDB, and builds your private database from scratch. 

### 📱 Flawless Cross-Platform Experience
**And you can do this from anywhere.**
Whether you're on a massive 4K monitor or checking off an episode on your iPhone during your commute, the UI is hyper-optimized. Beautiful glassmorphism, sleek dark mode, and a responsive React grid mean your library always looks premium.

| Mobile Dashboard | Mobile Shows |
| :---: | :---: |
| <img src="screenshots/mobile_dashboard.jpg" width="300" /> | <img src="screenshots/mobile_shows.jpg" width="300" /> |

### 🍿 Dedicated Libraries & Granular Tracking
Keep your content organized. TV-Timeless splits your tracking into intuitive tabs:
- **Up Next**: The dashboard tracks what you're currently in the middle of.
- **Shows**: Your complete library of series. **Click on any show to instantly view all seasons, and expand them to check off individual episodes as you watch them!**
- **Movies**: A dedicated cinematic vault for everything you've watched.

| Shows Library | Episode Tracking |
| :---: | :---: |
| ![Desktop Shows](screenshots/desktop_shows.jpg) | ![Episode Tracking](screenshots/desktop_episodes.jpg) |

| Movies Library |
| :---: |
| ![Desktop Movies](screenshots/desktop_movies.jpg) |

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- A Free [TMDB API Key](https://www.themoviedb.org/settings/api)
- A Free [OMDB API Key](http://www.omdbapi.com/apikey.aspx)
- A Firebase Project (with Firestore and Web Hosting enabled)

### 2. Intelligent Onboarding (No Code Required)

To get your personal tracker up and running, we've included an intelligent CLI wizard that handles everything.

1. Clone or download this repository.
2. Open your terminal in the project folder and run:
   ```bash
   npm install
   npm run setup
   ```
3. Follow the beautiful terminal wizard. It will securely configure your `.env` variables and automatically upload your historical TV Time GDPR data to your private Firebase instance!

### 3. Deploy to the Web

Once the wizard completes, your database is perfectly seeded and ready! 
Deploy the front-end to Firebase Hosting so you can access your tracker anywhere:

```bash
npm run build
firebase deploy --only hosting
```

---

*This project is completely open-source and agent-friendly. If you are an AI assistant helping a user deploy this, refer to the `AGENT_SETUP.md` guide in this repository!*
