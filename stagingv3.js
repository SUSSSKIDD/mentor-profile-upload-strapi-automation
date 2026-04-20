const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');

// --- CONFIGURATION ---
const STRAPI_URL = 'https://staging-event-cms.leapscholar.com';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5N2I5Zjk3NDhkZTU2MDAxMjUzYzk2MSIsImlhdCI6MTc3MjUzMzE1NSwiZXhwIjoxNzc1MTI1MTU1fQ.RbGrqqshw9fntuIyaQeHl7Hk68fQnnWikY0Xo-jbDEo';

const CSV_FILE = '/Users/pratyushmalviya/Desktop/strapi upload assest/V3 ecomm/Untitled spreadsheet - Sheet1-6.csv'; // Update this path before running!

const COLLECTION_NAME = 'ecommerceifications';

const api = axios.create({
    baseURL: STRAPI_URL,
    headers: { Authorization: `Bearer ${JWT_TOKEN}` }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to format Expert_session component (single component with 2 sub-fields)
function formatExpertSession(row) {
    const mwebLink = row.Expert_session_Mweb_imagekit_link?.trim();
    const webLink = row.Expert_session_Web_imagekit_link?.trim();

    if (!mwebLink && !webLink) return undefined;

    return {
        mweb_imagekit_link: mwebLink || undefined,
        web_imagekit_link: webLink || undefined
    };
}

// Helper function to format What_your_report_includes component array (up to 3 items, each with 7 sub-fields)
function formatWhatYourReportIncludes(row) {
    const items = [];

    for (let i = 1; i <= 3; i++) {
        const prefix = `What_your_report_includes_${i}_`;
        const description = row[`${prefix}Description`]?.trim();
        const mwebLink = row[`${prefix}Mweb_imagekit_link`]?.trim();
        const webLink = row[`${prefix}Web_imagekit_link`]?.trim();
        const isCTAVisible = row[`${prefix}IsCTAVisible`];
        const modalHeader = row[`${prefix}Modal_header`]?.trim();
        const modalSubheader = row[`${prefix}Modal_subheader`]?.trim();
        const longImageUrl = row[`${prefix}Long_image_url`]?.trim();

        // Only add if at least one field has data
        if (description || mwebLink || webLink || modalHeader || modalSubheader || longImageUrl) {
            items.push({
                description: description || undefined,
                mweb_imagekit_link: mwebLink || undefined,
                web_imagekit_link: webLink || undefined,
                isCTAVisible: isCTAVisible?.trim().toLowerCase() === 'true',
                modal_header: modalHeader || undefined,
                modal_subheader: modalSubheader || undefined,
                long_image_url: longImageUrl || undefined
            });
        }
    }

    return items.length > 0 ? items : undefined;
}

// Helper function to format Success_stories component array (up to 5 items, each with 1 sub-field)
function formatSuccessStories(row) {
    const items = [];

    for (let i = 1; i <= 5; i++) {
        const carouselLink = row[`Success_stories_${i}_Carousel_imagekit_link`]?.trim();

        if (carouselLink) {
            items.push({
                carousel_imagekit_link: carouselLink
            });
        }
    }

    return items.length > 0 ? items : undefined;
}

// Helper function to format variant_b and variant_c components
function formatVariant(row, variantPrefix) {
    const basePrefix = `${variantPrefix}_`;

    // Helper for case-insensitive row access
    const getRowVal = (key) => {
        const foundKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
        return foundKey ? row[foundKey]?.trim() : undefined;
    };

    // Looped Video
    const loopedVideo = {
        web_image_url: getRowVal(`${basePrefix}looped_video_Web_image_url`),
        mweb_image_url: getRowVal(`${basePrefix}looped_video_Mweb_Image_url`),
        web_video_url: getRowVal(`${basePrefix}looped_video_Web_video_url`),
        mweb_video_url: getRowVal(`${basePrefix}looped_video_Mweb_video_url`)
    };

    // Expert Session
    const expertSession = {
        web_image_url: getRowVal(`${basePrefix}expert_session_Web_image_url`),
        mweb_image_url: getRowVal(`${basePrefix}expert_session_Mweb_Image_url`)
    };

    // What You Will Get (Repeatable)
    const whatYouWillGet = [];
    for (let i = 1; i <= 3; i++) {
        const wWeb = getRowVal(`${basePrefix}what_you_will_get_${i}_Web_image_url`);
        const wMweb = getRowVal(`${basePrefix}what_you_will_get_${i}_Mweb_Image_url`);
        if (wWeb || wMweb) {
            whatYouWillGet.push({ web_image_url: wWeb, mweb_image_url: wMweb });
        }
    }

    // How It Works
    const howItWorks = {
        web_image_url: getRowVal(`${basePrefix}how_it_works_Web_image_url`),
        mweb_image_url: getRowVal(`${basePrefix}how_it_works_Mweb_Image_url`)
    };

    // Form Details
    const formDetails = {
        section_title: getRowVal(`${basePrefix}form_details_section_title`),
        section_subtitle: getRowVal(`${basePrefix}form_details_section_subtitle`)
    };

    // Slot Booking Details
    const slotBookingDetails = {
        slot_booking_heading: getRowVal(`${basePrefix}slot_booking_details_slot_booking_heading`),
        slot_booking_subheading: getRowVal(`${basePrefix}slot_booking_details_slot_booking_subheading`)
    };

    // Phone Section Banner Image
    const phoneSectionBanner = {
        web_image_url: getRowVal(`${basePrefix}Phone_section_banner_image_Web_image_url`),
        mweb_image_url: getRowVal(`${basePrefix}Phone_section_banner_image_Mweb_image_url`),
        heading: getRowVal(`${basePrefix}Phone_section_banner_image_Heading`),
        subheading: getRowVal(`${basePrefix}Phone_section_banner_image_Subheading`)
    };

    // Gradient Colors
    const gradientColors = {
        start_color: getRowVal(`${basePrefix}Gradient_colors_Start_color`),
        end_color: getRowVal(`${basePrefix}Gradient_colors_End_color`)
    };

    // Slot Page Banner Image
    const slotPageBannerImage = {
        web_image_url: getRowVal(`${basePrefix}Slot_page_banner_image_Web_image_url`),
        mweb_image_url: getRowVal(`${basePrefix}Slot_page_banner_image_Mweb_image_url`)
    };

    const result = {
        looped_video: (loopedVideo.web_image_url || loopedVideo.mweb_image_url || loopedVideo.web_video_url || loopedVideo.mweb_video_url) ? loopedVideo : undefined,
        heading: getRowVal(`${basePrefix}heading`),
        subHeading: getRowVal(`${basePrefix}subHeading`),
        expert_session: (expertSession.web_image_url || expertSession.mweb_image_url) ? expertSession : undefined,
        what_you_will_get: whatYouWillGet.length > 0 ? whatYouWillGet : undefined,
        how_it_works: (howItWorks.web_image_url || howItWorks.mweb_image_url) ? howItWorks : undefined,
        form_details: (formDetails.section_title || formDetails.section_subtitle) ? formDetails : undefined,
        CTA_text: getRowVal(`${basePrefix}CTA_text`),
        slot_booking_details: (slotBookingDetails.slot_booking_heading || slotBookingDetails.slot_booking_subheading) ? slotBookingDetails : undefined,
        QE_form_text: getRowVal(`${basePrefix}QE_form_text`),
        phone_section_banner_image: (phoneSectionBanner.web_image_url || phoneSectionBanner.mweb_image_url || phoneSectionBanner.heading || phoneSectionBanner.subheading) ? phoneSectionBanner : undefined,
        gradient_colors: (gradientColors.start_color || gradientColors.end_color) ? gradientColors : undefined,
        slot_page_banner_image: (slotPageBannerImage.web_image_url || slotPageBannerImage.mweb_image_url) ? slotPageBannerImage : undefined
    };

    // Clean up undefined components
    Object.keys(result).forEach(key => {
        if (result[key] === undefined) delete result[key];
    });

    return Object.keys(result).length > 0 ? result : undefined;
}

async function processSingleRow(row, index) {
    const slug = row.Slug?.trim();
    if (!slug) {
        console.log(`[Row ${index + 1}] ⚠️  Skipping - No Slug found`);
        return;
    }

    try {
        // 1. Search for existing record by slug (lowercase)
        const searchRes = await api.get(`/${COLLECTION_NAME}`);
        const allRecords = searchRes.data || [];
        const existingRecord = allRecords.find(record => record.slug === slug) || null;

        // 2. Format components
        const expertSessionData = formatExpertSession(row);
        const whatYourReportIncludesData = formatWhatYourReportIncludes(row);
        const successStoriesData = formatSuccessStories(row);

        const variantBData = formatVariant(row, 'variant_b');
        const variantCData = formatVariant(row, 'variant_c');

        console.log(`      🏷️  Slug: ${slug}`);
        console.log(`      👨‍🏫 Expert Session: ${expertSessionData ? 'YES' : 'NO'}`);
        console.log(`      📊 What Your Report Includes: ${whatYourReportIncludesData?.length || 0} items`);
        console.log(`      ⭐ Success Stories: ${successStoriesData?.length || 0} items`);
        console.log(`      🅱️  Variant B: ${variantBData ? 'YES' : 'NO'}`);
        console.log(`      🅲  Variant C: ${variantCData ? 'YES' : 'NO'}`);

        // 3. Prepare Payload - ONLY the fields specified
        const payload = {
            // Core fields (4) - lowercase for Strapi
            slug: slug,
            heading: row.Heading?.trim() || undefined,
            subheading: row.Subheading?.trim() || undefined,
            faq_slug: row.Faq_Slug?.trim() || undefined,

            // Expert Session Component
            expert_session: expertSessionData,

            // What Your Report Includes Component
            what_your_report_includes: whatYourReportIncludesData,

            // Success Stories Component
            success_stories: successStoriesData,

            // Variant B and C
            variant_b: variantBData,
            variant_c: variantCData,

            // Root level CTA and Slot Booking
            CTA_text: row.CTA_text?.trim() || undefined,
            slot_booking_details: (row.Slot_booking_heading || row.Slot_booking_subheading) ? {
                slot_booking_heading: row.Slot_booking_heading?.trim(),
                slot_booking_subheading: row.Slot_booking_subheading?.trim()
            } : undefined
        };

        // Remove undefined values to avoid sending null fields
        Object.keys(payload).forEach(key => {
            if (payload[key] === undefined) {
                delete payload[key];
            }
        });

        console.log(`      📦 Payload Keys (${Object.keys(payload).length}): ${Object.keys(payload).join(', ')}`);

        if (existingRecord) {
            // Update existing record (Strapi v3)
            const entryId = existingRecord.id || existingRecord._id;
            await api.put(`/${COLLECTION_NAME}/${entryId}`, payload);
            console.log(`[Row ${index + 1}] ${slug.padEnd(30)} | 🔄 UPDATED (ID: ${entryId})`);
        } else {
            // Create new record (Strapi v3)
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

const allRows = [];

if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV not found: ${CSV_FILE}`);
    process.exit(1);
}

console.log(`\n🚀 STARTING IMPORT (Rate Limit Mode: 5 req/min) to ${STRAPI_URL}`);
console.log(`ℹ️  Mode: Ultra-Slow (1 row every ~70s)\n`);

fs.createReadStream(CSV_FILE)
    .pipe(csv())
    .on('data', (data) => allRows.push(data))
    .on('end', async () => {
        for (let i = 0; i < allRows.length; i++) {
            console.log(`\n⏳ Processing Row ${i + 1}/${allRows.length}...`);
            await processSingleRow(allRows[i], i);

            if (i < allRows.length - 1) {
                console.log('      🛑 Rate Limit Pause: Waiting 70s before next row...');
                await sleep(70000);
            }
        }
        console.log('\n✅ Import Complete.');
    });
