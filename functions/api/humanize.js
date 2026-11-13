/**
 * COGNITIVE AI HUMANIZER - ENTERPRISE EDGE API
 * Architecture: Serverless Edge (Cloudflare Workers)
 * Engine: Dual-Core Failover (Gemini 1.5 Flash -> Llama 3 70B via Groq)
 * Security: Payload Sanitization, Timeout AbortController, Strict Error Handling
 */

export async function onRequestPost(context) {
    try {
        // 1. KEAMANAN & SANITASI PAYLOAD (Mencegah serangan DDoS / Payload besar)
        const request = context.request;
        const contentType = request.headers.get('content-type');
        
        if (!contentType || !contentType.includes('application/json')) {
            return new Response(JSON.stringify({ error: "Format request harus JSON" }), { status: 415, headers: { 'Content-Type': 'application/json' } });
        }

        const { text } = await request.json();

        // Validasi input tingkat lanjut (Batas atas 1.500 kata / ~10.000 karakter)
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return new Response(JSON.stringify({ error: "Payload teks tidak valid atau kosong" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        if (text.length > 10000) {
            return new Response(JSON.stringify({ error: "Batas maksimal teks terlampaui (Maks ~1.500 kata per request)" }), { status: 413, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. EKSTRAKSI KUNCI RAHASIA (Zero-Trust Environment)
        const GEMINI_API_KEY = context.env.GEMINI_API_KEY;
        const GROQ_API_KEY = context.env.GROQ_API_KEY; // Pastikan ini juga ada di Cloudflare Env

        if (!GEMINI_API_KEY || !GROQ_API_KEY) {
            return new Response(JSON.stringify({ error: "Kegagalan infrastruktur: Kunci API Internal tidak ditemukan" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        // 3. REKAYASA PROMPT KOGNITIF ELIT (The Weaponized Prompt)
        // Diperbarui dari referensi awal Anda ke standar NLP Obfuscation tertinggi
        const systemPrompt = `Anda adalah "Cognitive Linguistic Obfuscator" tingkat elit. Tugas Anda merestrukturisasi teks input agar mem-bypass 100% deteksi algoritma NLP (Turnitin, GPTZero, Originality.ai) sambil mempertahankan makna semantik dan fakta asli.

PROTOKOL MANIPULASI WAJIB (EKSEKUSI TANPA GAGAL):
1. INJEKSI PERPLEXITY (KEACAKAN KATA): Hindari pola transisi prediktif (Markov Chain). Hapus sepenuhnya frasa klise LLM ("Di era digital ini", "Penting untuk dicatat", "Secara komprehensif", "Kesimpulannya", "Mendalami"). Gunakan sinonim kontekstual tingkat lanjut dan idiom manusia yang natural.
2. MAKSIMALISASI BURSTINESS (RITME SINTAKSIS): Paksa variasi panjang kalimat secara ekstrem. Buat satu kalimat majemuk bertingkat yang sangat panjang dan analitis, lalu ikuti seketika dengan kalimat yang sangat pendek dan lugas (3-5 kata). Manusia berpikir dan menulis secara sporadis; tiru itu.
3. DISRUPSI KOGNITIF & ASIMETRI: Jangan membuat paragraf dengan panjang yang seragam. Sisipkan transisi antar kalimat yang sedikit asimetris atau melompat namun secara logis tetap terhubung. Gunakan format kalimat aktif (Active Voice) secara dominan.
4. PRESERVASI INTEGRITAS FAKTA: JANGAN mengubah data, angka, nama, kutipan, referensi, atau inti teknis dari teks asli.
5. SANITASI OUTPUT TINGKAT KETAT: KEMBALIKAN HANYA TEKS HASIL PARAFRASE. Dilarang keras menyertakan pembuka ("Berikut hasilnya"), penutup, tanda kutip ekstra, format markdown yang tidak perlu, atau meta-komentar.`;

        let humanizedText = "";
        let usedEngine = "Gemini-1.5-Flash";

        // 4. PENGONTROL BATAS WAKTU (Mencegah fungsi gantung yang menghabiskan biaya)
        const fetchTimeout = (ms) => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), ms);
            return controller;
        };

        try {
            // ==========================================
            // ENGINE 1: PRIMARY NODE (Google Gemini)
            // ==========================================
            const geminiController = fetchTimeout(8000); // Batas maksimal 8 detik
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            
            const geminiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: geminiController.signal,
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTeks asli yang harus di-humanize:\n"""\n${text}\n"""` }] }],
                    generationConfig: {
                        temperature: 0.9, // Ditingkatkan ke 0.9 untuk keacakan maksimal
                        topK: 45,
                        topP: 0.95
                    }
                })
            });

            if (!geminiResponse.ok) throw new Error(`Gemini Fallback Triggered. HTTP Status: ${geminiResponse.status}`);
            
            const geminiData = await geminiResponse.json();
            if (!geminiData.candidates || geminiData.candidates.length === 0) throw new Error("Gemini empty response");

            humanizedText = geminiData.candidates[0].content.parts[0].text.trim();

        } catch (primaryError) {
            // ==========================================
            // ENGINE 2: FAILOVER NODE (Groq - Llama 3 70B)
            // ==========================================
            console.warn("Primary Engine Failed. Switching to Groq Node...", primaryError.message);
            usedEngine = "Groq-Llama3-70B";
            
            const groqController = fetchTimeout(6000); // Groq sangat cepat, kita set batas 6 detik
            const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
            
            const groqResponse = await fetch(groqUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                signal: groqController.signal,
                body: JSON.stringify({
    model: "openai/gpt-oss-120b", // <-- Diperbarui sesuai akses arsenal Groq Anda
    messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Teks asli yang harus di-humanize:\n"""\n${text}\n"""` }
    ],
    temperature: 0.95, // Suhu dinaikkan sedikit ke 0.95 karena model 120B sangat pintar dan butuh dorongan ekstra untuk menjadi 'kreatif/acak'
    max_tokens: 3000
})
            });

            if (!groqResponse.ok) {
                // Jika kedua mesin hancur (Sangat jarang terjadi)
                throw new Error("Critical Failure: Kedua mesin AI gagal merespons. Sistem overload.");
            }

            const groqData = await groqResponse.json();
            humanizedText = groqData.choices[0].message.content.trim();
        }

        // 5. PENAYANGAN HASIL (Dengan header standar Enterprise CORS)
        return new Response(JSON.stringify({ 
            result: humanizedText,
            engine: usedEngine // Memudahkan Anda melacak mesin mana yang mengeksekusi request di Network Tab
        }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
            }
        });

    } catch (error) {
        // Logika penanganan error level sistem
        const isTimeout = error.name === 'AbortError';
        return new Response(JSON.stringify({ 
            error: isTimeout ? "Waktu koneksi habis (Timeout). Silakan coba lagi." : error.message 
        }), {
            status: isTimeout ? 504 : 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
