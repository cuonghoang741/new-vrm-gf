const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const sharp = require('sharp');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SOURCE_SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'character-assets';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing environment variables SUPABASE_URL or SUPABASE_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    console.log("Starting image compression script...");

    // 1. Ensure bucket exists and is public
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        console.error("Error listing buckets:", bucketError);
        return;
    }

    if (!buckets.find(b => b.name === BUCKET_NAME)) {
        console.log(`Creating public bucket: ${BUCKET_NAME}`);
        const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: 1048576, // 1MB
            allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png']
        });
        if (createError) {
            console.error("Error creating bucket:", createError);
            return;
        }
    }

    // 2. Fetch characters
    const { data: characters, error: fetchError } = await supabase
        .from('characters')
        .select('id, name, thumbnail_url, avatar');

    if (fetchError) {
        console.error("Error fetching characters:", fetchError);
        return;
    }

    console.log(`Found ${characters.length} characters to process.`);

    for (const character of characters) {
        console.log(`\n--- Processing character: ${character.name} (${character.id}) ---`);

        let updates = {};

        // Process Thumbnail
        if (character.thumbnail_url && character.thumbnail_url.startsWith('http')) {
            console.log(`  Compressing thumbnail...`);
            const smallThumbUrl = await processAndUpload(character.thumbnail_url, character.id, 'thumb');
            if (smallThumbUrl) {
                updates.small_thumb_url = smallThumbUrl;
                console.log(`  Small thumb: ${smallThumbUrl}`);
            }
        }

        // Process Avatar
        if (character.avatar && character.avatar.startsWith('http')) {
            console.log(`  Compressing avatar...`);
            const smallAvatarUrl = await processAndUpload(character.avatar, character.id, 'avatar');
            if (smallAvatarUrl) {
                updates.small_avatar = smallAvatarUrl;
                console.log(`  Small avatar: ${smallAvatarUrl}`);
            }
        }

        if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
                .from('characters')
                .update(updates)
                .eq('id', character.id);
            
            if (updateError) {
                console.error(`  Error updating character ${character.id}:`, updateError);
            } else {
                console.log(`  Character updated successfully.`);
            }
        } else {
            console.log(`  No updates needed.`);
        }
    }

    console.log("\nFinished processing all characters.");
}

async function processAndUpload(url, id, type) {
    try {
        // Download image
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // Compress and resize
        // We use WebP with lower quality (40) and smaller size (max 200px) for extreme optimization
        const compressedBuffer = await sharp(buffer)
            .resize(200, null, { // Fixed width 200px, preserves aspect ratio
                withoutEnlargement: true,
                fit: 'inside'
            })
            .webp({ 
                quality: 40,
                effort: 6 // Higher effort = better compression
            })
            .toBuffer();

        const fileName = `${id}/${type}_small.webp`;
        
        // Upload to storage
        const { data, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, compressedBuffer, {
                contentType: 'image/webp',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // Return public URL
        return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
    } catch (error) {
        console.error(`    Failed to process image (${type}):`, error.message);
        return null;
    }
}

main();
