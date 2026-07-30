import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { parse } from 'csv-parse/sync';
import cliProgress from 'cli-progress';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const magenta = (text) => `\x1b[35m${text}\x1b[0m`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
async function input(msg) { return (await rl.question(`${msg} `)).trim(); }
async function confirm(msg) {
    const ans = (await rl.question(`${msg} (y/n) `)).trim().toLowerCase();
    return ans === 'y' || ans === 'yes';
}

async function main() {
    console.clear();
    console.log(cyan("=================================================="));
    console.log(cyan("       TV Tracker - Local Setup & GDPR Migration  "));
    console.log(cyan("==================================================\n"));
    
    console.log(yellow("[i] Privacy Assurance:"));
    console.log("    This script runs 100% locally on your machine.");
    console.log("    No telemetry, analytics, or background data is sent to the developer.");
    console.log("    Your keys and data are only transmitted directly between your machine");
    console.log("    and the official APIs (TMDB, OMDB, and your personal Firebase project).\n");
    
    const args = process.argv.slice(2).reduce((acc, arg) => {
        const [k, v] = arg.split('=');
        if (k && v) acc[k.replace('--', '')] = v;
        return acc;
    }, {});

    const isAgentMode = Object.keys(args).length > 0;
    
    if (isAgentMode) {
        console.log(yellow("[i] Agent Mode Detected: Using provided CLI arguments.\n"));
    } else {
        const start = await confirm("Ready to set up your personal tracker?");
        if (!start) {
            rl.close();
            return process.exit(0);
        }
    }
    
    console.log(cyan("\n--- Step 1: GDPR Data Location ---"));
    let dataDir = args.dataDir || "";
    while(!dataDir || !fs.existsSync(dataDir)) {
        if (isAgentMode) {
            console.log(red(`[x] Directory not found: ${dataDir}. Aborting agent run.`));
            process.exit(1);
        }
        dataDir = await input("Path to your GDPR data folder (e.g., ../data):");
        if (!fs.existsSync(dataDir)) console.log(red("[x] Directory not found. Please try again."));
    }
    
    console.log(cyan("\n--- Analyzing Data ---"));
    let shows = {};
    let movies = {};
    
    try {
        const followedCsv = fs.readFileSync(path.join(dataDir, "followed_tv_show.csv"), 'utf8');
        const records = parse(followedCsv, { columns: true, skip_empty_lines: true });
        for (const row of records) {
            if (row.tv_show_id) shows[row.tv_show_name] = { id: row.tv_show_id, name: row.tv_show_name, episodes_seen: [], status: "following" };
        }
    } catch(e) {}
    
    try {
        const trkCsv = fs.readFileSync(path.join(dataDir, "tracking-prod-records-v2.csv"), 'utf8');
        const trkRecords = parse(trkCsv, { columns: true, skip_empty_lines: true });
        for (const row of trkRecords) {
            const series_name = row.series_name;
            if (!series_name) continue;
            if (!shows[series_name]) shows[series_name] = { id: series_name, name: series_name, episodes_seen: [], status: "started" };
            
            const season = parseInt(row.season_number) || 0;
            const ep_num = parseInt(row.episode_number) || 0;
            if (season && ep_num) {
                const exists = shows[series_name].episodes_seen.some(e => e.season === season && e.episode === ep_num);
                if (!exists) shows[series_name].episodes_seen.push({ season, episode: ep_num, date: row.created_at });
            }
        }
    } catch(e) {}
    
    try {
        const movCsv = fs.readFileSync(path.join(dataDir, "tracking-prod-records.csv"), 'utf8');
        const movRecords = parse(movCsv, { columns: true, skip_empty_lines: true });
        for (const row of movRecords) {
            if (row.entity_type === 'movie') {
                const name = row.movie_name;
                if (name && !movies[name]) {
                    movies[name] = { name, watch_count: parseInt(row.watch_count)||1, date: row.watch_date || row.created_at };
                }
            }
        }
    } catch(e) {}
    
    const numShows = Object.keys(shows).length;
    const numMovies = Object.keys(movies).length;
    const totalItems = numShows + numMovies;
    
    console.log(green(`[+] Found ${numShows} shows and ${numMovies} movies (${totalItems} total items).\n`));
    
    console.log(cyan("--- Step 2: API Keys ---"));
    console.log("TMDB handles shows/movies perfectly, but sometimes misses posters.");
    console.log("OMDB acts as a fallback for missing posters.");
    const omdbNeeded = Math.ceil(totalItems / 1000) || 1;
    console.log(`[i] OMDB free tier allows 1,000 requests/day. Based on your ${totalItems} items, you will need ${omdbNeeded} OMDB key(s).`);
    
    const tmdbKey = args.tmdbKey || await input("\n> Enter your free TMDB API Key (from themoviedb.org/settings/api):");
    const omdbKeys = args.omdbKeys ? args.omdbKeys.split(',') : [];
    if (!args.omdbKeys) {
        for (let i=0; i<omdbNeeded; i++) {
            const k = await input(`> Enter OMDB API Key ${i+1}/${omdbNeeded} (from omdbapi.com/apikey.aspx):`);
            if(k) omdbKeys.push(k);
        }
    }
    
    console.log(cyan("\n--- Step 3: Firebase Config ---"));
    if (!isAgentMode) console.log("Go to Firebase Console -> Project Settings -> General -> Web Apps -> Config");
    const fbApi = args.fbApiKey || await input("> Firebase apiKey:");
    const fbAuth = args.fbAuthDomain || await input("> Firebase authDomain:");
    const fbProj = args.fbProjectId || await input("> Firebase projectId:");
    const fbBucket = args.fbStorageBucket || await input("> Firebase storageBucket:");
    const fbSender = args.fbMessagingSenderId || await input("> Firebase messagingSenderId:");
    const fbAppId = args.fbAppId || await input("> Firebase appId:");
    
    const envContent = `VITE_FIREBASE_API_KEY=${fbApi}\nVITE_FIREBASE_AUTH_DOMAIN=${fbAuth}\nVITE_FIREBASE_PROJECT_ID=${fbProj}\nVITE_FIREBASE_STORAGE_BUCKET=${fbBucket}\nVITE_FIREBASE_MESSAGING_SENDER_ID=${fbSender}\nVITE_FIREBASE_APP_ID=${fbAppId}\nVITE_TMDB_API_KEY=${tmdbKey}\nVITE_OMDB_API_KEYS=${omdbKeys.join(',')}\n`;
    fs.writeFileSync('.env', envContent);
    console.log(green("\n[+] Created .env file securely."));
    
    console.log(cyan("\n--- Step 4: Fetching Missing Data (Rate-Limit Safe) ---"));
    
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    async function fetchTmdb(url) {
        let attempts = 0;
        while(attempts < 3) {
            try {
                const res = await fetch(url);
                if (res.status === 429) {
                    await sleep(3000);
                    attempts++;
                    continue;
                }
                return await res.json();
            } catch(e) {
                await sleep(2000);
                attempts++;
            }
        }
        return null;
    }
    
    let omdbIndex = 0;
    async function fetchOmdb(query, type) {
        if(omdbKeys.length === 0) return null;
        let attempts = 0;
        while(attempts < 3) {
            const key = omdbKeys[omdbIndex];
            try {
                const res = await fetch(`http://www.omdbapi.com/?t=${encodeURIComponent(query)}&type=${type}&apikey=${key}`);
                const data = await res.json();
                if (data.Response === 'False' && data.Error && data.Error.includes('limit')) {
                    omdbIndex = (omdbIndex + 1) % omdbKeys.length;
                    attempts++;
                    continue;
                }
                return data;
            } catch(e) {
                attempts++;
            }
        }
        return null;
    }
    
    const showList = Object.values(shows);
    const movieList = Object.values(movies);
    
    // TMDB free tier allows exactly 40 requests per 10 seconds. (1 request every 250ms).
    // To be perfectly safe, we'll sleep 300ms after every request.
    const barShows = new cliProgress.SingleBar({ format: 'Shows  |' + cyan('{bar}') + '| {percentage}% | {value}/{total}' }, cliProgress.Presets.shades_classic);
    barShows.start(showList.length, 0);
    
    for (let i=0; i<showList.length; i++) {
        const s = showList[i];
        barShows.update(i);
        
        let tmdbData = null;
        if (s.id && !isNaN(parseInt(s.id))) {
            const fRes = await fetchTmdb(`https://api.themoviedb.org/3/find/${s.id}?api_key=${tmdbKey}&external_source=tvdb_id`);
            if (fRes?.tv_results?.length) tmdbData = fRes.tv_results[0];
            await sleep(300);
        }
        if (!tmdbData) {
            const sRes = await fetchTmdb(`https://api.themoviedb.org/3/search/tv?api_key=${tmdbKey}&query=${encodeURIComponent(s.name)}`);
            if (sRes?.results?.length) tmdbData = sRes.results[0];
            await sleep(300);
        }
        
        if (tmdbData) {
            s.tmdb_id = tmdbData.id;
            s.poster_path = tmdbData.poster_path;
            s.overview = tmdbData.overview;
            
            const det = await fetchTmdb(`https://api.themoviedb.org/3/tv/${tmdbData.id}?api_key=${tmdbKey}`);
            if (det) {
                s.genres = (det.genres||[]).map(g => g.name);
                s.networks = (det.networks||[]).map(n => n.name);
                s.number_of_episodes = det.number_of_episodes || 0;
            }
            await sleep(300);
        } else {
            const oRes = await fetchOmdb(s.name, 'series');
            if (oRes && oRes.Response === 'True') {
                s.full_poster_url = oRes.Poster;
                s.overview = oRes.Plot;
                s.genres = (oRes.Genre||'').split(',').map(g=>g.trim());
                s.number_of_episodes = parseInt(oRes.totalSeasons||0)*10;
            }
            await sleep(100);
        }
    }
    barShows.update(showList.length);
    barShows.stop();
    
    const barMovies = new cliProgress.SingleBar({ format: 'Movies |' + magenta('{bar}') + '| {percentage}% | {value}/{total}' }, cliProgress.Presets.shades_classic);
    barMovies.start(movieList.length, 0);
    
    for (let i=0; i<movieList.length; i++) {
        const m = movieList[i];
        barMovies.update(i);
        
        const mRes = await fetchTmdb(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(m.name)}`);
        if (mRes?.results?.length) {
            m.tmdb_id = mRes.results[0].id;
            m.poster_path = mRes.results[0].poster_path;
            m.overview = mRes.results[0].overview;
        } else {
            const oRes = await fetchOmdb(m.name, 'movie');
            if (oRes && oRes.Response === 'True') {
                m.full_poster_url = oRes.Poster;
            }
        }
        await sleep(300);
    }
    barMovies.update(movieList.length);
    barMovies.stop();
    
    const missingShows = showList.filter(s => !s.tmdb_id).length;
    const missingMovies = movieList.filter(m => !m.tmdb_id).length;
    console.log(green(`\n[+] Fetch complete! Items without TMDB ID: ${missingShows} shows, ${missingMovies} movies.`));
    
    console.log(cyan("\n--- Step 5: Uploading to Firebase ---"));
    console.log("[i] Pushing your data natively to Firebase...");
    
    const app = initializeApp({
        apiKey: fbApi,
        authDomain: fbAuth,
        projectId: fbProj,
        storageBucket: fbBucket,
        messagingSenderId: fbSender,
        appId: fbAppId
    });
    const db = getFirestore(app);
    
    let uploaded = 0;
    
    for (const s of showList) {
        if (!s.tmdb_id) continue;
        const sid = String(s.tmdb_id);
        
        await setDoc(doc(db, "added", `tv_${sid}`), {
            media_type: "tv",
            tmdb_id: s.tmdb_id,
            name: s.name,
            poster_path: s.poster_path || "",
            overview: s.overview || "",
            genres: s.genres || []
        });
        
        const ep_seen = s.episodes_seen || [];
        if (ep_seen.length > 0) {
            const ep_dict = {};
            for (const ep of ep_seen) ep_dict[`${ep.season}-${ep.episode}`] = { date: ep.date || new Date().toISOString() };
            await setDoc(doc(db, "episodeProgress", sid), {
                watched: ep_seen.length,
                total: s.number_of_episodes || 0,
                episodes: ep_dict
            });
        }
        
        if (s.status === 'watch_later') {
            await setDoc(doc(db, "showStatus", sid), { status: "watch_later", updatedAt: new Date().toISOString() });
        } else if (ep_seen.length > 0 && ep_seen.length < (s.number_of_episodes||999)) {
            await setDoc(doc(db, "showStatus", sid), { status: "watching", updatedAt: new Date().toISOString() });
        }
        uploaded++;
    }
    
    for (const m of movieList) {
        if (!m.tmdb_id) continue;
        const mid = String(m.tmdb_id);
        
        await setDoc(doc(db, "added", `movie_${mid}`), {
            media_type: "movie",
            tmdb_id: m.tmdb_id,
            name: m.name,
            poster_path: m.poster_path || "",
            overview: m.overview || ""
        });
        
        if (m.watch_count > 0) {
            await setDoc(doc(db, "movieWatches", mid), {
                watches: m.watch_count,
                lastWatched: m.date || new Date().toISOString()
            });
        }
        uploaded++;
    }
    
    console.log(green(`\n[+] Database seeded successfully with ${uploaded} items!`));
    console.log(cyan("\n=================================================="));
    console.log(cyan("  ALL SET! Your tracker is ready to go."));
    console.log("  1. Run 'npm run build'");
    console.log("  2. Run 'firebase deploy --only hosting'");
    console.log(cyan("==================================================\n"));
    
    rl.close();
    process.exit(0);
}

main().catch(err => {
    console.log(red(`\n[x] An error occurred: ${err.message}`));
    rl.close();
    process.exit(1);
});
