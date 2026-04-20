const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

// --- CONFIGURATION ---
const STRAPI_URL = process.env.STRAPI_URL || 'https://staging-event-cms.leapscholar.com';
const JWT_TOKEN = process.env.STRAPI_JWT || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5N2I5Zjk3NDhkZTU2MDAxMjUzYzk2MSIsImlhdCI6MTc3NjUxODQxNCwiZXhwIjoxNzc5MTEwNDE0fQ.CxN5Y8LzLH8JQadt8JzZXtoeZVyX8Ddtwvdel1sqKSI';
const CSV_SOURCE = process.env.CSV_SOURCE || '/Users/pratyushmalviya/Desktop/strapi upload assest/mentor profile/mentor_profiles_test.csv';
const COLLECTION_NAME = 'mentor-profiles';

// How many records to fetch per page from Strapi
const PAGE_SIZE = 100;

const api = axios.create({
    baseURL: STRAPI_URL,
    headers: { Authorization: `Bearer ${JWT_TOKEN}` }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function formatAreaOfExpertise(row) {
    const items = [];
    for (let i = 1; i <= 3; i++) {
        const area = row[`Area_${i}`]?.trim();
        const tags = row[`Tags_${i}`]?.trim();
        if (area || tags) {
            items.push({
                area: area || undefined,
                tags: tags || undefined
            });
        }
    }
    return items.length > 0 ? items : undefined;
}

function toNum(val) {
    if (!val || val.trim() === '') return undefined;
    const n = parseFloat(val.trim().replace(/[^\d.-]/g, ''));
    return isNaN(n) ? undefined : n;
}

function toRichText(text) {
    if (!text?.trim()) return undefined;
    const lines = text.trim().split('\n').filter(Boolean);
    const blocks = lines.map(line => ({
        type: 'paragraph',
        children: [{ type: 'text', text: line.trim() }]
    }));
    return JSON.stringify(blocks);
}

function formatAboutSection(row) {
    return {
        bio: row.Bio?.trim() || '',
        education: row.Education?.trim() || '',
        experience: row.Experience?.trim() || '',
        location: row.Location?.trim() || ''
    };
}

function formatMetrics(row) {
    return {
        studentsHelped: toNum(row.StudentsHelped),
        sessionsHosted: toNum(row.SessionHosted),
        averageRating: toNum(row.AverageRating)
    };
}

function isTrue(val) {
    return val?.trim().toUpperCase() === 'TRUE';
}

/** Build the payload object from a CSV row (undefined values stripped) */
function buildPayload(row) {
    const payload = {
        slug: row.Slug?.trim(),
        name: row.Name?.trim() || undefined,
        oneLineHeading: row.OneLineHeading?.trim() || undefined,
        areaOfExpertise: formatAreaOfExpertise(row),
        aboutSection: formatAboutSection(row),
        metrics: formatMetrics(row),
        successRate: row.SuccessRate?.trim() || undefined,
        show_1to1_widget: isTrue(row.Show_1to1_widget),
        availableForMentorshipTag: isTrue(row.Available_for_mentorship_tag),
        showTestimonials: isTrue(row.Show_testimonials),
        showSessionHighlights: isTrue(row.Show_session_highlights),
        interestedEmails: row.InterestedEmails?.trim()
            ? `{${row.InterestedEmails.split(',').map(e => `"${e.trim()}"`).join(',')}}`
            : undefined,
        is_ready_for_paid_sessions: isTrue(row['Is_ready_for_paid_sessions.']),
        session_price: toNum(row.Session_price),
        payment_link: row.Payment_link?.trim() || undefined,
        mentor_linkedin: row.Mentor_linkedin?.trim() || undefined,
        mentor_instagram: row.Mentor_instagram?.trim() || undefined,
        mentor_youtube: row.Mentor_youtube?.trim() || undefined,
        email: row.Email?.trim() || undefined,
        whats_included: toRichText(row.Whats_included),
        mobile_number: toNum(row.Mobile_number)
    };

    // Strip undefined values
    Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) delete payload[key];
    });

    return payload;
}

// ---------------------------------------------------------------------------
// CHANGE DETECTION
// ---------------------------------------------------------------------------

/**
 * Deep-compare two values. Handles primitives, arrays (as JSON), and objects.
 * Returns true if they are considered equal.
 */
function valuesEqual(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    // Both are objects (includes arrays) — compare via JSON
    if (typeof a === 'object' || typeof b === 'object') {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    // Loose numeric comparison (Strapi sometimes returns numbers as strings)
    if (!isNaN(a) && !isNaN(b)) return Number(a) === Number(b);

    return String(a).trim() === String(b).trim();
}

/**
 * Compare the CSV-derived payload against the existing Strapi record.
 * Returns an object with only the fields that differ, or null if nothing changed.
 */
function getDiff(payload, existingRecord) {
    // Fields to check — everything in the payload
    const changedFields = {};

    for (const key of Object.keys(payload)) {
        const csvVal = payload[key];
        const strapiVal = existingRecord[key];

        if (!valuesEqual(csvVal, strapiVal)) {
            changedFields[key] = csvVal; // will be sent in the update body
        }
    }

    return Object.keys(changedFields).length > 0 ? changedFields : null;
}

// ---------------------------------------------------------------------------
// FETCH ALL EXISTING RECORDS FROM STRAPI (paginated)
// ---------------------------------------------------------------------------

async function fetchAllExistingRecords() {
    console.log(`\n🔍 Fetching all existing records from Strapi (${COLLECTION_NAME})...`);
    const allRecords = [];
    let page = 1;

    while (true) {
        try {
            // Try Strapi v4 pagination first
            const res = await api.get(`/api/${COLLECTION_NAME}`, {
                params: {
                    'pagination[page]': page,
                    'pagination[pageSize]': PAGE_SIZE,
                    populate: '*'
                }
            });

            const data = res.data?.data || res.data || [];
            const records = Array.isArray(data) ? data : [];

            // Normalize Strapi v4 format ({ id, attributes }) -> flat object
            const normalized = records.map(r => {
                if (r.attributes) {
                    return { id: r.id, ...r.attributes };
                }
                return r;
            });

            allRecords.push(...normalized);

            // Check if there are more pages
            const pagination = res.data?.meta?.pagination;
            if (!pagination || page >= pagination.pageCount) break;
            page++;
        } catch (err) {
            // Fallback: try without /api/ prefix (Strapi v3)
            if (page === 1) {
                try {
                    const res = await api.get(`/${COLLECTION_NAME}`, {
                        params: { _limit: -1 }
                    });
                    const records = Array.isArray(res.data) ? res.data : res.data?.data || [];
                    allRecords.push(...records);
                    console.log(`   ℹ️  Using Strapi v3 API style`);
                    break;
                } catch (err2) {
                    console.error('❌ Could not fetch existing records:', err2.message);
                    break;
                }
            } else {
                break;
            }
        }
    }

    // Build a lookup map: slug -> record
    const slugMap = {};
    for (const record of allRecords) {
        if (record.slug) slugMap[record.slug] = record;
    }

    console.log(`   ✅ Found ${allRecords.length} existing records in Strapi.\n`);
    return slugMap;
}

// ---------------------------------------------------------------------------
// PROCESS A SINGLE ROW
// ---------------------------------------------------------------------------

async function processSingleRow(row, index, existingSlugMap, isV4) {
    const slug = row.Slug?.trim();
    if (!slug) {
        console.log(`[Row ${index + 1}] ⚠️  Skipping — No Slug found`);
        return 'skipped';
    }

    try {
        const payload = buildPayload(row);
        const existingRecord = existingSlugMap[slug] || null;

        if (existingRecord) {
            // --- EXISTING RECORD: check if anything changed ---
            const diff = getDiff(payload, existingRecord);

            if (!diff) {
                console.log(`[Row ${index + 1}] ${slug.padEnd(35)} | ⏭️  NO CHANGE — Skipped`);
                return 'unchanged';
            }

            const entryId = existingRecord.id || existingRecord._id;
            const updateBody = isV4 ? { data: diff } : diff;
            await api.put(isV4 ? `/api/${COLLECTION_NAME}/${entryId}` : `/${COLLECTION_NAME}/${entryId}`, updateBody);
            const changedKeys = Object.keys(diff).join(', ');
            console.log(`[Row ${index + 1}] ${slug.padEnd(35)} | 🔄 UPDATED (ID: ${entryId}) — Fields: ${changedKeys}`);
            return 'updated';
        } else {
            // --- NEW RECORD: create it ---
            const createBody = isV4 ? { data: payload } : payload;
            await api.post(isV4 ? `/api/${COLLECTION_NAME}` : `/${COLLECTION_NAME}`, createBody);
            console.log(`[Row ${index + 1}] ${slug.padEnd(35)} | ✨ CREATED NEW`);
            return 'created';
        }
    } catch (err) {
        if (err.response) {
            console.error(`      Status: ${err.response.status} | URL: ${err.config?.url}`);
            console.error(`      Error: ${JSON.stringify(err.response.data)}`);
        } else {
            console.error(`      Error: ${err.message}`);
        }
        console.error(`[Row ${index + 1}] ${slug.padEnd(35)} | ❌ FAILED`);
        return 'failed';
    }
}

// ---------------------------------------------------------------------------
// DETECT STRAPI API VERSION
// ---------------------------------------------------------------------------

async function detectStrapiVersion() {
    try {
        await api.get(`/api/${COLLECTION_NAME}`, { params: { 'pagination[pageSize]': 1 } });
        console.log('   ℹ️  Detected Strapi v4 API style (/api/ prefix)\n');
        return true;
    } catch {
        console.log('   ℹ️  Detected Strapi v3 API style (no /api/ prefix)\n');
        return false;
    }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function run() {
    let csvStream;

    if (CSV_SOURCE.startsWith('http')) {
        console.log(`\n📥 Downloading CSV from URL: ${CSV_SOURCE}`);
        const response = await axios.get(CSV_SOURCE, { responseType: 'stream' });
        csvStream = response.data;
    } else {
        if (!fs.existsSync(CSV_SOURCE)) {
            console.error(`❌ Source not found: ${CSV_SOURCE}`);
            process.exit(1);
        }
        csvStream = fs.createReadStream(CSV_SOURCE);
    }

    console.log(`\n🚀 STARTING SMART SYNC for [${COLLECTION_NAME}] → ${STRAPI_URL}`);
    console.log('   Only changed/new rows will be updated or created.\n');

    // Detect API version
    const isV4 = await detectStrapiVersion();

    // Fetch ALL existing records upfront (one batch) and build slug map
    const existingSlugMap = await fetchAllExistingRecords();

    // Parse CSV
    const allRows = await new Promise((resolve, reject) => {
        const rows = [];
        csvStream.pipe(csv())
            .on('data', (data) => rows.push(data))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });

    console.log(`📋 CSV contains ${allRows.length} row(s). Processing...\n`);

    // Stats counters
    const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };

    for (let i = 0; i < allRows.length; i++) {
        const result = await processSingleRow(allRows[i], i, existingSlugMap, isV4);
        if (result) stats[result] = (stats[result] || 0) + 1;

        // Small delay to avoid rate-limiting (skip delay after last row)
        if (i < allRows.length - 1) await sleep(1000);
    }

    console.log('\n' + '─'.repeat(65));
    console.log('✅ SYNC COMPLETE');
    console.log(`   ✨ Created  : ${stats.created}`);
    console.log(`   🔄 Updated  : ${stats.updated}`);
    console.log(`   ⏭️  Unchanged: ${stats.unchanged}`);
    console.log(`   ⚠️  Skipped  : ${stats.skipped}`);
    console.log(`   ❌ Failed   : ${stats.failed}`);
    console.log('─'.repeat(65) + '\n');
}

run().catch(err => {
    console.error('❌ Fatal Error:', err.message);
    process.exit(1);
});
