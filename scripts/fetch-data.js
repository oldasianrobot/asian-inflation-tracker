#!/usr/bin/env node

/**
 * fetch-data.js
 * 
 * Fetches real grocery prices from SerpAPI Google Shopping
 * and demographic data from U.S. Census Bureau API.
 * 
 * Data Sources:
 *   - Prices: SerpAPI Google Shopping API (https://serpapi.com/google-shopping-api)
 *   - Demographics: U.S. Census Bureau ACS 5-Year Estimates
 *     - Table B02001_005E: Asian alone population
 *     - Table B01003_001E: Total population
 * 
 * Usage:
 *   SERPAPI_KEY=xxx CENSUS_API_KEY=xxx node scripts/fetch-data.js
 * 
 * Environment Variables:
 *   SERPAPI_KEY     - SerpAPI API key (required for price data)
 *   CENSUS_API_KEY  - Census Bureau API key (required for demographics)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATH = join(__dirname, '..', 'src', 'data.json');

// ─── Configuration ──────────────────────────────────────────────────

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const CENSUS_API_KEY = process.env.CENSUS_API_KEY;

const CITIES = [
    { id: 'sf', name: 'San Francisco, CA', location: 'San Francisco, California, United States', stateFips: '06', geoType: 'place', geoCode: '67000' },
    { id: 'la', name: 'Los Angeles, CA', location: 'Los Angeles, California, United States', stateFips: '06', geoType: 'place', geoCode: '44000' },
    { id: 'nyc', name: 'New York City, NY', location: 'New York, New York, United States', stateFips: '36', geoType: 'place', geoCode: '51000' },
    { id: 'fbc', name: 'Fort Bend County, TX', location: 'Sugar Land, Texas, United States', stateFips: '48', geoType: 'county', geoCode: '157' },
    { id: 'tac', name: 'Tacoma, WA', location: 'Tacoma, Washington, United States', stateFips: '53', geoType: 'place', geoCode: '70000' },
    { id: 'chd', name: 'Chandler, AZ', location: 'Chandler, Arizona, United States', stateFips: '04', geoType: 'place', geoCode: '12000' },
];

const ITEMS = [
    { id: 'soy_sauce', name: 'Soy Sauce', unit: '1L Bottle', query: 'soy sauce 1 liter bottle' },
    { id: 'rice', name: '20 lbs Bag of Rice', unit: '20 lbs', query: 'jasmine rice 20 lb bag' },
    { id: 'eggs', name: 'Eggs', unit: '1 Dozen', query: 'eggs large grade A 1 dozen' },
    { id: 'dumplings', name: 'Frozen Dumplings', unit: '22 oz Bag', query: 'frozen dumplings 22 oz bag' },
    { id: 'nori', name: 'Nori (Roasted Seaweed)', unit: '50 Sheets', query: 'roasted seaweed nori 50 sheets' },
    { id: 'kimchi', name: 'Kimchi', unit: '16 oz Jar', query: 'kimchi 16 oz jar' },
];

// Max history length (13 months = 1 year + current month)
const MAX_HISTORY = 13;

// ─── SerpAPI: Fetch Prices ──────────────────────────────────────────

/**
 * Fetch median price for a product from Google Shopping via SerpAPI.
 * Uses the top 5 results and takes the median to avoid outliers.
 */
async function fetchShoppingPrice(query, location) {
    const params = new URLSearchParams({
        engine: 'google_shopping',
        q: query,
        location: location,
        hl: 'en',
        gl: 'us',
        api_key: SERPAPI_KEY,
        num: '10',
    });

    const url = `https://serpapi.com/search.json?${params}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`  SerpAPI error for "${query}" in ${location}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const results = data.shopping_results || [];

        if (results.length === 0) {
            console.warn(`  No shopping results for "${query}" in ${location}`);
            return null;
        }

        // Extract prices from results
        const prices = results
            .map(r => {
                // SerpAPI returns price as string like "$8.49" or extracted_price as number
                if (r.extracted_price && typeof r.extracted_price === 'number' && r.extracted_price > 0) {
                    return r.extracted_price;
                }
                if (r.price) {
                    const match = r.price.replace(/,/g, '').match(/\$?([\d.]+)/);
                    if (match) return parseFloat(match[1]);
                }
                return null;
            })
            .filter(p => p !== null && p > 0 && p < 500) // Sanity filter
            .sort((a, b) => a - b);

        if (prices.length === 0) {
            console.warn(`  No valid prices extracted for "${query}" in ${location}`);
            return null;
        }

        // Take median of top 5 prices
        const top5 = prices.slice(0, 5);
        const medianIndex = Math.floor(top5.length / 2);
        const median = top5.length % 2 === 0
            ? (top5[medianIndex - 1] + top5[medianIndex]) / 2
            : top5[medianIndex];

        return Math.round(median * 100) / 100; // Round to 2 decimal places
    } catch (err) {
        console.error(`  SerpAPI fetch error for "${query}":`, err.message);
        return null;
    }
}

/**
 * Fetch all prices for all cities and items.
 * Returns: { [cityId]: { [itemId]: price } }
 */
async function fetchAllPrices() {
    const prices = {};

    for (const city of CITIES) {
        console.log(`📍 Fetching prices for ${city.name}...`);
        prices[city.id] = {};

        for (const item of ITEMS) {
            // Rate-limit: SerpAPI has per-second limits, small delay between calls
            await sleep(500);

            const price = await fetchShoppingPrice(item.query, city.location);
            if (price !== null) {
                prices[city.id][item.id] = price;
                console.log(`  ✅ ${item.name}: $${price.toFixed(2)}`);
            } else {
                console.log(`  ⚠️  ${item.name}: no price (will keep existing)`);
            }
        }
    }

    return prices;
}

// ─── Census API: Fetch Demographics ─────────────────────────────────

/**
 * Fetch Asian population and total population for a city/county from Census ACS 5-Year.
 */
async function fetchCityDemographics(city) {
    const year = '2022'; // Latest ACS 5-Year available
    const variables = 'B02001_005E,B01003_001E'; // Asian alone, Total population

    let geoParam;
    if (city.geoType === 'place') {
        geoParam = `place:${city.geoCode}`;
    } else if (city.geoType === 'county') {
        geoParam = `county:${city.geoCode}`;
    }

    const url = `https://api.census.gov/data/${year}/acs/acs5?get=${variables}&for=${geoParam}&in=state:${city.stateFips}&key=${CENSUS_API_KEY}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`  Census API error for ${city.name}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        // Response format: [[header...], [values...]]
        if (data.length < 2) return null;

        const [asianPop, totalPop] = [parseInt(data[1][0]), parseInt(data[1][1])];
        return { asianPopulation: asianPop, totalPopulation: totalPop };
    } catch (err) {
        console.error(`  Census API error for ${city.name}:`, err.message);
        return null;
    }
}

/**
 * Fetch state total population for calculating % of state.
 */
async function fetchStatePopulation(stateFips) {
    const year = '2022';
    const url = `https://api.census.gov/data/${year}/acs/acs5?get=B01003_001E&for=state:${stateFips}&key=${CENSUS_API_KEY}`;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (data.length < 2) return null;
        return parseInt(data[1][0]);
    } catch (err) {
        console.error(`  Census state pop error for ${stateFips}:`, err.message);
        return null;
    }
}

/**
 * Fetch demographics for all cities.
 * Returns: { [cityId]: { asianPopulation, stateTotalPopulation, asianPercentOfState } }
 */
async function fetchAllDemographics() {
    const demographics = {};
    const statePopCache = {};

    console.log('\n📊 Fetching Census demographic data...');

    for (const city of CITIES) {
        await sleep(200); // Be polite to Census API

        const cityData = await fetchCityDemographics(city);
        if (!cityData) {
            console.log(`  ⚠️  ${city.name}: Census data unavailable (will keep existing)`);
            continue;
        }

        // Cache state population to avoid duplicate calls
        if (!statePopCache[city.stateFips]) {
            statePopCache[city.stateFips] = await fetchStatePopulation(city.stateFips);
        }
        const statePop = statePopCache[city.stateFips];

        if (statePop) {
            const percentOfState = Math.round((cityData.asianPopulation / statePop) * 10000) / 100;
            demographics[city.id] = {
                asianPopulation: cityData.asianPopulation,
                stateTotalPopulation: statePop,
                asianPercentOfState: percentOfState,
            };
            console.log(`  ✅ ${city.name}: Asian pop ${cityData.asianPopulation.toLocaleString()}, State pop ${statePop.toLocaleString()}, ${percentOfState}%`);
        }
    }

    return demographics;
}

// ─── Data Assembly ──────────────────────────────────────────────────

/**
 * Load existing data.json to preserve history.
 */
function loadExistingData() {
    try {
        const raw = readFileSync(DATA_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch {
        console.log('⚠️  No existing data.json found, starting fresh.');
        return null;
    }
}

/**
 * Update price history: append new price, trim to MAX_HISTORY.
 */
function updateHistory(existingHistory, newPrice) {
    const history = [...(existingHistory || [])];
    if (newPrice !== null && newPrice !== undefined) {
        history.push(newPrice);
    }
    // Trim to MAX_HISTORY (keep most recent)
    while (history.length > MAX_HISTORY) {
        history.shift();
    }
    return history;
}

/**
 * Assemble the final data.json object.
 */
function assembleData(existingData, newPrices, newDemographics) {
    const data = {
        lastUpdated: new Date().toISOString(),
        cities: CITIES.map(city => {
            const existingCity = existingData?.cities?.find(c => c.id === city.id);
            const demo = newDemographics[city.id] || existingCity?.demographics || {
                asianPopulation: 0,
                stateTotalPopulation: 0,
                asianPercentOfState: 0,
            };

            return {
                id: city.id,
                name: city.name,
                demographics: demo,
            };
        }),
        items: ITEMS.map(item => ({
            id: item.id,
            name: item.name,
            unit: item.unit,
        })),
        prices: {},
    };

    for (const city of CITIES) {
        data.prices[city.id] = ITEMS.map(item => {
            // Get existing history for this item in this city
            const existingCityPrices = existingData?.prices?.[city.id] || [];
            const existingItemEntry = existingCityPrices.find(p => p.itemId === item.id);
            const existingHistory = existingItemEntry?.history || [];

            // New price from SerpAPI (may be null if fetch failed)
            const newPrice = newPrices[city.id]?.[item.id] ?? null;

            return {
                itemId: item.id,
                history: updateHistory(existingHistory, newPrice),
            };
        });
    }

    return data;
}

// ─── Utilities ──────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('🚀 Asian Foods Inflation Tracker — Data Fetch');
    console.log('='.repeat(50));

    if (!SERPAPI_KEY) {
        console.error('❌ SERPAPI_KEY environment variable is required.');
        console.log('   Register at: https://serpapi.com/users/sign_up');
        console.log('   Falling back to existing data.json...');
    }

    if (!CENSUS_API_KEY) {
        console.error('❌ CENSUS_API_KEY environment variable is required.');
        console.log('   Register at: https://api.census.gov/data/key_signup.html');
        console.log('   Falling back to existing demographics...');
    }

    const existingData = loadExistingData();

    // Fetch prices (only if API key is set)
    let newPrices = {};
    if (SERPAPI_KEY) {
        newPrices = await fetchAllPrices();
    }

    // Fetch demographics (only if API key is set)
    let newDemographics = {};
    if (CENSUS_API_KEY) {
        newDemographics = await fetchAllDemographics();
    }

    // If both keys are missing, just update the timestamp
    const data = assembleData(existingData, newPrices, newDemographics);

    // Write data.json
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 4), 'utf-8');
    console.log(`\n✅ Data written to ${DATA_PATH}`);
    console.log(`   Last updated: ${data.lastUpdated}`);

    // Summary
    const citiesWithPrices = Object.keys(newPrices).filter(
        cid => Object.values(newPrices[cid]).some(p => p !== null)
    ).length;
    const citiesWithDemo = Object.keys(newDemographics).length;
    console.log(`   Cities with fresh prices: ${citiesWithPrices}/${CITIES.length}`);
    console.log(`   Cities with Census data:  ${citiesWithDemo}/${CITIES.length}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
