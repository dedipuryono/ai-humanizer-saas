/**
 * COGNITIVE AI HUMANIZER - ENTERPRISE EDGE API v2.0
 * Security Update: Zero-Trust Server-Side Truncation, IP Fingerprinting, Anti-Leak
 */

export async function onRequestPost(context) {
    try {
        const request = context.request;
        
        // 1. IDENTIFIKASI KLIEN (IP Fingerprinting untuk Rate Limiting masa depan)
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        const userAgent = request.headers.get('User-Agent') || 'unknown';
        
        // Proteksi dasar dari Bot Scraper (Block non-browser requests)
        if (userAgent === 'unknown' || userAgent.includes('curl') || userAgent.includes('python-requests')) {
            return new Response(JSON.stringify({ error: "Akses API ditolak. Anomali trafik terdeteksi." }), { status: 403 });
        }

        const { text, userTier = 'free' } = await request.json(); // Menerima status tier dari frontend

        if (!text || text.trim().length === 0 || text.length > 10000) {
            return new Response(JSON.stringify({ error: "Payload teks tidak valid" }), { status: 400 });
        }

        const GEMINI_API_KEY = context.env.GEMINI_API_KEY;
        const GROQ_API_KEY = context.env.GROQ_API_KEY;

        const systemPrompt = `Anda adalah "Cognitive Linguistic Obfuscator" elit. Tugas Anda mem-bypass 100% deteksi algoritma NLP.
PROTOKOL WAJIB:
1. INJEKSI PERPLEXITY: Hindari frasa LLM. Gunakan kosakata kaya.
2. MAKSIMALISASI BURSTINESS: Variasikan panjang kalimat secara ekstrem (kalimat panjang analitis diikuti kalimat 3 kata).
3. DISRUPSI KOGNITIF: Buat transisi paragraf sedikit asimetris. Dominasi dengan kalimat aktif.
4. INTEGRITAS FAKTA: JANGAN ubah data, angka, atau makna asli.
5. HANYA kembalikan teks parafrase tanpa pembuka/penutup.`;

        let humanizedText = "";
        const fetchTimeout = (ms) => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), ms);
            return controller;
        };

        try {
            // ENGINE 1: GEMINI
            const geminiController = fetchTimeout(8000);
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const geminiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: geminiController.signal,
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTeks asli:\n"""\n${text}\n"""` }] }],
                    generationConfig: { temperature: 0.9, topK: 45, topP: 0.95 }
                })
            });

            if (!geminiResponse.ok) throw new Error("Gemini Fallback Triggered");
            const geminiData = await geminiResponse.json();
            humanizedText = geminiData.candidates[0].content.parts[0].text.trim();

        } catch (error) {
            // ENGINE 2: GROQ FAILOVER (GPT-OSS-120B)
            const groqController = fetchTimeout(6000);
            const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
            const groqResponse = await fetch(groqUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                signal: groqController.signal,
                body: JSON.stringify({
                    model: "openai/gpt-oss-120b", 
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Teks asli:\n"""\n${text}\n"""` }
                    ],
                    temperature: 0.95,
                    max_tokens: 3000
                })
            });

            if (!groqResponse.ok) throw new Error("Critical: Semua mesin down.");
            const groqData = await groqResponse.json();
            humanizedText = groqData.choices[0].message.content.trim();
        }

        // 2. ZERO-TRUST SERVER-SIDE TRUNCATION (Keamanan Paywall)
        // Di sinilah kita mengunci teks sebelum menyentuh internet
        const wordsArr = humanizedText.split(/\s+/);
        let finalResponse = {};

        // Nanti 'userTier' akan divalidasi silang dengan Database D1. Sementara kita baca dari request.
        if (userTier === 'free' && wordsArr.length > 150) {
            // Pengguna Gratis: Potong di 150 kata. Buang sisanya.
            finalResponse = {
                text: wordsArr.slice(0, 150).join(" "),
                isLocked: true,
                lockedWordCount: wordsArr.length - 150 // Hanya kirim jumlah kata yang hilang ke UI
            };
        } else {
            // Pengguna Premium (Atau teks memang pendek)
            finalResponse = {
                text: humanizedText,
                isLocked: false,
                lockedWordCount: 0
            };
        }

        // 3. ENTERPRISE SECURITY HEADERS (Mencegah serangan XSS & Sniffing)
        return new Response(JSON.stringify(finalResponse), {
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
