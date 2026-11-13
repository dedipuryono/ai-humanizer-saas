/**
 * STEALTHCORE AI - HOLOGRAPHIC FEW-SHOT ENGINE v6.0 (APEX FORM)
 * Features: D1 SQL IP Tracking, Smart Payload Truncation, The Trapdoor Paywall
 * Engine: Dual-Core Failover (Gemini 1.5 Flash -> GPT-OSS-120B)
 * Intelligence: Holographic Entropy Injection, Vocabulary Blacklist, Strict Constraint Locks
 */

export async function onRequestPost(context) {
    try {
        const request = context.request;
        const DB = context.env.DB; // Binding ke stealth_core_db
        
        // 1. FINGERPRINTING & IDENTIFIKASI
        const clientIP = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
        const userAgent = request.headers.get('User-Agent') || 'unknown';
        
        // Anti-Bot & Scraper Protection
        if (userAgent === 'unknown' || userAgent.includes('curl') || userAgent.includes('python-requests')) {
            return new Response(JSON.stringify({ error: "Access denied. Traffic anomaly detected." }), { status: 403 });
        }

        const { text } = await request.json();

        if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 10000) {
            return new Response(JSON.stringify({ error: "Invalid payload or exceeds maximum limit." }), { status: 400 });
        }

        // 2. D1 DATABASE CHECK (The Trapdoor Logic)
        let isPro = false;
        let isLocked = false;
        
        // PRA-PEMROSESAN: Pembersihan spasi putih ekstrem
        const cleanInputText = text.replace(/\s+/g, ' ').trim();
        let wordsArr = cleanInputText.split(' ');
        let lockedWordCount = 0;

        try {
            const { results } = await DB.prepare(`SELECT * FROM ip_tracking WHERE ip_address = ?`).bind(clientIP).all();
            
            if (results.length === 0) {
                // PENGGUNA BARU: Berikan 1x akses penuh gratis
                await DB.prepare(
                    `INSERT INTO ip_tracking (ip_address, free_uses_left, is_pro) VALUES (?, 0, 0)`
                ).bind(clientIP).run();
                isLocked = false; 
            } else {
                // PENGGUNA LAMA
                const user = results[0];
                if (user.is_pro === 1) {
                    isPro = true;
                    isLocked = false;
                } else if (user.free_uses_left > 0) {
                    // Masih punya kuota gratis
                    await DB.prepare(`UPDATE ip_tracking SET free_uses_left = free_uses_left - 1, total_requests = total_requests + 1 WHERE ip_address = ?`).bind(clientIP).run();
                    isLocked = false;
                } else {
                    // KUOTA EXHAUSTED -> AKTIFKAN BLACKOUT PAYWALL
                    isLocked = true;
                    lockedWordCount = wordsArr.length > 150 ? wordsArr.length - 150 : 0;
                    
                    // Smart Truncation: Potong input HANYA 150 kata untuk menghemat biaya API
                    if (wordsArr.length > 150) {
                        wordsArr = wordsArr.slice(0, 150);
                    }
                    await DB.prepare(`UPDATE ip_tracking SET total_requests = total_requests + 1 WHERE ip_address = ?`).bind(clientIP).run();
                }
            }
        } catch (dbError) {
            console.error("D1 Database Error:", dbError);
            // Fall-open: Kunci pengguna agar sistem tidak rugi jika DB error
            isLocked = true;
            lockedWordCount = wordsArr.length > 150 ? wordsArr.length - 150 : 0;
            if (wordsArr.length > 150) wordsArr = wordsArr.slice(0, 150);
        }

        const processedInputText = wordsArr.join(" "); 
        
        // 3. THE HOLOGRAPHIC FEW-SHOT ENGINE (Inti Kesempurnaan)
        const GEMINI_API_KEY = context.env.GEMINI_API_KEY;
        const GROQ_API_KEY = context.env.GROQ_API_KEY;

        const systemPrompt = `You are an elite ghostwriter. Your singular task is to rewrite the input text so it scores 0% on all AI detectors, while maintaining the exact original meaning and professional tone.

THE 3 LAWS OF PHYSICS (MANDATORY):
1. THE CONSTRAINT LOCK: Your output word count MUST be within +/- 5% of the original. You MUST output in the EXACT same language as the input text. Never translate.
2. THE BLACKLIST: You are STRICTLY FORBIDDEN from using any of these AI cliché words or phrases: delve, tapestry, realm, foster, crucial, dynamic, landscape, amidst, relentless, beacon, testament, intricate, pivotal, overarching, paradigm, navigate, multifaceted, underscore, leverage, encapsulate, in conclusion, it is important to note.
3. HOLOGRAPHIC ENTROPY INJECTION: AI writes in balanced, predictable sentence lengths. Humans write asymmetrically. You must mimic true human burstiness.

HUMAN REFERENCE 1 (Analytical):
"The data shows a clear trend. While initial adoption was slow—largely due to interface friction—Q3 metrics indicate a 40% surge in daily active users. We missed the early signs. Moving forward, the focus shifts entirely to retention strategies."

HUMAN REFERENCE 2 (Narrative):
"It happens every time. A new framework drops, developers rush to rewrite their stack, and six months later they realize the legacy code was perfectly fine. The churn is exhausting. But occasionally, a tool comes along that actually justifies the hype."

FINAL INSTRUCTION: Analyze the jagged rhythm, blunt phrasing, and lack of robotic transitions in the Human References above. Apply this exact mathematical entropy to the user's input text. Return ONLY the rewritten text. No introductions, no formatting, no markdown.`;

        let humanizedText = "";
        const fetchTimeout = (ms) => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), ms);
            return controller;
        };

        try {
            // ENGINE 1: GEMINI FLASH (Primary)
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const geminiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: fetchTimeout(6000).signal,
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nOriginal Text to Humanize:\n"""\n${processedInputText}\n"""` }] }],
                    // Precision Parameters: Suhu kreatif terkendali & pemotongan probabilitas
                    generationConfig: { temperature: 0.85, topK: 40, topP: 0.80 }
                })
            });

            if (!geminiResponse.ok) throw new Error("Gemini Fallback Triggered");
            const geminiData = await geminiResponse.json();
            
            if (!geminiData.candidates || geminiData.candidates.length === 0) throw new Error("Gemini empty response");
            humanizedText = geminiData.candidates[0].content.parts[0].text;

        } catch (error) {
            console.warn("Primary Engine Failed. Switching to Groq Node...", error.message);
            // ENGINE 2: GROQ LPU (Failover)
            const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
            const groqResponse = await fetch(groqUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                signal: fetchTimeout(4000).signal,
                body: JSON.stringify({
                    model: "openai/gpt-oss-120b", // Pastikan ID model Groq valid sesuai dokumentasi terbaru mereka
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Original Text to Humanize:\n"""\n${processedInputText}\n"""` }
                    ],
                    temperature: 0.85,
                    top_p: 0.80,
                    max_tokens: 3000
                })
            });

            if (!groqResponse.ok) throw new Error("Critical: All nodes down.");
            const groqData = await groqResponse.json();
            humanizedText = groqData.choices[0].message.content;
        }

        // 4. MICRO-SANITIZER (Pembersihan Spasi Mutlak)
        // Membunuh semua enter ganda, tab, dan spasi yang merusak UI
        humanizedText = humanizedText.replace(/\s+/g, ' ').trim();

        // 5. SECURE DELIVERY
        return new Response(JSON.stringify({
            text: humanizedText,
            isLocked: isLocked,
            lockedWordCount: lockedWordCount
        }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
