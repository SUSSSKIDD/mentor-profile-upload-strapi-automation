const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const { Readable } = require('stream');

// --- CONFIGURATION ---
// Use environment variables for GitHub Actions or fallback to local constants
const STRAPI_URL = process.env.STRAPI_URL || 'https://staging-event-cms.leapscholar.com';
const JWT_TOKEN = process.env.STRAPI_JWT || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5N2I5Zjk3NDhkZTU2MDAxMjUzYzk2MSIsImlhdCI6MTc3NjUxODQxNCwiZXhwIjoxNzc5MTEwNDE0fQ.CxN5Y8LzLH8JQadt8JzZXtoeZVyX8Ddtwvdel1sqKSI';

// The CSV source can be a local path or a Google Sheets Publish URL
const CSV_SOURCE = process.env.CSV_SOURCE || '/Users/pratyushmalviya/Desktop/strapi upload assest/mentor profile/mentor_profiles_test.csv';

const COLLECTION_NAME = 'mentor-profiles';

const api = axios.create({
    baseURL: STRAPI_URL,
    headers: { Authorization: `Bearer ${JWT_TOKEN}` }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to format Area of Expertise component array
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

// Helper function to parse numbers safely
function toNum(val) {
    if (!val || val.trim() === '') return undefined;
    const n = parseFloat(val.trim().replace(/[^\d.-]/g, ''));
    return isNaN(n) ? undefined : n;
}

// Helper function to convert plain text to Strapi Rich Text JSON string format
function toRichText(text) {
    if (!text?.trim()) return undefined;
    const lines = text.trim().split('\n').filter(Boolean);
    const blocks = lines.map(line => ({
        type: 'paragraph',
        children: [{ type: 'text', text: line.trim() }]
    }));
    return JSON.stringify(blocks);
}

// Helper function to format About Section component
function formatAboutSection(row) {
    const bio = row.Bio?.trim();
    const education = row.Education?.trim();
    const experience = row.Experience?.trim();
    const location = row.Location?.trim();

    return {
        bio: bio || '',
        education: education || '',
        experience: experience || '',
        location: location || ''
    };
}

// Helper function to format Metrics component
function formatMetrics(row) {
    const studentsHelped = row.StudentsHelped?.trim();
    const sessionsHosted = row.SessionHosted?.trim();
    const averageRating = row.AverageRating?.trim();

    return {
        studentsHelped: toNum(studentsHelped),
        sessionsHosted: toNum(sessionsHosted),
        averageRating: toNum(averageRating)
    };
}

async function processSingleRow(row, index) {
    const slug = row.Slug?.trim();
    if (!slug) {
        console.log(`[Row ${index + 1}] ⚠️  Skipping - No Slug found`);
        return;
    }

    try {
        // 1. Search for existing record by slug
        const searchRes = await api.get(`/${COLLECTION_NAME}`);
        const allRecords = searchRes.data || [];
        const existingRecord = allRecords.find(record => record.slug === slug) || null;

        // 2. Format components
        const areaOfExpertiseData = formatAreaOfExpertise(row);
        const aboutSectionData = formatAboutSection(row);
        const metricsData = formatMetrics(row);

        const isTrue = (val) => val?.trim().toUpperCase() === 'TRUE';

        // 3. Prepare Payload
        const payload = {
            slug: slug,
            name: row.Name?.trim() || undefined,
            oneLineHeading: row.OneLineHeading?.trim() || undefined,
            areaOfExpertise: areaOfExpertiseData,
            aboutSection: aboutSectionData,
            metrics: metricsData,
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

        // Remove undefined values
        Object.keys(payload).forEach(key => {
            if (payload[key] === undefined) delete payload[key];
        });

        if (existingRecord) {
            const entryId = existingRecord.id || existingRecord._id;
            await api.put(`/${COLLECTION_NAME}/${entryId}`, payload);
            console.log(`[Row ${index + 1}] ${slug.padEnd(30)} | 🔄 UPDATED (ID: ${entryId})`);
        } else {
            await api.post(`/${COLLECTION_NAME}`, payload);
            console.log(`[Row ${index + 1}] ${slug.padEnd(30)} | ✨ CREATED NEW`);
        }

    } catch (err) {
        if (err.response) {
            console.error(`      Status: ${err.response.status} | URL: ${err.config.url}`);
            console.error(`      Error: ${JSON.stringify(err.response.data)}`);
        } else {
            console.error(`      Error: ${err.message}`);
        }
        console.error(`[Row ${index + 1}] ${slug.padEnd(30)} | ❌ FAILED`);
    }
}

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

    const allRows = [];
    console.log(`\n🚀 STARTING IMPORT for ${COLLECTION_NAME} to ${STRAPI_URL}\n`);

    csvStream.pipe(csv())
        .on('data', (data) => allRows.push(data))
        .on('end', async () => {
            for (let i = 0; i < allRows.length; i++) {
                console.log(`⏳ Processing Row ${i + 1}/${allRows.length}...`);
                await processSingleRow(allRows[i], i);

                if (i < allRows.length - 1) {
                    await sleep(2000); // 2s delay between rows
                }
            }
            console.log('\n✅ Import Complete.');
        });
}

run().catch(err => {
    console.error('❌ Fatal Error:', err.message);
    process.exit(1);
});
