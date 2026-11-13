/**
 * COGNITIVE AI HUMANIZER - ENTERPRISE EDGE API v5.0 (GLOBAL)
 * Features: D1 SQL IP Tracking, Smart Payload Truncation, The Trapdoor Paywall
 * Engine: Dual-Core Failover (Gemini 1.5 Flash -> GPT-OSS-120B)
 * Intelligence: Global English Prompt, Strict Language Retention, Auto-Whitespace Sanitizer
 */

export async function onRequestPost(context) {
    try {
        const request = context.request;
        const DB = context.env.DB; // Binding to stealth_core_db
        
        // 1. FINGERPRINTING & IDENTIFICATION
        const clientIP = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
        const userAgent = request.headers.get('User-Agent') || 'unknown';
        
        // Anti-Bot & Scraper Protection
        if (userAgent === 'unknown' || userAgent.includes('curl') || userAgent.includes('python-requests')) {
            return new Response(JSON.stringify({ error: "Access denied. Traffic anomaly detected." }), { status: 403 });
        }

        const { text } = await request.json();

        if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 10000) {
            return new Response(JSON.stringify({ error: "Invalid payload or exceeds maximum limit (10,000 chars)." }), { status: 400 });
        }

        // 2. D1 DATABASE CHECK (The Trapdoor Logic)
        let isPro = false;
        let isLocked = false;
        
        // SANITIZATION PRE-PROCESS: Clean input whitespace before processing
        const cleanInputText = text.replace(/\s+/g, ' ').trim();
        let wordsArr = cleanInputText.split(' ');
        let lockedWordCount = 0;

        try {
            const { results } = await DB.prepare(`SELECT * FROM ip_tracking WHERE ip_address = ?`).bind(clientIP).all();
            
            if (results.length === 0) {
                // NEW USER: Grant 1x full free access
                await DB.prepare(
                    `INSERT INTO ip_tracking (ip_address, free_uses_left, is_pro) VALUES (?, 0, 0)`
                ).bind(clientIP).run();
                isLocked = false; 
            } else {
                // RETURNING USER
                const user = results[0];
                if (user.is_pro === 1) {
                    isPro = true;
                    isLocked = false;
                } else if (user.free_uses_left > 0) {
                    // Still has free quota (for future multi-free-tier features)
                    await DB.prepare(`UPDATE ip_tracking SET free_uses_left = free_uses_left - 1, total_requests = total_requests + 1 WHERE ip_address = ?`).bind(clientIP).run();
                    isLocked = false;
                } else {
                    // QUOTA EXHAUSTED -> ACTIVATE PAYWALL & SAVE TOKENS
                    isLocked = true;
                    lockedWordCount = wordsArr.length > 150 ? wordsArr.length - 150 : 0;
                    
                    // Smart Truncation: Only send the first 150 words to the AI to save compute costs
                    if (wordsArr.length > 150) {
                        wordsArr = wordsArr.slice(0, 150);
                    }
                    await DB.prepare(`UPDATE ip_tracking SET total_requests = total_requests + 1 WHERE ip_address = ?`).bind(clientIP).run();
                }
            }
        } catch (dbError) {
            console.error("D1 Database Error:", dbError);
            // Fall-open on DB failure: Lock the user to prevent financial bleed
            isLocked = true;
            lockedWordCount = wordsArr.length > 150 ? wordsArr.length - 150 : 0;
            if (wordsArr.length > 150) wordsArr = wordsArr.slice(0, 150);
        }

        const processedInputText = wordsArr.join(" "); 
        
        // 3. DUAL-CORE AI FAILOVER & GLOBAL ENTERPRISE PROMPT
        const GEMINI_API_KEY = context.env.GEMINI_API_KEY;
        const GROQ_API_KEY = context.env.GROQ_API_KEY;

        // Enterprise English Prompt: Ensures global language retention and zero AI footprint
        const systemPrompt = `You are an elite "Cognitive Linguistic Obfuscator", a senior SEO expert, and a master copy editor. Your primary directive is to restructure and paraphrase the input text to achieve a 0% AI detection score (bypassing Turnitin, GPTZero, Originality.ai) while strictly preserving the original semantic meaning, facts, and language.

MANDATORY PROTOCOLS (EXECUTE WITHOUT FAIL):
1. LANGUAGE RETENTION: You MUST write the output in the EXACT same language as the input text. NEVER translate the text. If the input is in English, output in English. If the input is in Indonesian, output in Indonesian.
2. PERPLEXITY INJECTION: Avoid predictive transition patterns (Markov Chains). Completely eradicate LLM cliché phrases like "In today's digital age," "It is important to note," "In conclusion," or "Delving into." Use advanced contextual synonyms and natural human idioms.
3. BURSTINESS MAXIMIZATION: Force extreme sentence length variation. Craft one highly analytical, complex compound sentence, followed immediately by a punchy, direct sentence (3-5 words). Humans think and write sporadically; mimic this rhythm.
4. COGNITIVE DISRUPTION: Do not create paragraphs of uniform length. Use active voice dominantly. If the context is academic, maintain an authoritative tone; if casual, use a conversational tone.
5. FACTUAL INTEGRITY: DO NOT alter any data, numbers, proper nouns, quotes, or core technical references.
6. STRICT OUTPUT SANITIZATION: RETURN ONLY THE PARAPHRASED TEXT. Do not include conversational fillers (e.g., "Here is the result:"), formatting markers, quotes, or meta-commentary. Do not use line breaks or newlines unless separating distinct paragraphs.`;

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
                signal: fetchTimeout(8000).signal,
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nOriginal Text to Humanize:\n"""\n${processedInputText}\n"""` }] }],
                    generationConfig: { temperature: 0.9, topK: 45, topP: 0.95 }
                })
            });

            if (!geminiResponse.ok) throw new Error("Gemini Fallback Triggered");
            const geminiData = await geminiResponse.json();
            
            if (!geminiData.candidates || geminiData.candidates.length === 0) throw new Error("Gemini empty response");
            humanizedText = geminiData.candidates[0].content.parts[0].text;

        } catch (error) {
            console.warn("Primary Engine Failed. Switching to Groq Node...", error.message);
            // ENGINE 2: GROQ LPU - GPT-OSS-120B (Failover)
            const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
            const groqResponse = await fetch(groqUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                signal: fetchTimeout(6000).signal,
                body: JSON.stringify({
                    model: "openai/gpt-oss-120b",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Original Text to Humanize:\n"""\n${processedInputText}\n"""` }
                    ],
                    temperature: 0.95,
                    max_tokens: 3000
                })
            });

            if (!groqResponse.ok) throw new Error("Critical: All nodes down.");
            const groqData = await groqResponse.json();
            humanizedText = groqData.choices[0].message.content;
        }

        // 4. POST-PROCESS SANITIZATION (The Whitespace Fix)
        // Removes all double spaces, rogue newlines, and random indents to ensure a pristine UI render
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
