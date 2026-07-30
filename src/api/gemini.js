import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "../firebase";

const CACHE_PREFIX = "gemini:analysis:";

function cacheGet(key) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    return JSON.parse(item);
  } catch { return null; }
}

function cacheSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// Initialize the Firebase AI service and the generative model
const ai = getAI(app);
const model = getGenerativeModel(ai, { 
  model: "gemini-1.5-flash",
  generationConfig: {
    responseMimeType: "application/json"
  }
});

export async function analyzeMediaWithGemini(title, year, type) {
  if (!title) return null;
  
  const cacheKey = `${CACHE_PREFIX}${type}:${title}:${year || 'unknown'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const prompt = `Analyze the ${type} "${title}" ${year ? `(${year})` : ''}. 
Answer ONLY with a valid JSON object exactly like this:
{"woke": true/false, "sex_scenes": true/false}
Set "woke" to true if audiences heavily criticize it for forced diversity, race-swapping, political correctness, or modern sociopolitical themes.
Set "sex_scenes" to true if it contains explicit sex scenes or heavy nudity.`;

  try {
    const result = await model.generateContent(prompt);
    const textRes = result.response.text();
    if (!textRes) throw new Error("Invalid Gemini response format");

    const parsed = JSON.parse(textRes);
    cacheSet(cacheKey, parsed);
    return parsed;
  } catch (e) {
    console.error("Firebase Vertex AI analysis failed", e);
    return null;
  }
}
