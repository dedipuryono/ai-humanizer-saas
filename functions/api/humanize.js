/**
 * STEALTHCORE AI - HOLOGRAPHIC FEW-SHOT ENGINE v6.1 (BULLETPROOF APEX)
 * Features: D1 SQL IP Tracking, Smart Payload Truncation, The Trapdoor Paywall
 * Engine: Dual-Core Failover (Gemini 1.5 Flash -> Groq Llama 3 70B)
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
            return new Response(JSON.stringify({ error: "Access denied. Traffic anomaly detected." }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }

        let body;
        try {
            body = await request.json();
        } catch (e) {
            return new Response(JSON.stringify({ error: "Invalid JSON payload." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const { text } = body;

        if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 10000) {
            return new Response(JSON.stringify({ error: "Invalid payload or exceeds maximum limit (10,000 chars)." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. D1 DATABASE CHECK (The Trapdoor Logic)
        let isPro = false;
        let isLocked = false;
        
        const cleanInputText = text.replace(/\s+/g, ' ').trim();
        let wordsArr = cleanInputText.split(' ');
        let lockedWordCount = 0;

        if (DB) {
            try {
                const { results } = await DB.prepare(`SELECT * FROM ip_tracking WHERE ip_address = ?`).bind(clientIP).all();
                
                if (!results || results.length === 0) {
                    await DB.prepare(
                        `INSERT INTO ip_tracking (ip_address, free_uses_left, is_pro) VALUES (?, 0, 0)`
                    ).bind(clientIP).run();
                    isLocked = false; 
                } else {
                    const user = results[0];
                    if (user.is_pro === 1) {
                        isPro = true;
                        isLocked = false;
                    } else if (user.free_uses_left > 0) {
                        await DB.prepare(`UPDATE ip_tracking SET free_uses_left = free_uses_left - 1, total_requests = total_requests + 1 WHERE ip_address = ?`).bind(clientIP).run();
                        isLocked = false;
                    } else {
                        isLocked = true;
                        lockedWordCount = wordsArr.length > 150 ? wordsArr.length - 150 : 0;
                        if (wordsArr.length > 150) {
                            wordsArr = wordsArr.slice(0, 150);
                        }
                        await DB.prepare(`UPDATE ip_tracking SET total_requests = total_requests + 1 WHERE ip_address = ?`).bind(clientIP).run();
                    }
                }
            } catch (dbError) {
                console.error("D1 Database Error:", dbError);
                isLocked = false; 
            }
        }

        const processedInputText = wordsArr.join(" "); 
        
        // 3. THE HOLOGRAPHIC FEW-SHOT ENGINE
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
        let apiSuccess = false;

        const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(id);
                return response;
            } catch (error) {
                clearTimeout(id);
                throw error;
            }
        };

        // Attempt 1: Gemini Flash
        if (GEMINI_API_KEY) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
                const geminiResponse = await fetchWithTimeout(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nOriginal Text to Humanize:\n"""\n${processedInputText}\n"""` }] }],
                        generationConfig: { temperature: 0.85, topK: 40, topP: 0.80 }
                    })
                }, 15000);

                if (geminiResponse.ok) {
                    const geminiData = await geminiResponse.json();
                    if (geminiData.candidates && geminiData.candidates.length > 0 && geminiData.candidates[0].content?.parts?.[0]?.text) {
                        humanizedText = geminiData.candidates[0].content.parts[0].text;
                        apiSuccess = true;
                    }
                }
            } catch (e) {
                console.warn("Gemini Engine failed/timed out:", e.message);
            }
        }

        // Attempt 2: Groq LPU (Failover)
        if (!apiSuccess && GROQ_API_KEY) {
            try {
                const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
                const groqResponse = await fetchWithTimeout(groqUrl, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${GROQ_API_KEY}`, 
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({
                        model: "llama3-70b-8192",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: `Original Text to Humanize:\n"""\n${processedInputText}\n"""` }
                        ],
                        temperature: 0.85,
                        top_p: 0.80,
                        max_tokens: 3000
                    })
                }, 12000);

                if (groqResponse.ok) {
                    const groqData = await groqResponse.json();
                    if (groqData.choices && groqData.choices.length > 0 && groqData.choices[0].message?.content) {
                        humanizedText = groqData.choices[0].message.content;
                        apiSuccess = true;
                    }
                }
            } catch (e) {
                console.warn("Groq Engine failed/timed out:", e.message);
            }
        }

        if (!apiSuccess || !humanizedText) {
            return new Response(JSON.stringify({ error: "All AI inference nodes timed out or failed. Please check your API keys." }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 4. MICRO-SANITIZER
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
        return new Response(JSON.stringify({ error: "Server Internal Error: " + error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
