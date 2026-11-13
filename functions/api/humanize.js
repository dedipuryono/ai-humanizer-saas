/**
 * COGNITIVE AI HUMANIZER - ENTERPRISE EDGE API v4.0 (FINAL)
 * Features: D1 SQL IP Tracking, Smart Payload Truncation, The Trapdoor Paywall
 * Engine: Dual-Core Failover (Gemini 1.5 Flash -> GPT-OSS-120B)
 * Intelligence: Maximum Cognitive Disruption Prompt Restored
 */

export async function onRequestPost(context) {
    try {
        const request = context.request;
        const DB = context.env.DB; // Binding ke stealth_core_db
        
        // 1. FINGERPRINTING & IDENTIFIKASI
        const clientIP = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
        const userAgent = request.headers.get('User-Agent') || 'unknown';
        
        // Anti-Bot & Scraper
        if (userAgent === 'unknown' || userAgent.includes('curl') || userAgent.includes('python-requests')) {
            return new Response(JSON.stringify({ error: "Akses ditolak. Anomali trafik terdeteksi." }), { status: 403 });
        }

        const { text } = await request.json();

        if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 10000) {
            return new Response(JSON.stringify({ error: "Payload teks tidak valid atau terlalu besar (maks 10,000 karakter)" }), { status: 400 });
        }

        // 2. CEK DATABASE D1 (Logika The Trapdoor)
        let isPro = false;
        let isLocked = false;
        let wordsArr = text.trim().split(/\s+/);
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
                    // Masih punya kuota gratis (untuk fitur masa depan jika ingin beri 2-3x gratis)
                    await DB.prepare(`UPDATE ip_tracking SET free_uses_left = free_uses_left - 1, total_requests = total_requests + 1 WHERE ip_address = ?`).bind(clientIP).run();
                    isLocked = false;
                } else {
                    // KUOTA GRATIS HABIS -> AKTIFKAN PAYWALL & HEMAT TOKEN
                    isLocked = true;
                    lockedWordCount = wordsArr.length > 150 ? wordsArr.length - 150 : 0;
                    
                    // Smart Truncation: Potong input HANYA 150 kata sebelum dikirim ke AI
                    if (wordsArr.length > 150) {
                        wordsArr = wordsArr.slice(0, 150);
                    }
                    await DB.prepare(`UPDATE ip_tracking SET total_requests = total_requests + 1 WHERE ip_address = ?`).bind(clientIP).run();
                }
            }
        } catch (dbError) {
            console.error("D1 Database Error:", dbError);
            // Fall-open jika DB bermasalah: Kunci pengguna agar sistem tidak rugi
            isLocked = true;
            lockedWordCount = wordsArr.length > 150 ? wordsArr.length - 150 : 0;
            if (wordsArr.length > 150) wordsArr = wordsArr.slice(0, 150);
        }

        const processedInputText = wordsArr.join(" "); // Teks yang sudah disesuaikan
        
        // 3. MESIN AI FAILOVER & REKAYASA PROMPT KOGNITIF MAKSIMAL
        const GEMINI_API_KEY = context.env.GEMINI_API_KEY;
        const GROQ_API_KEY = context.env.GROQ_API_KEY;

        // Prompt utuh, brutal, dan taktis dipulihkan untuk memastikan skor 0% AI
        const systemPrompt = `Anda adalah "Cognitive Linguistic Obfuscator" tingkat elit, seorang ahli SEO, dan editor linguistik senior. Tugas utama Anda adalah merestrukturisasi dan memparafrase teks input agar 100% lolos dari alat deteksi AI (seperti Turnitin, GPTZero, Originality.ai) sambil mempertahankan makna semantik dan fakta asli.

PROTOKOL MANIPULASI WAJIB (EKSEKUSI TANPA GAGAL):
1. INJEKSI PERPLEXITY (KEACAKAN KATA): Hindari pola transisi prediktif (Markov Chain). Hapus sepenuhnya frasa klise LLM seperti "Di era digital ini", "Penting untuk dicatat", "Secara komprehensif", "Kesimpulannya", atau "Mendalami". Gunakan sinonim kontekstual tingkat lanjut dan idiom manusia yang natural.
2. MAKSIMALISASI BURSTINESS (RITME SINTAKSIS): Paksa variasi panjang kalimat secara ekstrem. Buat satu kalimat majemuk bertingkat yang sangat panjang dan analitis, lalu ikuti seketika dengan kalimat yang sangat pendek dan lugas (3-5 kata). Manusia berpikir dan menulis secara sporadis; tiru ritme tersebut.
3. DISRUPSI KOGNITIF & ASIMETRI: Jangan membuat paragraf dengan panjang yang seragam. Sisipkan transisi antar kalimat yang sedikit asimetris atau melompat namun secara logis tetap terhubung. Gunakan format kalimat aktif (Active Voice) secara dominan. Sesekali gunakan gaya penulisan opini jika konteksnya akademik, atau gaya percakapan ringan jika non-akademik.
4. PRESERVASI INTEGRITAS FAKTA: JANGAN mengubah data, angka, nama, kutipan, referensi, atau inti teknis dari teks asli.
5. SANITASI OUTPUT KETAT: KEMBALIKAN HANYA TEKS HASIL PARAFRASE. Dilarang keras menyertakan pembuka seperti "Berikut hasilnya", penutup, tanda kutip ekstra, format markdown yang tidak perlu, atau meta-komentar.`;

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
                    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTeks asli yang harus di-humanize:\n"""\n${processedInputText}\n"""` }] }],
                    generationConfig: { temperature: 0.9, topK: 45, topP: 0.95 }
                })
            });

            if (!geminiResponse.ok) throw new Error("Gemini Fallback Triggered");
            const geminiData = await geminiResponse.json();
            
            if (!geminiData.candidates || geminiData.candidates.length === 0) throw new Error("Gemini empty response");
            humanizedText = geminiData.candidates[0].content.parts[0].text.trim();

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
                        { role: "user", content: `Teks asli yang harus di-humanize:\n"""\n${processedInputText}\n"""` }
                    ],
                    temperature: 0.95,
                    max_tokens: 3000
                })
            });

            if (!groqResponse.ok) throw new Error("Critical: Semua mesin down.");
            const groqData = await groqResponse.json();
            humanizedText = groqData.choices[0].message.content.trim();
        }

        // 4. PENAYANGAN HASIL (Enterprise Security Headers)
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
